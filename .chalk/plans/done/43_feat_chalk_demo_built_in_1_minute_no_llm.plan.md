---
generator: chalk-protocol
id: "task-6c33ba19"
name: "feat: chalk demo — built-in 1-minute no-LLM lifecycle demo with two visible gate refusals"
overview: "chalk demo runs the full lifecycle (discover→plan→approval→work→lock→review→done→release→feedback→portal) on a throwaway temp project with stub agents, no LLM/gh/network, exiting 0"
created: "2026-07-02T05:00:52.939Z"
todos:
  - id: "task-6c33ba19-c1"
    content: "chalk demo runs the full lifecycle (discover→plan→approval→work→lock→review→done→release→feedback→portal) on a throwaway temp project with stub agents, no LLM/gh/network, exiting 0"
    status: done
  - id: "task-6c33ba19-c2"
    content: "exactly two staged gate refusals are shown on-screen (work-before-plan-approval, P6 locked-test tamper) and the refusal is labeled GATE REFUSED"
    status: done
  - id: "task-6c33ba19-c3"
    content: "the tampered locked test is caught visibly (test-integrity VIOLATED (P6)) and restored via the sanctioned narrative"
    status: done
  - id: "task-6c33ba19-c4"
    content: "the temp project is removed by default and kept with --keep; failure keeps it and prints the path"
    status: done
  - id: "task-6c33ba19-c5"
    content: "examples/lifecycle-demo.sh delegates to chalk demo (single source of truth); chalk help lists demo under setup"
    status: done
---

# feat: chalk demo — built-in 1-minute no-LLM lifecycle demo with two visible gate refusals

> state: **done** · phase: discovery

## Objective

- chalk demo runs the full lifecycle (discover→plan→approval→work→lock→review→done→release→feedback→portal) on a throwaway temp project with stub agents, no LLM/gh/network, exiting 0
- exactly two staged gate refusals are shown on-screen (work-before-plan-approval, P6 locked-test tamper) and the refusal is labeled GATE REFUSED
- the tampered locked test is caught visibly (test-integrity VIOLATED (P6)) and restored via the sanctioned narrative
- the temp project is removed by default and kept with --keep; failure keeps it and prints the path
- examples/lifecycle-demo.sh delegates to chalk demo (single source of truth); chalk help lists demo under setup

## Locked tests (read-only — P6)

- `test/demo.test.mjs`

## Reviews

- **block** · 2026-07-02T05:34 · adversary
- **pass** · 2026-07-02T05:38 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
