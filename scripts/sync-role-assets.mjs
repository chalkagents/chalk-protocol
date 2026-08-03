import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_NATIVE_ROLES, renderClaudeAgent } from '../lib/role-instructions.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const role of GENERATED_NATIVE_ROLES) {
  const name = `chalk-${role}.md`;
  mkdirSync(join(root, 'share', 'agents'), { recursive: true });
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(root, 'share', 'agents', name), renderClaudeAgent(role));
  writeFileSync(join(root, '.claude', 'agents', name), renderClaudeAgent(role, { dogfood: true }));
}
