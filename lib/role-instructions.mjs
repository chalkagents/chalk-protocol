// Provider-neutral canonical instructions. Adapters receive these separately from run context.
export const ROLE_INSTRUCTIONS = Object.freeze({
  executor: `You implement one Chalk task at a time. Satisfy every acceptance criterion, add a focused test that would fail without the change, never alter a locked test, and keep the diff scoped. Do not self-certify; Chalk gates decide success.

Raise a fork instead of guessing. When a genuine architecture or product fork is not answered by the criteria, raise it for the director. Raise only the few calls that genuinely need human taste. If shell execution is available, run: chalk raise "<the fork>" --options "a|b|c" --why "...". Otherwise surface the fork clearly in your final summary.`,
  planner: `Survey the relevant project files without modifying them. Produce a concise implementation plan: chosen approach and rationale, ordered steps, files and existing utilities to reuse, and a focused test that would fail before the change. Surface genuine unanswered product decisions as questions.`,
  reviewer: `Act as an adversarial release-gate reviewer. Try to refute the change against every acceptance criterion across correctness, test adequacy, design intent, and regression risk. Block when evidence is insufficient.

Return the reviewer result contract with a pass/block verdict and findings. Also include a decision digest containing non-trivial choices the implementer made, with rationale, blast radius, and reversibility, even when the verdict passes.`,
  discovery: `Turn the supplied product brief into a small, dependency-ordered backlog. Return a discovery proposal containing an optional concise spec and tasks with non-empty titles and testable acceptance criteria. Do not modify the workspace.`,
  feedback: `Analyze the supplied product signals and return only concrete improvement issues. Each issue needs a crisp title, actionable body, and honest severity. Prefer a few high-signal items; an empty issue list is valid. Do not modify the workspace.`,
  retro: `Analyze the supplied run digest. Return durable, non-duplicative lessons and concrete product defects or friction as improvement issues. Keep lessons imperative and issues actionable; empty arrays are valid. Do not modify the workspace.`,
  handoff: `Write concise handoff notes for an unfinished task: root cause if known, what is complete, what remains, and the next concrete action. Do not modify the workspace.`,
  'pr-narrative': `Write two to five concrete sentences explaining what changed and why for a pull-request body. Use the supplied criteria and changed-file list. Do not add headings or preamble and do not modify the workspace.`,
  'regression-author': `Author independent regression and composition tests from the supplied specification and acceptance criteria. Cover cross-feature behavior and edge cases without deriving expectations from the implementation. Write the requested test files only.`,
});

export function roleInstructions(role) { return ROLE_INSTRUCTIONS[role] || ''; }

export function combineRoleInput(instructions, context) {
  return `# Role instructions\n\n${String(instructions || '').trim()}\n\n# Run context\n\n${String(context || '')}`;
}

const NATIVE = {
  executor: { name: 'chalk-executor', description: 'Chalk Protocol unattended executor.', tools: 'Read, Edit, Write, Grep, Glob', skills: '[chalk-conventions, chalk-codebase]' },
  planner: { name: 'chalk-planner', description: 'Chalk Protocol read-only planner.', tools: 'Read, Grep, Glob', skills: '[chalk-conventions, chalk-codebase]' },
  reviewer: { name: 'chalk-reviewer', description: 'Chalk Protocol adversarial release-gate reviewer.', tools: 'Read, Grep, Glob', skills: '[chalk-conventions]' },
  retro: { name: 'chalk-retro', description: 'Chalk Protocol read-only retrospective analyst.', tools: 'Read, Grep, Glob', skills: '[chalk-conventions, chalk-codebase]' },
};

export function renderClaudeAgent(role, { dogfood = false } = {}) {
  const meta = NATIVE[role];
  if (!meta) return null;
  const skill = dogfood ? `skills: ${meta.skills}\n` : '';
  return `---\nname: ${meta.name}\ndescription: ${meta.description}\ntools: ${meta.tools}\nmodel: inherit\n${skill}---\n\n${roleInstructions(role).trim()}\n`;
}

export const GENERATED_NATIVE_ROLES = Object.freeze(Object.keys(NATIVE));
