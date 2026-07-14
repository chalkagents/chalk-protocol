---
generator: chalk-protocol
id: "task-e675a65c"
name: "feat: opt-in anonymous activation telemetry (init → first green verify → done funnel)"
overview: "Telemetry is OFF by default: with no opt-in config and no env, no network call, no install-id write, and no payload is emitted on init/verify/done"
created: "2026-07-14T08:06:42.070Z"
todos:
  - id: "task-e675a65c-c1"
    content: "Telemetry is OFF by default: with no opt-in config and no env, no network call, no install-id write, and no payload is emitted on init/verify/done"
    status: done
  - id: "task-e675a65c-c2"
    content: "When enabled, the emitted payload contains ONLY whitelisted fields (event name, chalk version, random anonymous install id, timestamp) — never code, paths, prompts, diffs, or repo identity"
    status: done
  - id: "task-e675a65c-c3"
    content: "Emission is fire-and-forget and non-blocking: a network/DNS failure (or unreachable endpoint) never changes a command's exit code or throws"
    status: done
  - id: "task-e675a65c-c4"
    content: "chalk telemetry --show prints the resolved enabled state and EXACTLY the payload that would be sent; CHALK_TELEMETRY=0 and a config flag hard-disable, and CI (process.env.CI) disables by default"
    status: done
  - id: "task-e675a65c-c5"
    content: "Opt-in is prompted once at chalk init (default N); README + docs/CONFIG.md document the telemetry config, the env kill-switch, and the whitelisted fields"
    status: done
---

# feat: opt-in anonymous activation telemetry (init → first green verify → done funnel)

> state: **done** · phase: discovery

## Objective

- Telemetry is OFF by default: with no opt-in config and no env, no network call, no install-id write, and no payload is emitted on init/verify/done
- When enabled, the emitted payload contains ONLY whitelisted fields (event name, chalk version, random anonymous install id, timestamp) — never code, paths, prompts, diffs, or repo identity
- Emission is fire-and-forget and non-blocking: a network/DNS failure (or unreachable endpoint) never changes a command's exit code or throws
- chalk telemetry --show prints the resolved enabled state and EXACTLY the payload that would be sent; CHALK_TELEMETRY=0 and a config flag hard-disable, and CI (process.env.CI) disables by default
- Opt-in is prompted once at chalk init (default N); README + docs/CONFIG.md document the telemetry config, the env kill-switch, and the whitelisted fields

## Locked tests (read-only — P6)

- `test/telemetry.test.mjs`

## Reviews

- **block** · 2026-07-14T08:22 · adversary
- **block** · 2026-07-14T08:32 · adversary
- **pass** · 2026-07-14T08:40 · adversary
- **pass** · 2026-07-14T08:43 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
