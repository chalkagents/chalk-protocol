---
generator: chalk-protocol
id: "task-76c4c9e7"
name: "feat: chalk stats --public — PII-free shareable gate-efficacy artifact (markdown + shields badge) (#156)"
overview: "chalk stats --public emits a PII-FREE markdown summary carrying the efficacy headline (gate catches, tasks reviewed, block/pass verdicts, self-report↔gate disagreement rate, verify-RED blocks, gated-landing fraction, held-out audit) and NO task titles, file paths, or task ids (the churn 'worst' list is excluded)"
created: "2026-07-09T04:36:31.284Z"
todos:
  - id: "task-76c4c9e7-c1"
    content: "chalk stats --public emits a PII-FREE markdown summary carrying the efficacy headline (gate catches, tasks reviewed, block/pass verdicts, self-report↔gate disagreement rate, verify-RED blocks, gated-landing fraction, held-out audit) and NO task titles, file paths, or task ids (the churn 'worst' list is excluded)"
    status: done
  - id: "task-76c4c9e7-c2"
    content: "chalk stats --badge emits shields.io endpoint JSON (schemaVersion, label, message = the gate-catch count, color); chalk stats --public --json emits the PII-free summary object"
    status: done
  - id: "task-76c4c9e7-c3"
    content: "The public summary is derived purely from computeStats (deterministic for a fixed spine fixture, no new tracking) and README documents it as the social-proof block"
    status: done
---

# feat: chalk stats --public — PII-free shareable gate-efficacy artifact (markdown + shields badge) (#156)

> state: **done** · phase: discovery

## Objective

- chalk stats --public emits a PII-FREE markdown summary carrying the efficacy headline (gate catches, tasks reviewed, block/pass verdicts, self-report↔gate disagreement rate, verify-RED blocks, gated-landing fraction, held-out audit) and NO task titles, file paths, or task ids (the churn 'worst' list is excluded)
- chalk stats --badge emits shields.io endpoint JSON (schemaVersion, label, message = the gate-catch count, color); chalk stats --public --json emits the PII-free summary object
- The public summary is derived purely from computeStats (deterministic for a fixed spine fixture, no new tracking) and README documents it as the social-proof block

## Locked tests (read-only — P6)

- `test/stats-public.test.mjs`

## Reviews

- **pass** · 2026-07-09T04:40 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
