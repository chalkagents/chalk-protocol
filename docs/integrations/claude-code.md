# Claude Code adapter

<!-- adapter-manifest claude roles=executor,planner,reviewer,discovery,feedback,retro,handoff,pr-narrative,regression-author access=read-only,workspace-write output=text,json,none -->

The first-party Claude Code adapter implements `chalk-agent-adapter/1` for every canonical role.
Its capabilities above are checked against the exported manifest by the documentation tests.

Install Claude Code and authenticate in its own CLI, then connect it without making a model call:

```sh
npm install -g @anthropic-ai/claude-code
claude
chalk connect --preset autonomous --builder claude --reviewer claude
chalk agent test claude
```

For an independent reviewer, choose a profile with a different explicit identity—for example a
different adapter—rather than relying on Chalk to infer model families:

```sh
chalk connect --preset autonomous --builder claude --reviewer codex --replace
```

The adapter maps `workspace-write` to Claude's `acceptEdits` permission mode and `read-only` to
`plan`. It requests JSON output, normalizes structured role results and usage, redacts provider
diagnostics, and never stores credentials. Optional profile `options.model` is forwarded unchanged;
Chalk does not choose or parse a model name.

Legacy `chalk init --executor claude` and `chalk agents --claude` remain supported compatibility
paths. They install the historical project agent definitions and raw command wiring. Existing
projects do not need to migrate; see [the migration guide](../MIGRATING_TO_AGENT_PROFILES.md).

See the [capability matrix](../PROVIDER_MATRIX.md), [Connect guide](../CONNECT.md), and
[Protocol v1](../AGENT_ADAPTER_PROTOCOL.md).
