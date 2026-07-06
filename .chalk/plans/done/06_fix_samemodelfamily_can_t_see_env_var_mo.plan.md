---
generator: chalk-protocol
id: "task-9bfdd13a"
name: "fix: sameModelFamily can't see env-var models (CHALK_OPENCODE_MODEL) — cross-model warning inert for opencode"
overview: "sameModelFamily/modelSignature see the model of opencode-adapter commands whose model comes from the CHALK_OPENCODE_MODEL env var, so the doctor's same-model-reviewer warning can fire for opencode users"
created: "2026-07-06T06:46:13.558Z"
todos:
  - id: "task-9bfdd13a-c1"
    content: "sameModelFamily/modelSignature see the model of opencode-adapter commands whose model comes from the CHALK_OPENCODE_MODEL env var, so the doctor's same-model-reviewer warning can fire for opencode users"
    status: done
  - id: "task-9bfdd13a-c2"
    content: "the fallback stays conservative: no env var and no --model flag means no model identity (no false alarms), and a non-opencode command is unaffected"
    status: done
  - id: "task-9bfdd13a-c3"
    content: "a test covers: two opencode-adapter commands under the same CHALK_OPENCODE_MODEL → same family (warning fires); differing explicit --model still wins over the env var"
    status: done
---

# fix: sameModelFamily can't see env-var models (CHALK_OPENCODE_MODEL) — cross-model warning inert for opencode

> state: **done** · phase: discovery

## Objective

- sameModelFamily/modelSignature see the model of opencode-adapter commands whose model comes from the CHALK_OPENCODE_MODEL env var, so the doctor's same-model-reviewer warning can fire for opencode users
- the fallback stays conservative: no env var and no --model flag means no model identity (no false alarms), and a non-opencode command is unaffected
- a test covers: two opencode-adapter commands under the same CHALK_OPENCODE_MODEL → same family (warning fires); differing explicit --model still wins over the env var

## Locked tests (read-only — P6)

- `test/crossmodel-env.test.mjs`

## Reviews

- **pass** · 2026-07-06T07:30 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
