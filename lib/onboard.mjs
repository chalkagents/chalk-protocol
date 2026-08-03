// Chalk Protocol — Claude Code onboarding. `chalk init --executor claude` (or the retrofit,
// `chalk agents --claude`) has to leave a project ACTUALLY runnable: the four BYO agent commands
// wired into chalk.json AND the agent definitions those commands name installed into the user's
// .claude/agents/. The definitions are rendered from the provider-neutral canonical role
// instructions; packaged and dogfood assets are generated conveniences pinned by a drift test.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_NATIVE_ROLES, renderClaudeAgent } from './role-instructions.mjs';

// The exact command wiring this repo runs itself with (--max-turns bounds a runaway session).
// `review.requiredAt: per-task` comes with it — an executor without an adversary isn't the protocol.
export const CLAUDE_COMMANDS = {
  executor: 'claude -p --agent chalk-executor --permission-mode acceptEdits --max-turns 40',
  planner: 'claude -p --agent chalk-planner --max-turns 30',
  review: 'claude -p --agent chalk-reviewer --max-turns 20',
  retro: 'claude -p --agent chalk-retro --max-turns 20',
};

// Copy the shipped agent definitions into <root>/.claude/agents/, WRITE-IF-ABSENT: a user's edited
// agent is their agent — re-running init/agents must never clobber it. Returns [{name, action}].
export function installClaudeAgents(root) {
  const dest = join(root, '.claude', 'agents');
  mkdirSync(dest, { recursive: true });
  const results = [];
  for (const role of GENERATED_NATIVE_ROLES) {
    const f = `chalk-${role}.md`;
    const to = join(dest, f);
    if (existsSync(to)) { results.push({ name: f, action: 'exists, kept' }); continue; }
    writeFileSync(to, renderClaudeAgent(role));
    results.push({ name: f, action: 'created' });
  }
  return results;
}

// The no-executor path is first-class, not a failure — print exactly how the manual loop works.
export function manualLoopText() {
  return [
    '  manual loop (no executor wired): you drive, the gates still judge —',
    '    chalk next → write code → chalk verify → chalk done <id>',
    '  wire an executor later in .chalk/chalk.json → protocol.executor.command,',
    '  or run `chalk agents --claude` to scaffold the Claude Code setup.',
  ].join('\n');
}
