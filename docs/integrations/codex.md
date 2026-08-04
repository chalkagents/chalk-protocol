# Codex CLI adapter

<!-- adapter-manifest codex roles=executor,planner,reviewer access=read-only,workspace-write output=text,json -->

The first-party Codex adapter implements `chalk-agent-adapter/1` for `executor`, `planner`, and
`reviewer`. Install and authenticate Codex CLI separately; Chalk never reads, copies, or stores its
credentials. The adapter reuses the CLI's existing login exactly as `codex exec` does.

Configure a named profile with `chalk connect`, which discovers the CLI offline:

```sh
npm install -g @openai/codex
codex login
chalk connect --preset assisted --builder codex --reviewer codex
chalk agent test codex
```

The capabilities in the manifest comment above are checked against the exported adapter manifest
by the documentation tests. Equivalent manual profile wiring is:

```json
{
  "adapter": "codex",
  "command": "node node_modules/chalk-protocol/bin/adapters/codex.mjs",
  "identity": { "displayName": "Codex CLI" },
  "capabilities": {
    "roles": ["executor", "planner", "reviewer"],
    "access": ["read-only", "workspace-write"],
    "output": ["text", "json"]
  },
  "options": {}
}
```

`options.model` is optional opaque configuration. When present, the adapter forwards it unchanged
to `codex exec --model` and reports it only as display metadata. It never derives reviewer
independence from that value; configure an explicit profile `identity.independenceKey` only when the
identity has been independently verified.

The adapter passes canonical instructions as the `codex exec` prompt and multiline run context on
stdin. It maps access to `--sandbox read-only|workspace-write`, disables interactive approval
prompts, consumes JSONL events, normalizes reported usage, and uses Codex's output schema option for
the reviewer contract. See the official [Codex non-interactive mode documentation](https://developers.openai.com/codex/noninteractive).

Verify the installed package without a model call:

```sh
chalk adapter conformance --adapter codex
```

See the [capability matrix](../PROVIDER_MATRIX.md), [Connect guide](../CONNECT.md), and
[migration guide](../MIGRATING_TO_AGENT_PROFILES.md).
