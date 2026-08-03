// Canonical role contracts: the single source for requested access and normalized output shape.
import { parseLastJson } from './json.mjs';

export const ROLE_CONTRACTS = Object.freeze({
  executor: { access: 'workspace-write', output: { kind: 'text' } },
  planner: { access: 'read-only', output: { kind: 'text' } },
  reviewer: { access: 'read-only', output: { kind: 'json', schema: 'chalk/reviewer-result/1' } },
  discovery: { access: 'read-only', output: { kind: 'json', schema: 'chalk/discovery-proposal/1' } },
  feedback: { access: 'read-only', output: { kind: 'json', schema: 'chalk/feedback-result/1' } },
  retro: { access: 'read-only', output: { kind: 'json', schema: 'chalk/retro-result/1' } },
  handoff: { access: 'read-only', output: { kind: 'text' } },
  'pr-narrative': { access: 'read-only', output: { kind: 'text' } },
  'regression-author': { access: 'workspace-write', output: { kind: 'none' } },
});

export const roleContract = (role) => ROLE_CONTRACTS[role] || null;

function valid(role, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (role === 'reviewer') return ['pass', 'block'].includes(value.verdict) && Array.isArray(value.findings) && (value.decisions === undefined || Array.isArray(value.decisions));
  if (role === 'discovery') return Array.isArray(value.tasks);
  if (role === 'feedback') return Array.isArray(value.issues);
  if (role === 'retro') return Array.isArray(value.lessons) || Array.isArray(value.issues);
  return true;
}

export function validateStructuredRole(role, value) {
  return valid(role, value)
    ? null
    : { level: 'error', code: 'schema-invalid', message: `agent output does not satisfy ${ROLE_CONTRACTS[role]?.output?.schema || `${role} contract`}`, retryable: false };
}

export function decodeStructuredRole(role, text) {
  const value = parseLastJson(text, (candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  if (!value) return { structured: null, diagnostic: { level: 'error', code: 'malformed-structured-output', message: 'agent output did not contain one complete JSON object', retryable: false } };
  const invalid = validateStructuredRole(role, value);
  if (invalid) return { structured: null, diagnostic: invalid };
  return { structured: value, diagnostic: null };
}

// A profile may explicitly declare adapter capabilities. Omitted declarations retain raw-command
// compatibility because Chalk itself enforces read-only mutation checks and structured decoding.
export function checkRoleCapabilities(role, profile) {
  const contract = roleContract(role);
  if (!contract) return { ok: false, problems: [`unknown role ${role}`], reported: null };
  const declared = profile?.capabilities;
  if (!declared) return {
    ok: true, problems: [],
    reported: {
      accessEnforced: contract.access === 'read-only' ? 'chalk-workspace-diff' : 'workspace-write',
      structuredOutput: contract.output.kind === 'json' ? 'chalk-decoded-and-validated' : 'none',
    },
  };
  const access = Array.isArray(declared.access) ? declared.access.map(String) : [];
  const output = Array.isArray(declared.output) ? declared.output.map(String) : [];
  const problems = [];
  if (!access.includes(contract.access)) problems.push(`${role} requires ${contract.access} access but profile ${profile.name} does not report it`);
  if (!output.includes(contract.output.kind)) problems.push(`${role} requires ${contract.output.kind} output but profile ${profile.name} does not report it`);
  return { ok: problems.length === 0, problems, reported: { access, output } };
}
