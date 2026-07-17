// Chalk Protocol — opt-in anonymous activation telemetry (#154). We have ~200 npm downloads/week but
// zero activation visibility: we can't tell how many installs ever ran `chalk init`, let alone reached
// a green verify. This reports FUNNEL MILESTONES ONLY (init → first green verify → first done) + the
// CLI version + a random anonymous install id — NOTHING else. No code, paths, prompts, diffs, or repo
// identity ever leave the machine.
//
// The audience is telemetry-allergic, so the bar is high and the defaults are strict:
//   • OPT-IN — OFF unless `protocol.telemetry.enabled === true` (prompted once at `chalk init`, default N).
//   • Kill switches — `CHALK_TELEMETRY=0` (env) hard-disables; CI is stripped by default.
//   • Fire-and-forget — best-effort, non-blocking; ANY failure is swallowed and never changes an exit code.
//   • Inspectable — `chalk telemetry --show` prints exactly what would be sent.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// The COMPLETE whitelist of fields that may ever be transmitted. Anything outside this set is a bug;
// `buildPayload` only ever emits these keys, and `whitelistPayload` strips everything else (defense in
// depth) so a future edit can't silently widen the payload.
export const TELEMETRY_FIELDS = ['event', 'version', 'installId', 'ts'];

// The only milestones we report — the activation funnel.
export const TELEMETRY_EVENTS = ['init', 'verify', 'done'];

// Best-effort collector endpoint; overridable via `protocol.telemetry.endpoint` or the
// `CHALK_TELEMETRY_ENDPOINT` env var (self-hosting / tests).
export const DEFAULT_ENDPOINT = 'https://telemetry.chalk-protocol.dev/v1/event';

// Precedence: explicit arg → env override → config → default.
export function resolveEndpoint({ endpoint, config, env = {} } = {}) {
  return endpoint || env.CHALK_TELEMETRY_ENDPOINT || (config && config.endpoint) || DEFAULT_ENDPOINT;
}

// Pure: is telemetry ENABLED for an emit right now? Opt-in — false in every context except an explicit
// config opt-in, and never when a kill switch is set. This is the single gate every emit passes through.
export function telemetryEnabled({ config, env = {} } = {}) {
  const flag = env.CHALK_TELEMETRY;
  if (flag === '0' || flag === 'false' || flag === 'off') return false; // hard kill switch (env)
  if (env.CI) return false;                                             // strip on CI by default
  if (!config || config.enabled !== true) return false;                 // OPT-IN: default OFF
  return true;
}

// The one-time opt-in prompt for `chalk init`. Guards: interactive TTY only, never on CI or under the
// kill switch. Consent is AFFIRMATIVE — only "y"/"yes" accepts; EOF, empty, or anything else declines
// (default N), because a surprise phone-home costs more trust than the data is worth. Injectable I/O
// (`read` returns the typed line, `write` prints the question) so the semantics are unit-testable.
export function promptTelemetryOptIn({ isTTY = false, env = {}, read = () => '', write = () => {} } = {}) {
  if (!isTTY) return false;                                              // piped / CI / scripted → decline silently
  if (env.CI) return false;
  const flag = env.CHALK_TELEMETRY;
  if (flag === '0' || flag === 'false' || flag === 'off') return false;  // already opted out
  write('help improve chalk? send anonymous usage stats (funnel milestones + version only, no code/paths) [y/N] ');
  const answer = String(read() || '').trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

// Pure: build the milestone payload — ONLY the whitelisted fields, nothing derived from the repo.
export function buildPayload({ event, version, installId, ts }) {
  return { event, version, installId, ts };
}

// Pure: strip any non-whitelisted key (defense in depth). Every payload passes through this before it
// can be shown or sent, so even a buggy caller can't leak a stray field.
export function whitelistPayload(obj = {}) {
  const out = {};
  for (const k of TELEMETRY_FIELDS) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

const readState = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
const writeState = (file, s) => { try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(s)); } catch { /* best-effort local state */ } };

// The anonymous per-install id, read from local state. `create` mints + persists one only when asked —
// so an OFF install never writes an id (criterion: OFF ⇒ no install-id write).
export function installId(stateFile, { create = false, gen = randomUUID } = {}) {
  const st = readState(stateFile);
  if (st.installId) return st.installId;
  if (!create) return null;
  const id = gen();
  writeState(stateFile, { ...st, installId: id });
  return id;
}

// The next funnel milestone that hasn't been delivered yet (or null when the funnel is complete). This
// is what `chalk telemetry --show` samples, so the shown payload matches what would actually go next.
export function nextUnsentEvent(stateFile) {
  const st = readState(stateFile);
  const sent = st.sent || {};
  return TELEMETRY_EVENTS.find((e) => !sent[e]) || null;
}

// Default sender: a POST bounded by a SHORT timeout so a slow/hung endpoint can't stall a command for
// long. Rejects on any network error — emitMilestone treats that as "not delivered" and will retry next
// run (a dropped send is never recorded as sent), and swallows the rejection so the caller is untouched.
async function defaultSend(endpoint, payload) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 700);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`telemetry endpoint ${res.status}`);
  } finally { clearTimeout(timer); }
}

// Emit a funnel milestone. FULLY GUARDED: returns the delivered payload or null when inert/failed, and
// NEVER throws — a network/DNS failure, an unreachable endpoint, or a bad state file all resolve to null
// so the caller's exit code is untouched. Each milestone is recorded as sent ONLY after a successful
// delivery, so a dropped send is retried on the next run rather than lost. The anonymous install id is
// minted+persisted only when telemetry is enabled (an OFF install writes nothing).
export async function emitMilestone({
  event, config, env = {}, stateFile, version,
  endpoint, now, send = defaultSend, gen = randomUUID,
} = {}) {
  try {
    if (!TELEMETRY_EVENTS.includes(event)) return null;
    if (!telemetryEnabled({ config, env })) return null;
    const st = readState(stateFile);
    if (st.sent && st.sent[event]) return null;                 // already delivered this milestone
    const id = st.installId || gen();
    if (id !== st.installId) writeState(stateFile, { ...st, installId: id }); // persist the anon id (enabled only)
    const payload = whitelistPayload(buildPayload({ event, version, installId: id, ts: now }));
    await send(resolveEndpoint({ endpoint, config, env }), payload); // throws ⇒ not marked sent
    const cur = readState(stateFile);
    writeState(stateFile, { ...cur, installId: id, sent: { ...(cur.sent || {}), [event]: now } });
    return payload;
  } catch { return null; }
}

// The `chalk telemetry --show` view model: the resolved enabled state, the active kill switches, and the
// EXACT payload shape that would be sent. Pure — the command just prints this.
export function telemetryStatus({ config, env = {}, stateFile, version, now } = {}) {
  const enabled = telemetryEnabled({ config, env });
  const id = installId(stateFile, { create: false }) || '(assigned on first enabled emit)';
  const nextEvent = nextUnsentEvent(stateFile) || TELEMETRY_EVENTS[0];
  const samplePayload = whitelistPayload(buildPayload({ event: nextEvent, version, installId: id, ts: now }));
  return {
    enabled,
    optedIn: !!(config && config.enabled === true),
    killSwitch: (env.CHALK_TELEMETRY === '0' || env.CHALK_TELEMETRY === 'false' || env.CHALK_TELEMETRY === 'off') ? 'CHALK_TELEMETRY' : env.CI ? 'CI' : null,
    endpoint: resolveEndpoint({ config, env }),
    fields: TELEMETRY_FIELDS,
    events: TELEMETRY_EVENTS,
    nextEvent,
    samplePayload,
  };
}
