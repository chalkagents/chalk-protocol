// Chalk Protocol — config normalization. The single place that parses the flexible
// chalk.json `protocol` shapes into canonical forms, so verify/regression/review/CLI all
// agree and stay back-compatible. Leaf module: imports nothing local. Zero dependencies.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const GATES = ['typecheck', 'lint', 'test', 'build']; // ordered cheapest → costliest
export const WHENS = ['task', 'phase'];
export const REVIEW_CADENCES = ['per-task', 'milestone-boundary', 'phase-advance'];

// Normalize one verify-gate value. A bare string runs every `chalk verify` (when:'task').
// An object lets a slow gate (e.g. a full build) run only at phase boundaries (when:'phase').
//   "flutter test"                        → { cmd:'flutter test', when:'task' }
//   { cmd:'flutter build', when:'phase' } → { cmd:'flutter build', when:'phase' }
export function normGate(val) {
  if (!val) return { cmd: '', when: 'task' };
  if (typeof val === 'string') return { cmd: val, when: 'task' };
  const when = WHENS.includes(val.when) ? val.when : 'task';
  return { cmd: String(val.cmd || ''), when };
}

// Prepend the SDK runner (e.g. "fvm") to a gate command, keeping config DRY. Idempotent —
// won't double-prefix a command the user already wrote with the runner.
export function withRunner(runner, cmd) {
  if (!cmd || !runner) return cmd;
  const r = String(runner).trim();
  return r && !cmd.startsWith(r + ' ') ? `${r} ${cmd}` : cmd;
}

// Resolve the review cadence(s). Back-compat: a legacy `required:true` boolean means
// per-task; `requiredAt` (string|array of REVIEW_CADENCES) wins when present.
export function reviewCadences(reviewCfg = {}) {
  if (reviewCfg.requiredAt != null) return [].concat(reviewCfg.requiredAt).filter((c) => REVIEW_CADENCES.includes(c));
  return reviewCfg.required ? ['per-task'] : [];
}

// Extract a coarse "model identity" from a BYO agent command: its base binary plus any explicit
// --model/-m value. Used to spot when the P5 reviewer shares the executor's model — research shows an
// LLM judging its own model favors it (self-preference bias) and a same-model reviewer + generator fail
// in correlated ways, so the adversary isn't really independent. Cross-family review is the fix.
export function modelSignature(command) {
  const toks = String(command || '').trim().split(/\s+/).filter(Boolean);
  const bin = toks[0] || '';
  let model = '';
  for (let i = 0; i < toks.length; i++) {
    const eq = toks[i].match(/^--model=(.+)$/);
    if (eq) { model = eq[1]; break; }
    if (toks[i] === '--model' || toks[i] === '-m') { model = toks[i + 1] || ''; break; }
  }
  return { bin, model };
}

// True when a reviewer command shares the executor's model identity (same binary AND same/absent model),
// i.e. the adversarial reviewer is a clone of the author. Either side unconfigured → false (nothing to
// compare). Deliberately conservative: a different --model or a different tool clears it (no false alarms).
export function sameModelFamily(executorCmd, reviewCmd) {
  if (!executorCmd || !reviewCmd) return false;
  const a = modelSignature(executorCmd), b = modelSignature(reviewCmd);
  if (!a.bin || !b.bin) return false;
  return a.bin === b.bin && a.model === b.model;
}

// docs/CONFIG.md ↔ initSpine drift check, one nested level deep. The doc's contract: every
// top-level protocol key has a `### `key`` section, and a section whose default value is a plain
// object with keys carries ONE inline-code `{ a, b, c }` group naming EXACTLY the nested keys
// initSpine writes (deeper levels — e.g. github.labelType's map entries, verify's {cmd,when}
// value shape — are data, not schema, and stay out of scope). Returns a list of human-readable
// problems, empty when docs and config agree. Pure: (protocol object, markdown text) in.
const isPlainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function configDrift(protocol, md) {
  const problems = [];
  const sections = new Map(); // section name → body text up to the next ### heading
  const heads = [...String(md).matchAll(/^### `([^`]+)`$/gm)];
  for (let i = 0; i < heads.length; i++) {
    sections.set(heads[i][1], md.slice(heads[i].index + heads[i][0].length, i + 1 < heads.length ? heads[i + 1].index : md.length));
  }
  for (const name of sections.keys()) {
    if (!(name in protocol)) problems.push(`docs/CONFIG.md documents protocol.${name}, which initSpine no longer writes`);
  }
  for (const [key, val] of Object.entries(protocol)) {
    const body = sections.get(key);
    if (body === undefined) { problems.push(`docs/CONFIG.md is missing a section for protocol.${key}`); continue; }
    const braces = body.match(/`\{([^}`]*)\}/); // first inline-code { … } group (may wrap lines)
    const documented = braces ? braces[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
    const subs = isPlainObj(val) ? Object.keys(val) : []; // a scalar/array value has no schema keys —
    // so a still-documented key list is stale in FULL, not silently skipped (the value degraded).
    if (subs.length && !braces) { problems.push(`docs/CONFIG.md section protocol.${key} needs a \`{ … }\` key list (it is an object with nested keys)`); continue; }
    for (const sub of subs) {
      if (!documented.includes(sub)) problems.push(`docs/CONFIG.md is missing protocol.${key}.${sub} in the section's \`{ … }\` key list`);
    }
    for (const d of documented) {
      if (!subs.includes(d)) problems.push(`docs/CONFIG.md documents protocol.${key}.${d}, which initSpine no longer writes`);
    }
  }
  return problems;
}

// Stack presets — bare tool commands (the runner supplies the SDK invocation, e.g. "fvm").
// `build` is when:'phase' where a full build is too slow to run every task. `breakTest` turns the
// break-it non-vacuity lever ON by default wherever the stack has a truthful per-file test command
// (go is omitted: `go test <file>` needs the package's other files, so a single-file probe lies).
export const PRESETS = {
  flutter: {
    verify: { test: 'flutter test', lint: 'flutter analyze', build: { cmd: 'flutter build apk --debug', when: 'phase' } },
    regression: { command: 'flutter test .chalk/held-out', testDir: 'test' },
    breakTest: 'flutter test {test}',
  },
  dart: { verify: { test: 'dart test', lint: 'dart analyze' }, breakTest: 'dart test {test}' },
  node: { verify: { test: 'node --test' }, regression: { command: 'node --test .chalk/held-out' }, breakTest: 'node --test {test}' },
  python: { verify: { test: 'pytest -q', lint: 'ruff check .' }, regression: { command: 'pytest -q .chalk/held-out' }, breakTest: 'pytest -q {test}' },
  go: {
    verify: { test: 'go test ./...', lint: 'go vet ./...', build: { cmd: 'go build ./...', when: 'phase' } },
    regression: { command: 'go test ./.chalk/held-out' },
  },
};

// Auto-detect a preset from marker files at the project root (flutter ⊃ dart → prefer flutter).
export function detectPreset(root) {
  if (existsSync(join(root, 'pubspec.yaml'))) return 'flutter';
  if (existsSync(join(root, 'go.mod'))) return 'go';
  if (existsSync(join(root, 'package.json'))) return 'node';
  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'requirements.txt'))) return 'python';
  return null;
}
