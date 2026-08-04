// Compatibility transport for pre-v1 command strings. Provider quirks retained for old configured
// commands stay quarantined here; new provider profiles use the versioned adapter transport.
import { isClaudeShaped, parseEnvelope, unwrapAgentOutput, withJsonOutput } from './cost.mjs';
import { launchShellCommand } from './process.mjs';

export function invokeRawCommand(command, input, request, stream) {
  const capture = !stream || isClaudeShaped(command);
  const captureStderr = request.stderr === 'capture';
  const invokedCommand = capture ? withJsonOutput(command) : command;
  const processResult = launchShellCommand(invokedCommand, {
    cwd: request.cwd,
    input,
    encoding: capture ? 'utf8' : undefined,
    stdio: ['pipe', capture ? 'pipe' : 'inherit', captureStderr ? 'pipe' : (request.stderr === 'ignore' ? 'ignore' : 'inherit')],
    timeout: request.timeout,
    maxBuffer: request.maxBuffer,
    env: request.env,
  });
  const stdout = capture ? String(processResult.stdout || '') : '';
  const stderr = captureStderr ? String(processResult.stderr || '') : '';
  const failureOutput = request.failureOutput || 'stdout';
  const raw = processResult.status === 0
    ? stdout
    : failureOutput === 'combined' ? `${stdout}${stderr}`
      : failureOutput === 'stdout-first' ? (stdout || stderr) : stdout;
  return { processResult, capture, stderr, raw, unwrapped: unwrapAgentOutput(raw), malformedEnvelope: /['"]type['"]\s*:\s*['"]result['"]/.test(raw) && !parseEnvelope(raw) };
}
