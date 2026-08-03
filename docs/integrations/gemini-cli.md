# Gemini CLI adapter

<!-- adapter-manifest gemini roles=executor,planner,reviewer access=read-only,workspace-write output=text,json -->

The first-party Gemini adapter implements `chalk-agent-adapter/1` for `executor`, `planner`, and
`reviewer`. Install and authenticate Gemini CLI separately; Chalk stores no API key, OAuth token,
or provider credential.

Configure a named profile with offline discovery:

```sh
npm install -g @google/gemini-cli
gemini
chalk connect --preset assisted --builder gemini --reviewer gemini
chalk agent test gemini
```

The capabilities in the manifest comment above are checked against the exported adapter manifest
by the documentation tests. Equivalent manual profile wiring is:

```json
{
  "adapter": "gemini",
  "command": "node node_modules/chalk-protocol/bin/adapters/gemini.mjs",
  "identity": { "displayName": "Gemini CLI" },
  "capabilities": {
    "roles": ["executor", "planner", "reviewer"],
    "access": ["read-only", "workspace-write"],
    "output": ["text", "json"]
  },
  "options": {}
}
```

`options.model` is optional and opaque. The adapter forwards it unchanged to `--model`; otherwise
it uses a model identity only when Gemini's JSON statistics expose one.

Canonical instructions go through the headless `--prompt` argument and multiline context goes on
stdin, so neither is evaluated as shell syntax. The adapter requests JSON output, maps read-only
roles to `--approval-mode plan`, maps workspace writes to sandboxed `--approval-mode yolo`, cleans
structured reviewer JSON, and normalizes available model statistics. See Gemini CLI's official
[headless automation guide](https://geminicli.com/docs/cli/tutorials/automation/) and
[CLI configuration reference](https://geminicli.com/docs/reference/configuration/).

Verify the installed package without a model call:

```sh
chalk adapter conformance --adapter gemini
```

See the [capability matrix](../PROVIDER_MATRIX.md), [Connect guide](../CONNECT.md), and
[migration guide](../MIGRATING_TO_AGENT_PROFILES.md).
