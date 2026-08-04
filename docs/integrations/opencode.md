# OpenCode adapter

<!-- adapter-manifest opencode roles=executor,planner,reviewer,discovery,feedback,retro,handoff,pr-narrative,regression-author access=read-only,workspace-write output=text,json,none -->

The first-party OpenCode adapter implements `chalk-agent-adapter/1` for every canonical role. Its
capabilities above are checked against the exported manifest by the documentation tests.

Install and authenticate OpenCode in its own CLI, then connect it offline:

```sh
npm install -g opencode-ai
opencode auth login
chalk connect --preset autonomous --builder opencode --reviewer opencode
chalk agent test opencode
```

The adapter passes the provider prompt as one argument rather than interpolating task context into
shell source. It uses `--auto` only for `workspace-write`; read-only requests omit it. Structured
roles request one JSON object, and the adapter normalizes fenced or conversational output before
returning the Protocol v1 response. Optional `options.model` and `options.attach` values are
forwarded without Chalk interpreting them.

For an independent reviewer, configure a different, independently verified explicit
`independenceKey`. A separate adapter or model alone is not proof. Chalk warns—not guesses—when
independence is unknown.

Existing raw OpenCode commands remain supported and do not require migration. See the
[migration guide](../MIGRATING_TO_AGENT_PROFILES.md), [capability matrix](../PROVIDER_MATRIX.md),
[Connect guide](../CONNECT.md), and [Protocol v1](../AGENT_ADAPTER_PROTOCOL.md).
