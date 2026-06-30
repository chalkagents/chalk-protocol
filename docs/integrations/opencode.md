# Using opencode as a Chalk executor

[opencode](https://github.com/sst/opencode) (SST's open-source AI coding agent) is a **Layer-1**
coding agent: it reads a prompt, edits the working tree, and stops. **Chalk Protocol** is the
**Layer-2** harness around it — it owns project state (`.chalk/`) and the enforceable gates
(`verify`, `done`, adversarial review, held-out regression). Because Chalk is BYO-CLI (the agent
is a *swappable executor*), opencode plugs in wherever Chalk needs a model: as the unattended
work executor (`protocol.executor`) and as the JSON-contract roles (`review` / `discovery` /
`feedback`). Chalk holds opencode to the fundamentals; opencode writes the code.

## Prerequisites

- **opencode on PATH** — `opencode --version` should resolve. (Override the binary with
  `CHALK_OPENCODE_BIN` if it lives elsewhere.)
- **A model/provider configured** in opencode, e.g. `anthropic/claude-opus-4-8`. Verify with a
  one-off `opencode run "say hi" -m anthropic/claude-opus-4-8`.
- A Chalk project (`node bin/chalk.mjs init …`) with `protocol.verify` commands set, so the
  gates have a real toolchain to run.

## Executor setup

The executor is what `chalk run` invokes on each runnable task. Chalk pipes `chalk context` to it
**on stdin**, lets it edit the worktree, and **ignores its exit code** — the verify gate, not the
agent's self-report, decides success (this preserves P4). opencode's `run`, however, takes the
prompt as an **argv element**, not stdin. The bundled adapter bridges that gap, so the (often
multi-line, brace- and quote-laden) context never goes through a shell.

Recommended config in `.chalk/chalk.json`:

```json
"protocol": {
  "executor": { "command": "node bin/adapters/opencode-exec.mjs" }
}
```

`opencode-exec.mjs` reads stdin, builds `opencode run --auto …` with the prompt as the verbatim
last argv element, and streams opencode's stdout/stderr through.

### Adapter environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CHALK_OPENCODE_BIN` | `opencode` | Binary to spawn |
| `CHALK_OPENCODE_MODEL` | (opencode default) | Passed as `-m <model>`, e.g. `anthropic/claude-opus-4-8` |
| `CHALK_OPENCODE_ATTACH` | (none) | Warm-server URL, passed as `--attach <url>` |

Example invocation:

```sh
CHALK_OPENCODE_MODEL=anthropic/claude-opus-4-8 node bin/chalk.mjs run
```

### Inline alternative (simpler, fragile)

You *can* skip the adapter and inline the command:

```json
"protocol": {
  "executor": { "command": "opencode run \"$(cat)\" --auto -m anthropic/claude-opus-4-8" }
}
```

This works, but `"$(cat)"` round-trips the whole context through the shell, so backticks, `$VAR`,
embedded quotes, and newlines in the criteria can be mangled or re-interpreted. The adapter takes
the stdin→argv path directly (the context is passed as one unmodified argv element), which is why
it's preferred for anything beyond a quick smoke.

## Warm server (latency)

Each adapter call spawns a fresh `opencode run`. Across a long `chalk pipeline` that startup cost
adds up. Run opencode as a persistent server and point the adapter at it so tasks reuse one
process:

```sh
opencode serve            # starts a server, e.g. on http://localhost:4096
export CHALK_OPENCODE_ATTACH=http://localhost:4096
node bin/chalk.mjs run    # every executor call now attaches to the warm server
```

The adapter forwards this as `--attach http://localhost:4096`. (Confirm the actual port/URL from
`opencode serve`'s output.)

## JSON-contract roles (review / discovery / feedback)

Chalk's `review`, `discovery`, and `feedback` roles are *contract* agents: they read a prompt on
stdin and must return a **single JSON object** on stdout. Chalk parses that stdout leniently — it
scans for the JSON with a `/\{[\s\S]*\}/`-style match — which over-captures when a chatty agent
emits log lines with stray braces or wraps the object in a ```` ```json ```` fence.

Use `opencode-json.mjs` for these roles instead of the raw binary. It (1) appends a strict
"respond with ONLY a single JSON object — no prose, no fences" instruction to the prompt, and
(2) runs opencode's stdout through `extractJson`, a balanced-brace, fence-stripping scanner. On
success it prints **pure JSON** (exit 0) so Chalk's parser gets a clean object even when opencode
adds prose or fences; on failure it passes the raw stdout through and exits non-zero.

Example config:

```json
"protocol": {
  "executor": { "command": "node bin/adapters/opencode-exec.mjs" },
  "review":   { "command": "node bin/adapters/opencode-json.mjs", "required": true },
  "discovery":{ "command": "node bin/adapters/opencode-json.mjs" },
  "feedback": { "command": "node bin/adapters/opencode-json.mjs" }
}
```

The same `CHALK_OPENCODE_BIN` / `CHALK_OPENCODE_MODEL` / `CHALK_OPENCODE_ATTACH` env vars apply.
The review role expects `{"verdict":"pass"|"block","findings":[…]}`; discovery expects
`{"tasks":[…]}`; feedback expects `{"issues":[…]}`.

## Validation

- **Smoke the real pipeline** on a scratch repo:
  ```sh
  node bin/chalk.mjs smoke --create --yes
  ```
  `smoke` performs real `gh` actions (PR + squash-merge), so point it at a throwaway repo. With
  the adapters configured, this proves opencode drives the full loop end-to-end.
- **Lifecycle demo** — `examples/lifecycle-demo.sh` wires tiny stub agents into a temp repo to
  exercise the whole product lifecycle offline. Swap the stub executor
  (`executor:{command:"node .chalk/a-executor.mjs"}`) for
  `node bin/adapters/opencode-exec.mjs` (and the stub JSON agents for
  `node bin/adapters/opencode-json.mjs`) to run it against real opencode.

## Caveats

- **opencode moves fast.** Flags and behavior change between releases — pin a known-good version
  and re-test the adapters after upgrading.
- **`--auto` permission scope.** The adapter runs opencode with `--auto`, which lets it edit files
  and run tools without prompting. Run it in a worktree/scratch checkout (as `chalk run` /
  `chalk pipeline` do) and review diffs via the gates — never point it at an unprotected repo.
- **Over-capture risk.** opencode's conversational stdout can contain braces in log lines or fence
  the JSON. `extractJson` (via `opencode-json.mjs`) mitigates this with a balanced-brace scanner,
  but if a contract role ever returns `error`, inspect the raw stdout — the model may have emitted
  no JSON object at all.
