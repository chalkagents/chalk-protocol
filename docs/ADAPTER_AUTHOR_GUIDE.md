# Adapter author guide

An adapter is a small executable that translates Chalk's provider-neutral role request into one
agent invocation. Chalk owns workflow and gate decisions; the adapter owns provider flags,
transport decoding, and honest normalization. The normative contract is
[Agent Adapter Protocol v1](./AGENT_ADAPTER_PROTOCOL.md), identifier `chalk-agent-adapter/1`.

## Entrypoint and transport

Ship an executable command that reads exactly one UTF-8 JSON request from stdin and writes exactly
one Protocol v1 JSON response to stdout. Put human diagnostics on stderr. Never interpolate
`instructions`, `context`, or `adapterOptions` into shell source; pass them as process data. Work in
`request.workingDirectory` and enforce `timeoutMs`.

Your package should expose a stable executable or documented command and include every runtime
file in its published artifact. A practical package layout is:

```text
package.json
bin/my-adapter.mjs
lib/provider-client.mjs
README.md
LICENSE
```

Before publishing, inspect `npm pack --dry-run` (or the equivalent package manifest) and invoke the
packed entrypoint from a clean directory.

## Manifest and discovery

A first-party adapter exports a manifest consumed by Chalk's registry. It declares `id`,
`displayName`, `binary`, supported `roles`, `capabilities.access`, `capabilities.output`, the adapter
`command`, human-safe `installCommand` and `authCommand`, and an offline `probe`. Discovery probes
may check executable presence, version, and local authentication status; they must not make a model
call. Credentials remain owned by the provider CLI.

External adapters do not need to enter Chalk's registry. Configure their executable as a named
profile and run conformance by command.

## Implement and run conformance

Intercept Chalk's public conformance fixtures before normal provider invocation:

```js
import {
  conformanceFixtureOutcome,
  emitConformanceFixture,
} from 'chalk-protocol/lib/adapters/conformance-fixtures.mjs';

const request = readFileSync(0, 'utf8');
if (!emitConformanceFixture(conformanceFixtureOutcome(request, 'my-adapter'))) {
  // Parse Protocol v1, invoke the provider, and emit one normalized response.
}
```

Run the offline contract suite:

```sh
chalk adapter conformance --command "node ./bin/my-adapter.mjs"
chalk adapter conformance --command "node ./bin/my-adapter.mjs" --json
```

It checks multiline transport, text and structured outputs, malformed/noisy output, non-zero exit,
timeouts, missing and present usage, identity, diagnostics, capability refusal, both access modes,
and read-only mutation detection. `--live` is separate and explicitly permits one provider call;
never use it in offline conformance CI. See the [conformance reference](./ADAPTER_CONFORMANCE.md).

## Normalization checklist

- **Diagnostics:** return bounded `code`, `message`, `retryable`, and optional `level` values.
  Redact API keys, tokens, passwords, credentials, environment secrets, and provider payloads that
  may contain them. Never write secrets to stdout, stderr, or Chalk state.
- **Identity:** emit only values actually configured or reported. `independenceKey` is opaque and
  case-sensitive; do not infer it from provider, binary, model spelling, or environment variables.
- **Usage:** report only available, non-negative normalized fields: `inputTokens`, `outputTokens`,
  `cacheReadTokens`, `cacheWriteTokens`, `costUsd`, and `turns`. Missing means unavailable, not zero.
- **Security and permissions:** reject an unsupported role, access mode, or output kind before any
  model call. Map read-only/workspace-write to native controls, but expect Chalk to verify that a
  read-only call did not mutate the workspace. Never write outside the supplied workspace or edit
  Chalk state, locked tests, or gates on the adapter's own authority.
- **Output:** stdout contains one response object only. Provider logs belong on bounded stderr.
  `status: ok` reports adapter completion, never that the task or acceptance criteria passed.

Use the [capability matrix](./PROVIDER_MATRIX.md) and bundled adapters as concrete examples, while
keeping provider-specific knowledge behind your adapter boundary.
