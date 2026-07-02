#!/usr/bin/env bash
# Chalk Protocol — end-to-end lifecycle demo. Now a built-in: this wrapper just delegates to
# `chalk demo` (lib/demo.mjs), the single source of truth — same stages, plus two staged gate
# refusals, self-asserting steps, and automatic cleanup (pass --keep to inspect the project).
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$REPO/bin/chalk.mjs" demo "$@"
