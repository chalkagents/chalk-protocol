# Connect agent CLIs

`chalk connect` discovers first-party adapter manifests and locally installed CLIs, then writes
provider-neutral `protocol.agents.profiles` and `protocol.agents.roles` configuration. Discovery and
default validation are offline: they inspect executable, version, and local authentication status
only. They never send a prompt or incur model cost.

Start the interactive wizard in a terminal:

```sh
chalk connect
```

The three presets control role assignment, not the provider:

- `manual` binds only the builder/executor; an explicitly selected reviewer is optional.
- `assisted` binds executor and planner plus a reviewer and enables per-task review.
- `autonomous` binds every role the builder adapter supports, assigns the selected reviewer, and
  enables per-task review.

For CI or scripted setup, make every choice explicit:

```sh
chalk connect --preset assisted --builder codex --reviewer gemini
chalk connect --preset autonomous --builder claude --reviewer codex \
  --builder-model opaque-builder-id --reviewer-model opaque-reviewer-id
```

Use `--builder-profile` and `--reviewer-profile` to name multiple connections to the same adapter.
Use `--binary adapter=/absolute/path` for a non-PATH CLI. Model values are optional opaque strings;
Chalk forwards them without parsing or selecting a commercial model.

## Safe retrofit and reruns

Connect is additive and idempotent. Existing profiles, role bindings, and legacy command fields are
preserved. A rerun reports preserved values instead of clobbering manual edits. `--replace` is the
explicit opt-in to replace named profiles or role bindings. `--migrate-legacy` is the separate,
explicit opt-in to clear legacy command fields for roles that were successfully rebound. Use
`--dry-run` to preview either operation.

```sh
chalk connect --preset assisted --builder codex --reviewer gemini --dry-run
chalk connect --preset assisted --builder codex --reviewer gemini --replace --migrate-legacy
```

Reviewer independence is explained in provider-neutral terms. Distinct configured identities pass;
the same or unknown identity produces a warning with the exact command shape for choosing a separate
reviewer profile.

## Validation and live smoke test

List offline discovery results:

```sh
chalk connect --list
chalk connect --list --json
```

Test the adapter protocol without reaching the provider:

```sh
chalk agent test codex
```

Only `--live` permits one real model call, which may incur provider cost:

```sh
chalk agent test codex --live
```

Missing executables, failed local authentication checks, unsupported roles, and ambiguous multi-CLI
detection all print a concrete install, login, selection, or rebinding command. Chalk does not log in
to providers and never stores their credentials; authentication remains owned by each installed CLI.
