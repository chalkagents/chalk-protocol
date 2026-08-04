// Compatibility facade for the pre-v1 cost helper interface. Provider-aware implementation is
// quarantined under lib/adapters; Protocol v1 adapters return normalized usage directly.
export { isClaudeShaped, withJsonOutput, parseEnvelope, unwrapAgentOutput } from './adapters/legacy-claude-envelope.mjs';
