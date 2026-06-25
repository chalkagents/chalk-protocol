# Decisions (ADR-lite)

## Namespace chalk.json under a protocol key

- _when:_ 2026-06-24T18:58:39.191Z
- _why:_ Keep chalk.json top-level canonical (chalk.schema.json) so the Chalk Browser preserves our config on enrich

## Amended acceptance test for "Enforce the seven gates (P1-P7) via the CLI"

- _when:_ 2026-06-25T13:08:39.115Z
- _why:_ re-baseline locked gate tests after merging #18/#20; 46 tests green, file unchanged from main

## Overrode review gate for "Enforce the seven gates (P1-P7) via the CLI"

- _when:_ 2026-06-25T13:09:13.359Z
- _why:_ umbrella gate task: all P1-P7 gate tests green (46/46); force-review since it is the meta-task that owns the locked suite, not a feature PR
