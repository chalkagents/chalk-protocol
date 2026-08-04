---
generator: chalk-protocol
id: "task-86837934"
name: "fix(agent-runner): detect ignored-file mutations in read-only roles"
overview: "A read-only role that edits an existing ignored file is refused and the changed path is reported."
created: "2026-08-04T11:41:45.604Z"
todos:
  - id: "task-86837934-c1"
    content: "A read-only role that edits an existing ignored file is refused and the changed path is reported."
    status: pending
  - id: "task-86837934-c2"
    content: "Creating or deleting an ignored file is also detected."
    status: pending
  - id: "task-86837934-c3"
    content: "Clean tracked, dirty tracked, and ordinary untracked mutation detection remains green."
    status: pending
  - id: "task-86837934-c4"
    content: "`.git`, `node_modules`, and `.chalk/held-out/` are never traversed or reported."
    status: pending
  - id: "task-86837934-c5"
    content: "Symlinks are hashed without following targets outside the workspace."
    status: pending
  - id: "task-86837934-c6"
    content: "Workspace-write roles remain unaffected."
    status: pending
  - id: "task-86837934-c7"
    content: "Tests exercise the public workspace-snapshot/Agent Runner seam, including ignored files."
    status: pending
---

# fix(agent-runner): detect ignored-file mutations in read-only roles

> state: **specd** · phase: discovery

## Objective

- A read-only role that edits an existing ignored file is refused and the changed path is reported.
- Creating or deleting an ignored file is also detected.
- Clean tracked, dirty tracked, and ordinary untracked mutation detection remains green.
- `.git`, `node_modules`, and `.chalk/held-out/` are never traversed or reported.
- Symlinks are hashed without following targets outside the workspace.
- Workspace-write roles remain unaffected.
- Tests exercise the public workspace-snapshot/Agent Runner seam, including ignored files.

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
