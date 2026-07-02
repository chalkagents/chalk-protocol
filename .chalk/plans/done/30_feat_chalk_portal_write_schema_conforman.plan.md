---
generator: chalk-protocol
id: "task-3a4398cc"
name: "feat: chalk portal — write schema-conformant .project files from the spine"
overview: "chalk portal [--out <dir>] [--slug <slug>] writes four schema-conformant files (projects/<slug>.yaml, scope/defined.yaml, updates/extracted.yaml, milestones.yaml) under the out dir (default .project) from portalModel"
created: "2026-06-28T22:26:36.022Z"
todos:
  - id: "task-3a4398cc-c1"
    content: "chalk portal [--out <dir>] [--slug <slug>] writes four schema-conformant files (projects/<slug>.yaml, scope/defined.yaml, updates/extracted.yaml, milestones.yaml) under the out dir (default .project) from portalModel"
    status: done
  - id: "task-3a4398cc-c2"
    content: "the files are valid YAML (JSON is valid YAML; written pretty) and contain the mapped scope/milestones/updates; the command reports the counts written"
    status: done
  - id: "task-3a4398cc-c3"
    content: "true"
    status: done
  - id: "task-3a4398cc-c4"
    content: "protocol.portal default { dir: '.project' } in store.mjs init defaults"
    status: done
---

# feat: chalk portal — write schema-conformant .project files from the spine

> state: **done** · phase: discovery

## Objective

- chalk portal [--out <dir>] [--slug <slug>] writes four schema-conformant files (projects/<slug>.yaml, scope/defined.yaml, updates/extracted.yaml, milestones.yaml) under the out dir (default .project) from portalModel
- the files are valid YAML (JSON is valid YAML; written pretty) and contain the mapped scope/milestones/updates; the command reports the counts written
- true
- protocol.portal default { dir: '.project' } in store.mjs init defaults

## Locked tests (read-only — P6)

- `test/portal-cli.test.mjs`

## Reviews

- **pass** · 2026-06-28T22:38 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
