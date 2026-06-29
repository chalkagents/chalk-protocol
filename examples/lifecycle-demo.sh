#!/usr/bin/env bash
# Chalk Protocol — end-to-end product-lifecycle demo on a THROWAWAY project.
#
# Wires tiny stub agents (plain node scripts that emit the JSON contracts) into a temp
# project and drives every stage so you can watch the whole loop without a real LLM, gh,
# or any impact on a real repo. Swap the stubs for `claude -p` to run it for real.
#
#   Run:  bash examples/lifecycle-demo.sh
#
# Stages shown: discover → plan (scoping questions) → plan-approval gate → work → verify →
#               review → done → release → feedback → portal.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHALK="node $REPO/bin/chalk.mjs"
DEMO="$(mktemp -d)"
cd "$DEMO"
banner() { printf '\n\033[1m═══ %s ═══\033[0m\n' "$1"; }
echo "Throwaway demo project: $DEMO"

git init -q -b main; git config user.email d@d.d; git config user.name d
$CHALK init --name "Widget App" --goal "A little widget app" >/dev/null
echo '{"name":"widget-app","version":"0.0.0"}' > package.json

# ── stub agents: each reads its input on stdin and prints the JSON/text contract ──────────
cat > .chalk/a-discovery.mjs <<'JS'
process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(JSON.stringify({
  spec:'A widget app that lists and adds widgets.',
  tasks:[{title:'List widgets', criteria:['shows all widgets','empty state when none'], milestone:'mvp'}]
})));
JS
cat > .chalk/a-planner.mjs <<'JS'
process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(`## Plan
1. Add a widgets module and render the list.

## Questions
- Should widgets persist across restarts?`));
JS
cat > .chalk/a-executor.mjs <<'JS'
import {writeFileSync,readFileSync} from 'node:fs'; try{readFileSync(0)}catch{}
writeFileSync('widgets.mjs','export const list = () => [];\n');
writeFileSync('widgets.test.mjs',"import {test} from 'node:test'; import a from 'node:assert'; import {list} from './widgets.mjs'; test('empty',()=>a.deepEqual(list(),[]));\n");
JS
cat > .chalk/a-reviewer.mjs <<'JS'
process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(JSON.stringify({verdict:'pass',findings:[]})));
JS
cat > .chalk/a-feedback.mjs <<'JS'
process.stdin.on('data',()=>{}); process.stdin.on('end',()=>console.log(JSON.stringify({issues:[{title:'feat: search widgets', severity:'high', body:'Users keep asking to search.'}]})));
JS
cat > .chalk/a-gh.mjs <<'JS'
const a=process.argv.slice(2), has=(...x)=>x.every(y=>a.includes(y));
if(has('issue','create')) console.log('https://github.com/demo/widget/issues/1');
else console.log('[]'); // issue list / anything else
JS

# ── point the protocol at the stubs (a real run would use `claude -p`) ───────────────────
node -e '
const f=".chalk/chalk.json", fs=require("fs"); const o=JSON.parse(fs.readFileSync(f));
Object.assign(o.protocol,{
  verify:{test:"node --test widgets.test.mjs"},
  executor:{command:"node .chalk/a-executor.mjs"},
  planner:{command:"node .chalk/a-planner.mjs"},
  review:{command:"node .chalk/a-reviewer.mjs", requiredAt:["per-task"]},
  discovery:{command:"node .chalk/a-discovery.mjs"},
  feedback:{command:"node .chalk/a-feedback.mjs"},
  plan:{required:true},
  github:{...(o.protocol.github||{}), command:"node .chalk/a-gh.mjs"},
});
fs.writeFileSync(f, JSON.stringify(o,null,2));'

banner "1. DISCOVER — a brief becomes a scoped backlog (specd tasks w/ criteria)"
$CHALK discover "Build a widget app"
ID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".chalk/tasks.json"))[0].id.slice(0,12))')

banner "2. PLAN — emits a plan AND scoping questions (the human checkpoint)"
$CHALK plan "$ID"
$CHALK question

banner "3. WORK is GATED — refuses until the plan is approved"
$CHALK work "$ID"

banner "4. APPROVE-PLAN — human signs off (--force past the open question, for the demo)"
$CHALK approve-plan "$ID" --force --why "demo: persistence deferred"

banner "5. WORK — executor implements; verify + test-gate + break-it run"
$CHALK work "$ID"

banner "6. REVIEW (adversarial) then DONE (gated on verify + a passing review)"
$CHALK review "$ID"
$CHALK done "$ID"

banner "7. RELEASE — notes + semver bump + tag from the shipped work (try --dry-run first)"
$CHALK release --dry-run
$CHALK release

banner "8. FEEDBACK — a user signal becomes an improvement issue in the backlog"
mkdir -p .chalk/feedback; echo "Users keep asking for a search box." > .chalk/feedback/users.md
$CHALK feedback

banner "9. PORTAL — publish client-facing status from the spine"
$CHALK portal
echo "--- .project/scope/defined.yaml ---"; cat .project/scope/defined.yaml

banner "LOOP COMPLETE — throwaway project at: $DEMO"
echo "Inspect it, then:  rm -rf \"$DEMO\""
