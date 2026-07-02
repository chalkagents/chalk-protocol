---
generator: chalk-protocol
id: "task-918646d8"
name: "feat: init hardening — preset auto-detect default, vacuous-verify warning, --verify-test/--bare, next-steps epilogue, presets set breakTest"
overview: "bare chalk init auto-detects the stack preset from marker files by default and labels it (auto-detected); explicit --preset wins; --bare opts out"
created: "2026-07-02T05:00:52.992Z"
todos:
  - id: "task-918646d8-c1"
    content: "bare chalk init auto-detects the stack preset from marker files by default and labels it (auto-detected); explicit --preset wins; --bare opts out"
    status: done
  - id: "task-918646d8-c2"
    content: "init with no detectable stack warns loudly about VACUOUS verify (exit 0); --bare acknowledges and silences; --verify-test <cmd> sets verify.test inline"
    status: done
  - id: "task-918646d8-c3"
    content: "chalk verify prints a VACUOUS label whenever green rests on zero configured commands (exit code unchanged); honest greens are unlabeled"
    status: done
  - id: "task-918646d8-c4"
    content: "presets with a truthful per-file test command set protocol.breakTest by default (node/flutter/dart/python; go deliberately omitted)"
    status: done
  - id: "task-918646d8-c5"
    content: "init always ends with the numbered next-steps block naming task add, spec+lock, start, verify/done, doctor and demo"
    status: done
---

# feat: init hardening — preset auto-detect default, vacuous-verify warning, --verify-test/--bare, next-steps epilogue, presets set breakTest

> state: **done** · phase: discovery

## Objective

- bare chalk init auto-detects the stack preset from marker files by default and labels it (auto-detected); explicit --preset wins; --bare opts out
- init with no detectable stack warns loudly about VACUOUS verify (exit 0); --bare acknowledges and silences; --verify-test <cmd> sets verify.test inline
- chalk verify prints a VACUOUS label whenever green rests on zero configured commands (exit code unchanged); honest greens are unlabeled
- presets with a truthful per-file test command set protocol.breakTest by default (node/flutter/dart/python; go deliberately omitted)
- init always ends with the numbered next-steps block naming task add, spec+lock, start, verify/done, doctor and demo

## Locked tests (read-only — P6)

- `test/init-onboard.test.mjs`

## Reviews

- **block** · 2026-07-02T05:47 · adversary
- **pass** · 2026-07-02T05:51 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
