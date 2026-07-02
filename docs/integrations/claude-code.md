# Claude Code as the chalk agent suite

Chalk's BYO-agent contract is plain stdin/stdout, and Claude Code's `claude -p` fits it directly.
This is the wiring this repo uses to build itself.

## The fast path

```sh
chalk init --executor claude        # new project: wires everything below automatically
# or, on an already-inited project:
chalk agents --claude               # installs the agent files; wire the commands as shown below
```

Requires the [`claude` CLI](https://claude.com/claude-code) on PATH and an authenticated session.

## What gets installed

Four agent definitions land in **your project's** `.claude/agents/` (write-if-absent — your edits
are never clobbered). They ship inside the npm package under `share/agents/` and are byte-for-byte
the agents this repo runs on itself (minus repo-local skill references):

| Agent | Role | Wired to |
|---|---|---|
| `chalk-executor` | implements ONE task to green | `protocol.executor.command` |
| `chalk-planner` | read-only: surveys code, emits a plan | `protocol.planner.command` |
| `chalk-reviewer` | adversarial P5 gate: tries to REFUTE the change, JSON verdict | `protocol.review.command` |
| `chalk-retro` | read-only: run digest → lessons + improvement issues | `protocol.retro.command` |

## The command wiring (what `--executor claude` writes)

```jsonc
// .chalk/chalk.json → protocol
"executor": { "command": "claude -p --agent chalk-executor --permission-mode acceptEdits --max-turns 40" },
"planner":  { "command": "claude -p --agent chalk-planner --max-turns 30" },
"review":   { "command": "claude -p --agent chalk-reviewer --max-turns 20", "requiredAt": ["per-task"] },
"retro":    { "command": "claude -p --agent chalk-retro --max-turns 20" }
```

`--max-turns` bounds a runaway session; `requiredAt: ["per-task"]` makes the adversarial review a
gate, not a suggestion — an executor without an adversary isn't the protocol.

## Permission modes

- **`--permission-mode acceptEdits`** (the default wiring): the executor can edit files and run
  the toolchain in its worktree without prompting, but stays inside Claude Code's guardrails.
  This is the right mode for `chalk run` — the verify/review gates judge the result.
- **`bypassPermissions`** removes prompts entirely — only inside a sandbox/container you'd let an
  intern have root in.
- **Plan mode is wrong for the executor** (it refuses to edit); it's fine for the planner, which
  is read-only by design (its agent definition carries read-only tools anyway).

## Cross-model review (recommended)

A reviewer sharing the executor's model self-prefers and shares its blind spots — `chalk doctor`
warns when the two commands resolve to the same model family. If you can, point the reviewer at a
different family, e.g.:

```jsonc
"review": { "command": "claude -p --agent chalk-reviewer --model claude-opus-4-8 --max-turns 20", "requiredAt": ["per-task"] }
```

or swap in another vendor's CLI entirely (see [opencode](./opencode.md)) — any command that reads
the prompt on stdin and prints the JSON verdict works.

## Cost visibility

Every agent call is metered into `.chalk/local/cost.jsonl` (wall-clock, per stage); `chalk cost`
summarizes. On a subscription, calls + wall-clock are the practical spend proxy; on the API, watch
the Console. `chalk run --max N` bounds a sweep.
