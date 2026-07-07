---
generator: chalk-protocol
id: "task-b9b5128a"
name: "feat: configurable e2e spec pattern (not just *.test.yaml)"
overview: "protocol.e2e.specPattern selects which locked test paths are browser specs: a suffix, a comma-separated list, or an array; a leading '*' is tolerated (glob-ish). Empty/unset preserves the historical '.test.yaml' so existing projects are unchanged."
created: "2026-07-06T10:05:49.983Z"
todos:
  - id: "task-b9b5128a-c1"
    content: "protocol.e2e.specPattern selects which locked test paths are browser specs: a suffix, a comma-separated list, or an array; a leading '*' is tolerated (glob-ish). Empty/unset preserves the historical '.test.yaml' so existing projects are unchanged."
    status: pending
  - id: "task-b9b5128a-c2"
    content: "The pattern is honored everywhere isSpec decides spec-ness: verify's e2e gate, the e2e runner's filter, doctor's 'locks a spec but e2e is off' warning, and the board's testArtifact evidence lookup."
    status: pending
  - id: "task-b9b5128a-c3"
    content: "Under a custom pattern, a matching locked spec actually runs through verify's BYO e2e gate (producing run evidence); a non-matching path is treated as an ordinary file and never run as a spec."
    status: pending
  - id: "task-b9b5128a-c4"
    content: "Locked test proves the matcher normalization (default/suffix/list/array/leading-*) and the end-to-end verify effect in both directions (custom pattern runs it; default does not)."
    status: pending
---

# feat: configurable e2e spec pattern (not just *.test.yaml)

> state: **in-progress** · phase: discovery

## Objective

- protocol.e2e.specPattern selects which locked test paths are browser specs: a suffix, a comma-separated list, or an array; a leading '*' is tolerated (glob-ish). Empty/unset preserves the historical '.test.yaml' so existing projects are unchanged.
- The pattern is honored everywhere isSpec decides spec-ness: verify's e2e gate, the e2e runner's filter, doctor's 'locks a spec but e2e is off' warning, and the board's testArtifact evidence lookup.
- Under a custom pattern, a matching locked spec actually runs through verify's BYO e2e gate (producing run evidence); a non-matching path is treated as an ordinary file and never run as a spec.
- Locked test proves the matcher normalization (default/suffix/list/array/leading-*) and the end-to-end verify effect in both directions (custom pattern runs it; default does not).

## Locked tests (read-only — P6)

- `test/e2e-spec-pattern.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
