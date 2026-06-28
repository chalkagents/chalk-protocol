// Chalk Protocol — the Release stage. The dev cycle produces merged, recorded work; a release turns
// that into a product-facing artifact: notes/CHANGELOG grouped by change type and a semver bump. The
// raw material is the spine's done tasks (title, type, PR link) — offline and deterministic; the PR
// body holds the richer "what was done", which the notes link to. Pure helpers; `chalk release` wires
// them to the filesystem + git. Zero dependencies beyond the spine.

// Done tasks not yet shipped (no `released` marker), oldest-first so the notes read chronologically.
export function releasableTasks(store) {
  return store.tasks()
    .filter((t) => t.state === 'done' && !t.released)
    .sort((a, b) => String(a.doneAt || '').localeCompare(String(b.doneAt || '')));
}

// The highest vX.Y.Z among git tags (so non-Node projects, which have no package.json to read the
// current version from, still advance their version across releases instead of recomputing 0.0.x).
export function latestSemverTag(tagsText) {
  const vs = String(tagsText || '').split('\n').map((t) => t.trim().replace(/^v/, '')).filter((t) => /^\d+\.\d+\.\d+$/.test(t));
  vs.sort((a, b) => { const [a0, a1, a2] = a.split('.').map(Number); const [b0, b1, b2] = b.split('.').map(Number); return a0 - b0 || a1 - b1 || a2 - b2; });
  return vs.length ? vs[vs.length - 1] : null;
}

const isBreaking = (t) => /!$/.test(t.branchType || '') || (t.labels || []).some((l) => /^breaking/i.test(l));
const isFeat = (t) => /^feat/i.test(t.branchType || '');

// Semver bump. An explicit version or level wins; otherwise the change set decides: any breaking →
// major, else any feature → minor, else patch. A missing/invalid current is treated as 0.0.0.
export function bumpVersion(current, tasks = [], { version, level } = {}) {
  if (version) return String(version).replace(/^v/, '');
  const [maj = 0, min = 0, pat = 0] = String(current || '0.0.0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const lvl = level || (tasks.some(isBreaking) ? 'major' : tasks.some(isFeat) ? 'minor' : 'patch');
  if (lvl === 'major') return `${maj + 1}.0.0`;
  if (lvl === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

// Map a branchType to a notes section. Unknown/none → "Other".
const SECTION = { feat: 'Features', fix: 'Fixes', perf: 'Performance', refactor: 'Refactors', docs: 'Docs', chore: 'Chores', build: 'Build', ci: 'CI', test: 'Tests', style: 'Style' };
const ORDER = ['Features', 'Fixes', 'Performance', 'Refactors', 'Docs', 'Build', 'CI', 'Tests', 'Style', 'Chores', 'Other'];
const sectionOf = (t) => SECTION[String(t.branchType || '').replace(/!$/, '').toLowerCase()] || 'Other';
// Strip a conventional prefix from the title so the line reads cleanly under its section header.
const clean = (title) => String(title || '').replace(/^\s*[a-z]+(\([^)]*\))?!?:\s*/i, '').trim();

export function renderReleaseNotes(tasks, version, date) {
  const groups = new Map();
  for (const t of tasks) {
    const s = sectionOf(t);
    const link = t.pr?.number ? ` (#${t.pr.number})` : '';
    (groups.get(s) || groups.set(s, []).get(s)).push(`- ${clean(t.title)}${link}`);
  }
  const out = [`## v${String(version).replace(/^v/, '')} — ${date}`, ''];
  for (const section of ORDER) {
    const lines = groups.get(section);
    if (lines && lines.length) out.push(`### ${section}`, ...lines, '');
  }
  if (!tasks.length) out.push('_No user-facing changes._', '');
  return out.join('\n').trimEnd() + '\n';
}
