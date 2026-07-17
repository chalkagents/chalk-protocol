// Chalk Protocol — opt-out update notifier (#158). chalk is a globally-installed npm CLI with no
// update story, so users silently run stale copies and hit already-fixed bugs. This surfaces a
// one-line, dim, NON-BLOCKING notice when a newer `latest` exists on the registry. Zero-dependency
// (a tiny homegrown check, not `update-notifier`), throttled + cached (once/day), and INERT in every
// non-interactive / opted-out context — it must never slow, break, or change the exit code of a
// command, and must stay silent under --json, on CI, when piped, offline, or disabled.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { cmpSemver } from './store.mjs';

export const UPDATE_CACHE = join(homedir(), '.cache', 'chalk-protocol', 'update-check.json');
const DAY_MS = 24 * 60 * 60 * 1000;

// Pure: should the update check be SKIPPED? True in every non-interactive or opted-out context. The
// isTTY guard is load-bearing — it makes the notifier inert under test/CI/pipe with zero side effects.
export function shouldSkipUpdateCheck({ isTTY, json, env = {}, updateCheckConfig } = {}) {
  if (!isTTY) return true;                        // piped / CI / test — never nag non-interactively
  if (json) return true;                          // machine-readable output must stay clean
  if (env.CI) return true;
  if (env.CHALK_NO_UPDATE_CHECK) return true;     // explicit opt-out
  if (updateCheckConfig === false) return true;   // protocol.updateCheck: false
  return false;
}

// Pure: the one-line notice, or null when `latest` is not strictly newer (or inputs are bad).
export function updateNotice(current, latest) {
  if (!current || !latest || cmpSemver(latest, current) <= 0) return null;
  return `update available: ${current} → ${latest} · run \`npm i -g chalk-protocol@latest\``;
}

const readCache = () => { try { return JSON.parse(readFileSync(UPDATE_CACHE, 'utf8')); } catch { return null; } };
const writeCache = (o) => { try { mkdirSync(dirname(UPDATE_CACHE), { recursive: true }); writeFileSync(UPDATE_CACHE, JSON.stringify(o)); } catch { /* best-effort */ } };

// Best-effort registry fetch of the `latest` dist-tag, bounded by a short timeout. Never throws.
async function defaultFetchLatest() {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1500);
    const res = await fetch('https://registry.npmjs.org/chalk-protocol/latest', { signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json())?.version || null;
  } catch { return null; }
}

// Resolve the latest version, preferring a fresh (<1 day) cache to any network. Injectable clock +
// fetcher + cache I/O for tests. Returns null on any failure — the caller then simply shows nothing.
export async function resolveLatest({ now, fetchLatest = defaultFetchLatest, read = readCache, write = writeCache } = {}) {
  const cache = read();
  if (cache && cache.latest && cache.at && (now - cache.at) < DAY_MS) return cache.latest; // fresh → no network
  const latest = await fetchLatest();
  if (latest) write({ latest, at: now });
  return latest;
}

// The full check + notice, fully guarded. Returns the notice string (already printed by the caller is
// up to it) or null. Wrapped so ANY failure is swallowed — an update check must never affect a command.
export async function checkForUpdate({ current, isTTY, json, env, updateCheckConfig, now, ...io } = {}) {
  try {
    if (shouldSkipUpdateCheck({ isTTY, json, env, updateCheckConfig })) return null;
    return updateNotice(current, await resolveLatest({ now, ...io }));
  } catch { return null; }
}
