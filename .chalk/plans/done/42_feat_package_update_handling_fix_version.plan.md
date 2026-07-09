---
generator: chalk-protocol
id: "task-31a6ed3b"
name: "feat: package-update handling — fix --version, opt-out update notifier, chalk upgrade (#158)"
overview: "chalk --version and -v print the installed PACKAGE version (semver) and exit 0; chalk version still prints only the protocol tag (chalk/0) for scripts that parse it"
created: "2026-07-09T07:37:59.568Z"
todos:
  - id: "task-31a6ed3b-c1"
    content: "chalk --version and -v print the installed PACKAGE version (semver) and exit 0; chalk version still prints only the protocol tag (chalk/0) for scripts that parse it"
    status: done
  - id: "task-31a6ed3b-c2"
    content: "The update notifier is skip-FIRST and inert in every non-interactive/opted-out context (non-TTY, --json, CI, CHALK_NO_UPDATE_CHECK, protocol.updateCheck:false), prefers a fresh once-per-day cache over the network, and a registry failure never throws or changes a command's exit code / --json output"
    status: done
  - id: "task-31a6ed3b-c3"
    content: "chalk upgrade [--dry-run] prints (or runs) the correct global-npm update command"
    status: done
---

# feat: package-update handling — fix --version, opt-out update notifier, chalk upgrade (#158)

> state: **done** · phase: discovery

## Objective

- chalk --version and -v print the installed PACKAGE version (semver) and exit 0; chalk version still prints only the protocol tag (chalk/0) for scripts that parse it
- The update notifier is skip-FIRST and inert in every non-interactive/opted-out context (non-TTY, --json, CI, CHALK_NO_UPDATE_CHECK, protocol.updateCheck:false), prefers a fresh once-per-day cache over the network, and a registry failure never throws or changes a command's exit code / --json output
- chalk upgrade [--dry-run] prints (or runs) the correct global-npm update command

## Locked tests (read-only — P6)

- `test/update-notifier.test.mjs`

## Reviews

- **block** · 2026-07-09T07:38 · adversary
- **pass** · 2026-07-09T07:42 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
