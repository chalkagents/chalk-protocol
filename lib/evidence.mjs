// Chalk Protocol — test-evidence: turn a browser-spec run's step screenshots into PNG files
// committed to the feature branch, and compose immutable commit-SHA blob URLs that survive a
// squash-merge + branch deletion. Screenshots come from chalk-browser run.json steps
// (beforeScreenshot/afterScreenshot as `data:image/png;base64,…`). Zero dependencies.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Decode a `data:image/...;base64,<payload>` URL to a file. Returns true on success.
export function dataUrlToPng(dataUrl, absPath) {
  const m = String(dataUrl).match(/^data:image\/\w+;base64,(.+)$/s);
  if (!m) return false;
  writeFileSync(absPath, Buffer.from(m[1], 'base64'));
  return true;
}

// Extract every step screenshot from a run.json into <cwd>/<destRel>/, returning the repo-relative
// paths written (for staging + the PR body).
export function extractScreenshots(cwd, destRel, run) {
  mkdirSync(join(cwd, destRel), { recursive: true });
  const out = [];
  for (const step of run.steps || []) {
    for (const [key, tag] of [['beforeScreenshot', 'before'], ['afterScreenshot', 'after']]) {
      if (!step[key]) continue;
      const rel = `${destRel}/${tag}-${step.stepId}.png`;
      if (dataUrlToPng(step[key], join(cwd, rel))) out.push(rel);
    }
  }
  return out;
}

// Compose a markdown "Test evidence" section with commit-SHA blob URLs (immutable; survive the
// branch being deleted after squash-merge).
export function evidenceMarkdown(repo, sha, paths) {
  if (!paths.length) return '';
  const imgs = paths.map((p) => `![${p.split('/').pop()}](https://github.com/${repo}/blob/${sha}/${p})`);
  return `\n\n## Test evidence\n${imgs.join('\n')}`;
}
