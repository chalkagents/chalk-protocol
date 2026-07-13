---
generator: chalk-protocol
id: "task-44fb4b34"
name: "docs(skills): add a chalk-add-command skill for scaffolding a new CLI command"
overview: ".claude/skills/chalk-add-command/SKILL.md exists with YAML frontmatter whose description triggers on 'add a CLI command'/'new chalk command'"
created: "2026-07-13T12:44:37.603Z"
todos:
  - id: "task-44fb4b34-c1"
    content: ".claude/skills/chalk-add-command/SKILL.md exists with YAML frontmatter whose description triggers on 'add a CLI command'/'new chalk command'"
    status: done
  - id: "task-44fb4b34-c2"
    content: "Step-by-step with the 4 wiring points: lib/<name>.mjs logic module, a method on the cmds object in bin/chalk.mjs, a help line in the help text/arg parser, and a LOCKED acceptance test in test/protocol.test.mjs or test/pipeline.test.mjs"
    status: done
  - id: "task-44fb4b34-c3"
    content: "States the test-is-contract rule (that suite IS the contract; make node --test green) and that the spine (lib/store.mjs) is the only state writer; reuse lib/* utilities"
    status: done
  - id: "task-44fb4b34-c4"
    content: "References the chalk-codebase skill for the module map"
    status: done
---

# docs(skills): add a chalk-add-command skill for scaffolding a new CLI command

> state: **done** · phase: discovery

## Objective

- .claude/skills/chalk-add-command/SKILL.md exists with YAML frontmatter whose description triggers on 'add a CLI command'/'new chalk command'
- Step-by-step with the 4 wiring points: lib/<name>.mjs logic module, a method on the cmds object in bin/chalk.mjs, a help line in the help text/arg parser, and a LOCKED acceptance test in test/protocol.test.mjs or test/pipeline.test.mjs
- States the test-is-contract rule (that suite IS the contract; make node --test green) and that the spine (lib/store.mjs) is the only state writer; reuse lib/* utilities
- References the chalk-codebase skill for the module map

## Reviews

- **pass** · 2026-07-13T13:28 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
