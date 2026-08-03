# Agent Adapter Protocol conformance kit

The conformance kit is part of the published `chalk-protocol` package. It checks transport,
outputs, failures, capabilities, identity, usage, diagnostics, deadlines, and read-only mutation
refusal without contacting a model provider.

Run a built-in adapter with one command:

```sh
chalk adapter conformance --adapter claude
chalk adapter conformance --adapter opencode
chalk adapter conformance --adapter codex
chalk adapter conformance --adapter gemini
chalk adapter conformance --adapter raw-command
chalk adapter conformance --adapter fake
```

Run an external Protocol v1 executable the same way:

```sh
chalk adapter conformance --command "node ./my-adapter.mjs"
chalk adapter conformance --command "node ./my-adapter.mjs" --json
```

Offline mode is the default and never opts into provider or network access. The harness sends the
public `adapterOptions.conformanceFixture` convention with these values:

`multiline`, `text`, `structured`, `noisy`, `malformed`, `nonzero`, `timeout`, `missing-usage`,
`usage`, `identity`, `diagnostics`, `read-only`, `workspace-write`, `unsupported`, and `mutation`.

An external adapter can implement that convention by importing the published helper:

```js
import {
  conformanceFixtureOutcome,
  emitConformanceFixture,
} from 'chalk-protocol/lib/adapters/conformance-fixtures.mjs';

const rawRequest = readFileSync(0, 'utf8');
if (!emitConformanceFixture(conformanceFixtureOutcome(rawRequest, 'my-adapter'))) {
  // Normal provider invocation.
}
```

The mutation fixture intentionally writes inside its isolated temporary workspace while claiming a
successful read-only result. Passing conformance requires the harness to detect and refuse that
result. Fault fixtures likewise pass only when noisy/malformed output, timeouts, and capability
refusals are handled according to `chalk-agent-adapter/1`.

`--live` disables fixture injection and explicitly allows the configured adapter to contact its
provider. It runs a small text smoke check; authentication, model quality, and paid usage remain
outside conformance. Never add `--live` to an offline CI job.
