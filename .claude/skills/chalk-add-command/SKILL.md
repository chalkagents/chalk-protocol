---
name: chalk-add-command
description: Scaffold a new chalk CLI command — the four wiring points (lib module, cmds method, help line, locked test), the test-is-contract rule, and the single-writer spine constraint. Load this when you add a CLI command or a new chalk subcommand.
---

# chalk-add-command — scaffolding a new command

Adding a command follows a consistent but entirely implicit pattern. Wire all four points below,
in the same change, with a locked test. See `chalk-codebase` for the module map this references.

## The four wiring points

1. **Logic module — `lib/<name>.mjs`.** Put the command's behavior in its own module, exporting a
   function. Follow existing modules for shape and conventions — `lib/retro.mjs`, `lib/discovery.mjs`
   are good templates. Zero-dependency Node ESM.

2. **`cmds` method — `bin/chalk.mjs`.** Every command is a method on the `cmds` object in
   `bin/chalk.mjs`. Add `async <name>(args) { … }` that parses its args and calls into your
   `lib/<name>.mjs`. Keep the method thin — parsing + delegation, not logic.

3. **Help line + arg parsing — `bin/chalk.mjs`.** Add a line to the help text and wire any flags into
   the arg parser (both live in `bin/chalk.mjs` alongside the other commands). A command with no help
   line is undiscoverable.

4. **Locked acceptance test.** Add or extend a test in `test/protocol.test.mjs` (gate behavior) or
   `test/pipeline.test.mjs` (GitHub pipeline behavior). **That suite IS the contract.** Write a
   fail-first assertion for the new behavior and lock it (see `chalk-locked-tests`). Make
   `node --test` green.

## The rules that keep it consistent

- **Test-is-contract.** The locked test is what proves the command does what it claims — not the
  help text, not a manual run. No locked test ⇒ a vacuous green (see `chalk-locked-tests`).
- **The spine is the single writer.** All reads/writes of `.chalk/` state go through the `Store` in
  `lib/store.mjs` — it is the **only** thing that writes the spine. Never write `.chalk/` files
  directly from your command; call a `Store` method (add one there if needed).
- **Reuse `lib/*` over new code.** Check the existing helpers (`lib/git.mjs`, `lib/config.mjs`,
  `lib/verify.mjs`, …) before writing new utilities — match the surrounding idioms.

## Checklist

- [ ] `lib/<name>.mjs` exports the logic
- [ ] `cmds.<name>` method added in `bin/chalk.mjs`
- [ ] help line + arg parsing added
- [ ] locked test in `test/protocol.test.mjs` or `test/pipeline.test.mjs`, `node --test` green
- [ ] all `.chalk/` writes go through `lib/store.mjs`

## See also

- `chalk-codebase` — where `lib/*`, the `cmds` object, and the test suites live.
- `chalk-locked-tests` (#144) — pinning the acceptance test in step 4.
