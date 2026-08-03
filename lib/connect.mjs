// Guided agent connection is a deep provider-neutral module: discovery, idempotent profile writes,
// role presets, migration safety, capability checks, and independence guidance behind two calls.
import { checkRoleCapabilities } from './agent-contracts.mjs';
import { compareReviewerIndependence, resolveAgentConfiguration } from './config.mjs';
import { ADAPTER_MANIFESTS, adapterManifest, discoverAdapters } from './adapter-registry.mjs';

export const CONNECT_PRESETS = Object.freeze(['manual', 'assisted', 'autonomous']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const safeName = (value) => String(value || '').trim().replace(/[^A-Za-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '');

export function parseAssignments(values) {
  const parsed = {};
  for (const raw of values == null ? [] : [].concat(values)) {
    const text = String(raw);
    const at = text.indexOf('=');
    if (at <= 0 || !text.slice(at + 1)) throw new Error(`expected <adapter>=<value>, got ${text}`);
    parsed[text.slice(0, at)] = text.slice(at + 1);
  }
  return parsed;
}

export function discoverConnections(options = {}) {
  return discoverAdapters(options);
}

export async function promptConnection({ discoveries, ask }) {
  const installed = discoveries.filter((item) => item.installed);
  const choices = installed.map((item) => item.adapter).join('|') || 'none detected';
  const preset = String(await ask('Setup mode (manual|assisted|autonomous) [assisted]: ') || 'assisted').trim();
  const builder = String(await ask(`Builder adapter (${choices}): `) || '').trim();
  const reviewerDefault = installed.find((item) => item.adapter !== builder)?.adapter || builder;
  const reviewer = preset === 'manual'
    ? String(await ask(`Reviewer adapter, optional (${choices}) [none]: `) || '').trim()
    : String(await ask(`Reviewer adapter (${choices}) [${reviewerDefault}]: `) || reviewerDefault).trim();
  return { preset, builder, reviewer };
}

function profileFor(manifest, { binary, model }) {
  const options = { ...(binary ? { binary: String(binary) } : {}), ...(model ? { model: String(model) } : {}) };
  const identityKey = `${manifest.id}:${model || 'default'}`;
  return {
    adapter: manifest.id,
    command: manifest.command,
    model: model ? String(model) : null,
    identity: { displayName: manifest.displayName, independenceKey: identityKey },
    capabilities: { roles: [...manifest.roles], access: [...manifest.capabilities.access], output: [...manifest.capabilities.output] },
    options,
  };
}

function desiredRoles(preset, builderManifest, reviewerManifest, reviewerSelected) {
  const roles = { executor: 'builder' };
  if (preset !== 'manual' && builderManifest.roles.includes('planner')) roles.planner = 'builder';
  if (preset === 'autonomous') {
    for (const role of builderManifest.roles) if (role !== 'reviewer') roles[role] = 'builder';
  }
  if (reviewerSelected && reviewerManifest?.roles.includes('reviewer')) roles.reviewer = 'reviewer';
  return roles;
}

const LEGACY_ROLE_PATHS = {
  executor: ['executor', 'command'], planner: ['planner', 'command'], reviewer: ['review', 'command'],
  discovery: ['discovery', 'command'], feedback: ['feedback', 'command'], retro: ['retro', 'command'],
  handoff: ['handoff', 'command'], 'pr-narrative': ['prbody', 'command'], 'regression-author': ['regression', 'authorCommand'],
};

function clearLegacy(protocol, role) {
  const path = LEGACY_ROLE_PATHS[role];
  if (!path) return false;
  let target = protocol;
  for (const part of path.slice(0, -1)) target = target?.[part];
  const leaf = path.at(-1);
  if (!target || !target[leaf]) return false;
  target[leaf] = '';
  return true;
}

export function configureConnections(meta, options = {}, manifests = ADAPTER_MANIFESTS) {
  const preset = String(options.preset || 'assisted');
  if (!CONNECT_PRESETS.includes(preset)) throw new Error(`unknown connect preset ${preset}; choose ${CONNECT_PRESETS.join('|')}`);
  const builderManifest = adapterManifest(options.builder, manifests);
  if (!builderManifest) throw new Error(`unknown builder adapter ${String(options.builder || '(missing)')}; choose ${Object.keys(manifests).join('|')}`);
  if (!builderManifest.roles.includes('executor')) throw new Error(`${builderManifest.displayName} cannot be a builder because it does not support executor; choose chalk connect --builder <adapter-with-executor>`);
  const reviewerManifest = options.reviewer ? adapterManifest(options.reviewer, manifests) : null;
  if (options.reviewer && !reviewerManifest) throw new Error(`unknown reviewer adapter ${options.reviewer}; choose ${Object.keys(manifests).join('|')}`);
  if (reviewerManifest && !reviewerManifest.roles.includes('reviewer')) throw new Error(`${reviewerManifest.displayName} does not support reviewer; choose chalk connect --reviewer <adapter-with-reviewer>`);

  const next = clone(meta);
  const protocol = next.protocol ||= {};
  const agents = protocol.agents ||= { version: 1, profiles: {}, roles: {} };
  agents.version ||= 1;
  agents.profiles ||= {};
  agents.roles ||= {};
  const builderProfile = safeName(options.builderProfile || builderManifest.id);
  const reviewerProfile = reviewerManifest
    ? safeName(options.reviewerProfile || (reviewerManifest.id === builderManifest.id ? `${reviewerManifest.id}-reviewer` : reviewerManifest.id)) : '';
  if (!builderProfile || (reviewerManifest && !reviewerProfile)) throw new Error('profile names must contain letters, numbers, dot, slash, underscore, or dash');

  const changes = [], preserved = [], warnings = [];
  const putProfile = (name, manifest, values) => {
    const existed = Boolean(agents.profiles[name]);
    if (existed && !options.replace) {
      if (String(agents.profiles[name].adapter || 'raw-command') !== manifest.id) {
        throw new Error(`profile ${name} already belongs to adapter ${agents.profiles[name].adapter || 'raw-command'}; choose --${name === builderProfile ? 'builder' : 'reviewer'}-profile <new-name> or pass --replace`);
      }
      preserved.push(`profile ${name}`);
      return;
    }
    agents.profiles[name] = profileFor(manifest, values);
    changes.push(`${existed ? 'replaced' : 'created'} profile ${name}`);
  };
  putProfile(builderProfile, builderManifest, { binary: options.binaries?.[builderManifest.id], model: options.builderModel });
  if (reviewerManifest) putProfile(reviewerProfile, reviewerManifest, { binary: options.binaries?.[reviewerManifest.id], model: options.reviewerModel });

  const requested = desiredRoles(preset, builderManifest, reviewerManifest, Boolean(reviewerManifest));
  for (const [role, kind] of Object.entries(requested)) {
    const name = kind === 'reviewer' ? reviewerProfile : builderProfile;
    if (agents.roles[role] && agents.roles[role] !== name && !options.replace) {
      preserved.push(`role ${role} → ${agents.roles[role]}`);
      warnings.push(`role ${role} remains bound to ${agents.roles[role]}; rerun with --replace to bind ${name}`);
      continue;
    }
    if (agents.roles[role] !== name) { agents.roles[role] = name; changes.push(`bound ${role} → ${name}`); }
    if (options.migrateLegacy && clearLegacy(protocol, role)) changes.push(`cleared legacy ${role} command`);
  }
  if (reviewerManifest && preset !== 'manual') {
    protocol.review ||= { command: '', requiredAt: [] };
    const requiredAt = Array.isArray(protocol.review.requiredAt) ? protocol.review.requiredAt : [];
    if (!requiredAt.includes('per-task')) { protocol.review.requiredAt = [...requiredAt, 'per-task']; changes.push('enabled per-task review'); }
  }

  if (!options.migrateLegacy) {
    const retained = Object.entries(LEGACY_ROLE_PATHS).filter(([, path]) => {
      let value = protocol;
      for (const part of path) value = value?.[part];
      return Boolean(value);
    }).map(([role]) => role);
    if (retained.length) warnings.push(`legacy commands preserved for ${retained.join(', ')}; pass --migrate-legacy only if you intend to clear replaced legacy bindings`);
  }
  if (!changes.length) preserved.push('configuration already matches; no values changed');
  return { meta: next, preset, profiles: { builder: builderProfile, reviewer: reviewerProfile || null }, changes, preserved, warnings };
}

export function connectionReadiness(protocol, discoveries) {
  const resolved = resolveAgentConfiguration(protocol);
  const byAdapter = Object.fromEntries(discoveries.map((item) => [item.adapter, item]));
  const checks = [];
  for (const problem of resolved.problems) checks.push({ level: 'fail', message: problem, nextAction: 'Run chalk connect --replace with valid profile names' });
  for (const [role, profile] of Object.entries(resolved.roles)) {
    if (!profile) continue;
    const support = checkRoleCapabilities(role, profile);
    for (const problem of support.problems) checks.push({ level: 'fail', message: problem, nextAction: `Choose a capable profile: chalk connect --replace --builder <adapter> --reviewer <adapter>` });
    const discovery = byAdapter[profile.adapter];
    if (discovery?.status === 'missing' || discovery?.status === 'error') checks.push({ level: 'fail', message: discovery.message, nextAction: discovery.nextAction });
    else if (discovery?.status === 'auth-missing') checks.push({ level: 'fail', message: discovery.message, nextAction: `${discovery.nextAction}; then run chalk agent test ${profile.name} --live` });
    else if (discovery?.status === 'warning') checks.push({ level: 'warn', message: discovery.message, nextAction: discovery.nextAction || `Run chalk agent test ${profile.name} --live only when you want one real smoke call` });
    else if (discovery) checks.push({ level: 'ok', message: `${role} → ${profile.name}: ${discovery.message}`, nextAction: '' });
  }
  const independence = compareReviewerIndependence(protocol);
  if (resolved.roles.executor && resolved.roles.reviewer) {
    if (independence.status === 'distinct') checks.push({ level: 'ok', message: 'builder and reviewer use distinct configured identities', nextAction: '' });
    else checks.push({ level: 'warn', message: independence.status === 'same' ? 'builder and reviewer use the same configured identity' : 'builder/reviewer independence cannot be verified', nextAction: 'Use different profiles: chalk connect --replace --builder <adapter> --reviewer <different-adapter>' });
  }
  return { ok: !checks.some((item) => item.level === 'fail'), checks };
}
