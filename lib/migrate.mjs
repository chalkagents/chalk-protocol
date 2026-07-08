// Chalk Protocol — spine migration (#159). chalk is a STATEFUL CLI: a project's `.chalk/` spine is
// written by whatever package version the user had. When the schema/protocol evolves, an existing
// project must be carried forward deliberately — never silently mutated. `chalk migrate` applies the
// ordered MIGRATIONS steps (defined in store.mjs) to bring a spine to SCHEMA_VERSION, backing the
// spine up first so it is always reversible. Idempotent: a spine already current is a no-op. Zero
// dependencies beyond the spine.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { now, planMigrations, SCHEMA_VERSION } from './store.mjs';

// Copy the schema-bearing spine files to .chalk/backups/<ts>/ before a migration mutates them, so a
// bad migration is always recoverable. Returns the backup dir, or null when there was nothing to copy.
export function backupSpine(store) {
  const base = join(store.root, '.chalk');
  const dir = join(base, 'backups', now().replace(/[:.]/g, '-'));
  mkdirSync(dir, { recursive: true });
  let copied = 0;
  for (const f of ['chalk.json', 'tasks.json']) {
    const src = join(base, f);
    if (existsSync(src)) { copyFileSync(src, join(dir, f)); copied++; }
  }
  return copied ? dir : null;
}

// Bring the spine to SCHEMA_VERSION via the ordered migration steps. Idempotent: no pending steps → a
// no-op ({ upToDate: true }). `dryRun` reports the plan and mutates NOTHING — no backup, no write.
export function runMigrate(store, { dryRun = false } = {}) {
  const meta = store.meta();
  const from = meta?.version || '1.0';
  const steps = planMigrations(meta);
  const plan = steps.map((s) => ({ from: s.from, to: s.to, describe: s.describe }));
  if (!steps.length) return { migrated: false, upToDate: true, from, to: from, steps: [] };
  if (dryRun) return { migrated: false, dryRun: true, from, to: SCHEMA_VERSION, steps: plan };
  const backup = backupSpine(store);
  for (const step of steps) { step.apply(meta, store); meta.version = step.to; }
  store.saveMeta(meta); // stamps writerVersion + writes atomically
  store.appendDecision({ title: `Migrated spine ${from} → ${meta.version}`, why: `chalk migrate: ${plan.map((p) => p.describe).join('; ')}${backup ? ` (backup: ${backup})` : ''}` });
  return { migrated: true, from, to: meta.version, steps: plan, backup };
}
