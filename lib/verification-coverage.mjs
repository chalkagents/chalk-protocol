// Coverage is descriptive: it never changes an execution, review or release gate.
const outcome = status => ({ pass: 'passed', passed: 'passed', fail: 'failed', failed: 'failed', skipped: 'unconfigured', deferred: 'deferred' })[status] || 'unknown';

export function verificationCoverage(result, mode = 'task') {
  const freshness = result.freshness || 'unknown';
  const check = (kind, gate, rawOutcome, executed, scope = 'command') => ({
    kind, gate, scope, outcome: rawOutcome, executed,
    status: rawOutcome === 'passed' && freshness !== 'fresh' ? (freshness === 'stale' ? 'stale' : 'unknown') : rawOutcome,
  });
  const browser = (result.e2e || []).map((spec, index) => check('browser', spec.execution?.gate || `e2e-${index}`, spec.status === 'passed' ? 'passed' : 'failed', Boolean(spec.execution?.startedAt), 'specification'));
  const known = new Set(browser.map(check => check.gate));
  // A later replay can fail before runSpecs returns. Its supervisor still retained
  // earlier command outcomes, but those alone cannot establish specification verdicts.
  const recovered = (result.browserCommands || []).filter(command => !known.has(command.gate))
    .map(command => check('browser', command.gate, outcome(command.status), Boolean(command.startedAt)));
  const checks = [
    ...(result.toolchain || []).map(command => check('toolchain', command.gate, outcome(command.status), Boolean(command.startedAt))),
    ...browser, ...recovered,
  ];
  return {
    mode, green: result.green === true, freshness,
    checks, executedChecks: checks.filter(check => check.executed).length,
    integrity: result.integrityChecked ? (result.integrityGreen ? 'passed' : 'failed') : 'not-established',
    review: 'not-evaluated', release: 'not-evaluated', receiptId: result.evidence?.id || null,
  };
}

export function auditCoverage(result) {
  const executed = result.status !== 'unconfigured';
  return {
    green: result.green === true,
    phase: verificationCoverage(result.phaseVerification, 'phase'),
    heldOut: {
      status: executed ? (result.passed ? 'passed' : 'failed') : 'unconfigured', executed,
      lockedFiles: result.heldOutCount,
      integrity: result.broken.length ? 'failed' : result.heldOutCount ? 'passed' : 'no-locked-files',
      independence: 'not-established',
    },
  };
}
