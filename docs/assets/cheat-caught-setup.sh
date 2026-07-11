#!/usr/bin/env bash
# Hidden prep for cheat-caught.tape: a real, honest, LOCKED chalk task — ready to be sabotaged.
# No LLM, no network. Deterministic modulo the generated task id (written to .demo-id).
set -e
DIR=${1:-/tmp/chalk-cheat-demo}
rm -rf "$DIR"; mkdir -p "$DIR"; cd "$DIR"
git init -q

chalk init --name Cart --goal "cart total" --bare \
  --verify-test "node --test cart.test.mjs" >/dev/null 2>&1

# honest implementation
printf 'export const total = items => items.reduce((s, i) => s + i.price * i.qty, 0)\n' > cart.mjs

# the acceptance test that will be LOCKED
cat > cart.test.mjs <<'EOF'
import { test } from 'node:test'
import assert from 'node:assert'
import { total } from './cart.mjs'
test('sums price * qty across items', () => {
  assert.strictEqual(total([{ price: 3, qty: 2 }, { price: 5, qty: 1 }]), 11)
})
EOF

ID=$(chalk task add "sum cart totals" --milestone mvp | grep -oE 'task-[a-f0-9]+' | head -1)
chalk spec "$ID" --criterion "total = sum of price*qty" --test cart.test.mjs >/dev/null
chalk start "$ID" >/dev/null
echo "$ID" > .demo-id
