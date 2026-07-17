#!/usr/bin/env bash
# Director's Harness — a 90-second, offline demo of the align → digest → pending flow.
# No LLM needed: a canned reviewer stands in for `chalk review` so the whole thing is deterministic
# and safe to screen-record. Run from a chalk-protocol checkout:  bash director-harness-demo.sh
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)"
CHALK="${CHALK:-$ROOT/bin/chalk.mjs}"
[ -f "$CHALK" ] || { echo "cannot find bin/chalk.mjs — run from a chalk-protocol checkout (or set CHALK=)"; exit 1; }
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
cd "$D"; git init -q -b main; git config user.email demo@demo.dev; git config user.name demo

c() { node "$CHALK" "$@"; }               # chalk in the demo project
banner() { printf '\n\033[1;35m▐ %s\033[0m\n\n' "$1"; }
pause() { printf '\033[2m   … press enter …\033[0m'; read -r _; }

banner "1 · A project in DIRECTOR mode — the human's judgment is first-class"
c init --name payments --bare >/dev/null
node -e "const f='$D/.chalk/chalk.json',o=JSON.parse(require('fs').readFileSync(f));o.protocol.director={required:true};o.protocol.requireTest=false;o.protocol.executor={command:'node -e \"require(\\'fs\\').writeFileSync(\\'charge.js\\',\\'// built\\')\"'};require('fs').writeFileSync(f,JSON.stringify(o,null,2))"
c task add "Add refund endpoint" >/dev/null
ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$D/.chalk/tasks.json'))[0].id)")
c spec "$ID" --criterion "refunds are idempotent per charge id" >/dev/null
c spec "$ID" --criterion "partial refunds are supported" >/dev/null
c start "$ID" >/dev/null
echo "   task scoped, criteria written. Now watch what happens when the agent tries to BUILD."
pause

banner "2 · The agent CANNOT one-shot past your intent  (#191 chalk align)"
echo "   \$ chalk work $ID"
c work "$ID" || true
echo
echo "   The build refuses. You review what 'done' means and accept it:"
echo "   \$ chalk align $ID"
c align "$ID"
pause

banner "3 · Now it builds — and the reviewer hands you a DECISION DIGEST  (#192)"
# canned adversarial reviewer: a real pass, plus the judgment calls the agent made
cat > "$D/canned-reviewer.mjs" <<'EOF'
console.log(JSON.stringify({
  verdict: "pass", findings: [],
  decisions: [
    { choice: "refund key = charge_id only (not charge_id+amount)", rationale: "simplest idempotency key",
      blastRadius: "high", reversibility: "hard" },
    { choice: "partial refunds default to the full remaining balance when amount omitted", rationale: "felt convenient",
      blastRadius: "high", reversibility: "easy" },
    { choice: "named the handler refund.js", rationale: "convention", blastRadius: "low", reversibility: "easy" }
  ]
}));
EOF
node -e "const f='$D/.chalk/chalk.json',o=JSON.parse(require('fs').readFileSync(f));o.protocol.review={command:'node $D/canned-reviewer.mjs',requiredAt:['per-task']};require('fs').writeFileSync(f,JSON.stringify(o,null,2))"
c work "$ID" >/dev/null 2>&1 || true
git add -A; git commit -q -m "feat: refund endpoint" || true
echo "   \$ chalk review $ID"
c review "$ID" || true
pause

banner "4 · The DIRECTOR INBOX — steer the empty middle  (#193 chalk pending)"
echo "   \$ chalk pending"
c pending || true
echo
echo "   The high-risk, hard-to-undo call is at the top. You redirect it instead of shipping it blind:"
echo "   \$ chalk pending redirect $ID#0 \"key on charge_id+amount — a re-charge must not dedupe\""
c pending redirect "$ID#0" "key on charge_id+amount — a re-charge must not dedupe" || true
echo
echo "   \$ chalk pending   (the redirected call is gone; the medium one remains for you)"
c pending || true

banner "That's the harness:  align → digest → pending.  You can't direct what you can't verify."
