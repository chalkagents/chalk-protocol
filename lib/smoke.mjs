// Chalk Protocol — the sacrificial-issue smoke. Runs the REAL pipeline against exactly one
// throwaway issue, then verifies the actual artifacts (PR merged, branch gone, issue closed) and
// reports GO / NO-GO — the safe way to prove the unattended pipeline works before trusting it.
// This is the ONE command that performs real outward-facing actions, so the CLI gates it behind
// --yes and the runbook says: point it at a SCRATCH repo. Zero dependencies.
import { spawnSync } from 'node:child_process';
import { runPipeline } from './pipeline.mjs';
import { currentRepo, branchExists, gh as runGh } from './git.mjs';
import { now } from './store.mjs';

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function runSmoke(store, cliPath, { issue, create, yes, dryRun = false, log = () => {} } = {}) {
  const gh0 = store.protocol().github || {};
  const repo = currentRepo(store.root) || '(unknown)';
  log(`target repo: ${repo}`);
  if (dryRun) { log('dry-run — would create/select a throwaway issue, drive it issue→merge, then verify the merge.'); return { dryRun: true, repo }; }
  if (!yes) return { refused: true, repo };

  // 1. Resolve a target issue number — create a self-contained throwaway, or use --issue <n>.
  let issueNumber = issue ? Number(issue) : null;
  if (create) {
    const title = `chalk smoke ${now()}`;
    const body = '- [ ] smoke: pipeline reaches a green squash-merge';
    const out = runGh(store.root, gh0.command, `issue create --title ${q(title)} --body ${q(body)}`);
    issueNumber = Number((out.match(/\/issues\/(\d+)/) || [])[1]) || null;
  }
  if (!issueNumber) throw new Error('no target issue — pass --issue <n> or --create');

  // 2. Pull issues so the target becomes a task.
  spawnSync('node', [cliPath, 'issue', 'pull'], { cwd: store.root, encoding: 'utf8' });
  const task = store.tasks().find((t) => t.issue?.number === issueNumber);
  if (!task) throw new Error(`issue #${issueNumber} not found after \`issue pull\``);

  // 3. Drive ONLY this task issue→merge (reuses the real pipeline driver).
  runPipeline(store, cliPath, { only: task.id, max: 1, log });

  // 4. Verify the real artifacts.
  const t = store.task(task.id);
  const ghJson = (args) => { try { return runGh(store.root, gh0.command, args); } catch { return ''; } };
  const checks = [];
  checks.push(['pipeline reached cleanup (task done)', t.state === 'done' && t.pipeline?.stage === 'cleaned']);
  checks.push(['local branch deleted', t.branch ? !branchExists(store.root, t.branch) : false]);
  checks.push([`PR #${t.pr?.number || '?'} merged`, !!t.pr?.number && /MERGED/i.test(ghJson(`pr view ${t.pr.number} --json state -q .state`))]);
  checks.push([`issue #${issueNumber} closed`, /CLOSED/i.test(ghJson(`issue view ${issueNumber} --json state -q .state`))]);
  if (store.protocol().e2e?.command) checks.push(['test evidence attached', (t.evidence || []).length > 0]);

  return { go: checks.every(([, ok]) => ok), checks, repo, issueNumber, prNumber: t.pr?.number };
}
