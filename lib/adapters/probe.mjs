// Offline CLI discovery shared by first-party adapter manifests. A probe may inspect only local
// executable/version/auth state; it never sends a prompt or makes a model call.
import { launchCommand } from '../process.mjs';

const clean = (value) => String(value || '').trim().split('\n')[0].slice(0, 200);
// Starting a CLI can take several seconds when the host is saturated (notably the complete test
// suite on Windows). Two seconds made an installed CLI look like a harmless version warning before
// its authentication probe could run, allowing `chalk connect` to report success incorrectly.
const PROBE_TIMEOUT_MS = 10_000;

export function probeCli(definition, options = {}) {
  const spawn = options.spawn || launchCommand;
  const env = options.env || process.env;
  const binary = String(options.binary || definition.binary);
  const run = (args) => spawn(binary, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: PROBE_TIMEOUT_MS, env, shell: false,
  });
  const version = run(definition.versionArgs || ['--version']);
  if (version.error?.code === 'ENOENT') return {
    adapter: definition.id, displayName: definition.displayName, binary, installed: false,
    authentication: 'unknown', status: 'missing', version: '',
    message: `${definition.displayName} was not found at ${binary}`,
    nextAction: definition.installCommand,
  };
  if (version.error || version.status !== 0) return {
    adapter: definition.id, displayName: definition.displayName, binary, installed: true,
    authentication: 'unknown', status: 'warning', version: '',
    message: `${definition.displayName} was found but its offline version probe failed: ${clean(version.stderr || version.error?.message || `exit ${version.status}`)}`,
    nextAction: `Check ${binary} --version, then update or reinstall with: ${definition.installCommand}`,
  };

  let authentication = 'unknown';
  let authMessage = 'authentication is not checked by this CLI offline';
  if (definition.authProbeArgs) {
    const auth = run(definition.authProbeArgs);
    if (!auth.error && auth.status === 0) {
      authentication = 'ready';
      authMessage = 'local CLI authentication is ready';
    } else {
      authentication = 'missing';
      authMessage = `authentication is missing or expired${clean(auth.stderr || auth.stdout) ? `: ${clean(auth.stderr || auth.stdout)}` : ''}`;
    }
  }
  return {
    adapter: definition.id, displayName: definition.displayName, binary, installed: true,
    authentication, status: authentication === 'missing' ? 'auth-missing' : authentication === 'unknown' ? 'warning' : 'ready',
    version: clean(version.stdout || version.stderr), message: `${definition.displayName} detected; ${authMessage}`,
    nextAction: authentication === 'missing' ? definition.authCommand
      : authentication === 'unknown' ? `Run chalk agent test ${definition.id} --live to verify authentication with one explicit model call`
        : '',
  };
}
