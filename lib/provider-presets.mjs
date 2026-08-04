// Provider-owned onboarding presets. Core initialization applies this opaque configuration without
// knowing provider binaries, flags, adapter asset paths, or environment-variable conventions.
import { fileURLToPath } from 'node:url';

export const CLAUDE_COMMANDS = Object.freeze({
  executor: 'claude -p --agent chalk-executor --permission-mode acceptEdits --max-turns 40',
  planner: 'claude -p --agent chalk-planner --max-turns 30',
  review: 'claude -p --agent chalk-reviewer --max-turns 20',
  retro: 'claude -p --agent chalk-retro --max-turns 20',
});

const capabilities = Object.freeze({ access: ['read-only', 'workspace-write'], output: ['text', 'json', 'none'] });
const protocolPath = (value) => String(value).split('\\').join('/');
const adapterCommand = (name) => `${JSON.stringify(protocolPath(process.execPath))} ${JSON.stringify(protocolPath(fileURLToPath(new URL(`../bin/adapters/${name}.mjs`, import.meta.url))))}`;

export function providerScaffold(name) {
  if (name === 'claude') {
    return {
      legacy: { executor: CLAUDE_COMMANDS.executor, planner: CLAUDE_COMMANDS.planner, reviewer: CLAUDE_COMMANDS.review, retro: CLAUDE_COMMANDS.retro },
      profiles: {
        claude: {
          adapter: 'claude', command: adapterCommand('claude'), model: null,
          identity: { displayName: 'Claude Code' },
          capabilities, options: {},
        },
      },
      roles: { executor: 'claude', planner: 'claude', reviewer: 'claude', retro: 'claude' },
      reviewRequiredAt: ['per-task'],
    };
  }
  if (name === 'opencode') {
    const legacyPath = protocolPath(fileURLToPath(new URL('../bin/adapters/opencode-exec.mjs', import.meta.url)));
    return {
      legacy: { executor: `node ${legacyPath}` },
      profiles: {
        opencode: {
          adapter: 'opencode', command: adapterCommand('opencode'), model: null,
          identity: { displayName: 'OpenCode' },
          capabilities, options: {},
        },
      },
      roles: { executor: 'opencode' },
    };
  }
  return null;
}
