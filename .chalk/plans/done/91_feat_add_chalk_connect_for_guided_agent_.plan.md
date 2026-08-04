---
generator: chalk-protocol
id: "task-ffc05b83"
name: "feat: add chalk connect for guided agent setup and role assignment"
overview: "`chalk connect` discovers supported installed CLIs through adapter-owned probes."
created: "2026-08-03T08:59:59.416Z"
todos:
  - id: "task-ffc05b83-c1"
    content: "`chalk connect` discovers supported installed CLIs through adapter-owned probes."
    status: done
  - id: "task-ffc05b83-c2"
    content: "Interactive setup offers manual, assisted, and autonomous presets."
    status: done
  - id: "task-ffc05b83-c3"
    content: "Users can assign different profiles to builder and reviewer roles."
    status: done
  - id: "task-ffc05b83-c4"
    content: "The flow explains and checks reviewer independence without requiring provider-specific knowledge."
    status: done
  - id: "task-ffc05b83-c5"
    content: "Setup writes provider-neutral profiles and role bindings instead of legacy command fields."
    status: done
  - id: "task-ffc05b83-c6"
    content: "Existing projects can run `chalk connect` safely; user-edited legacy commands are preserved unless migration is explicitly accepted."
    status: done
  - id: "task-ffc05b83-c7"
    content: "Non-interactive flags cover CI and scripted setup."
    status: done
  - id: "task-ffc05b83-c8"
    content: "Default validation is offline and cannot incur model cost."
    status: done
  - id: "task-ffc05b83-c9"
    content: "An explicit `chalk agent test <profile> --live` performs a real smoke call."
    status: done
  - id: "task-ffc05b83-c10"
    content: "Missing binary, missing authentication, unsupported capability, and ambiguous detection messages include exact next actions."
    status: done
  - id: "task-ffc05b83-c11"
    content: "Re-running connect is idempotent and never clobbers manually edited profile values."
    status: done
---

# feat: add chalk connect for guided agent setup and role assignment

> state: **done** · phase: discovery

## Objective

- `chalk connect` discovers supported installed CLIs through adapter-owned probes.
- Interactive setup offers manual, assisted, and autonomous presets.
- Users can assign different profiles to builder and reviewer roles.
- The flow explains and checks reviewer independence without requiring provider-specific knowledge.
- Setup writes provider-neutral profiles and role bindings instead of legacy command fields.
- Existing projects can run `chalk connect` safely; user-edited legacy commands are preserved unless migration is explicitly accepted.
- Non-interactive flags cover CI and scripted setup.
- Default validation is offline and cannot incur model cost.
- An explicit `chalk agent test <profile> --live` performs a real smoke call.
- Missing binary, missing authentication, unsupported capability, and ambiguous detection messages include exact next actions.
- Re-running connect is idempotent and never clobbers manually edited profile values.

## Locked tests (read-only — P6)

- `test/connect.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
