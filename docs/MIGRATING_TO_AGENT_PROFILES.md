# Migrating legacy commands to agent profiles

Migration is optional. Existing `protocol.*.command` projects remain supported through the
`raw-command` compatibility adapter and do not need an immediate rewrite. Chalk preserves the old
working directory, stdin prompt, output parsing, timeout, and buffer behavior.

## Legacy field mapping

| Canonical role | Existing field |
|---|---|
| executor | `protocol.executor.command` |
| planner | `protocol.planner.command` |
| reviewer | `protocol.review.command` |
| discovery | `protocol.discovery.command` |
| feedback | `protocol.feedback.command` |
| retro | `protocol.retro.command` |
| handoff | `protocol.handoff.command` |
| pr-narrative | `protocol.prbody.command` |
| regression-author | `protocol.regression.authorCommand` |

At runtime each populated legacy field is normalized into an internal raw-command profile. You may
leave some or all of these fields in place indefinitely while adopting named profiles for other
roles.

## Safe migration

Preview a provider-neutral setup without writing configuration:

```sh
chalk connect --preset assisted --builder codex --reviewer gemini --dry-run
```

Plain `chalk connect` is additive and idempotent: it preserves existing profiles, role bindings,
and all legacy fields. The two destructive-looking choices are separate and explicit:

- `--replace` permits replacement of conflicting named profiles and role bindings.
- `--migrate-legacy` clears only legacy fields whose roles were successfully rebound.

Use both only after reviewing the dry run:

```sh
chalk connect --preset assisted --builder codex --reviewer gemini --replace --migrate-legacy
chalk doctor
```

To remain completely provider-neutral or integrate an unbundled agent, define a named
`raw-command` profile:

```json
{
  "agents": {
    "version": 1,
    "profiles": {
      "builder": {
        "adapter": "raw-command",
        "command": "my-agent --write",
        "identity": { "displayName": "Local builder" },
        "options": {}
      }
    },
    "roles": { "executor": "builder" }
  }
}
```

## Existing `--executor` setup

`chalk init --executor claude` and `chalk init --executor opencode` remain compatibility bootstrap
options; `chalk init --executor none` remains the explicit no-agent choice. They are not removed or
silently rewritten. For new provider-neutral setup, use `chalk init` followed by `chalk connect`.
An existing `--executor` project can keep its generated raw commands, or migrate later with the
same dry-run and explicit flags above.

No legacy removal date is scheduled. Any future deprecation will be announced separately with a
release boundary and a verified migration path before support changes.
