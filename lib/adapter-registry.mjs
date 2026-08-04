// The provider-neutral registry consumes adapter-owned manifests. Adding discovery knowledge belongs
// in an adapter manifest; connect and workflow modules never learn provider commands or flags.
import { CLAUDE_ADAPTER_MANIFEST } from './adapters/claude.mjs';
import { OPENCODE_ADAPTER_MANIFEST } from './adapters/opencode.mjs';
import { CODEX_ADAPTER_MANIFEST } from './adapters/codex.mjs';
import { GEMINI_ADAPTER_MANIFEST } from './adapters/gemini.mjs';

export const ADAPTER_MANIFESTS = Object.freeze(Object.fromEntries([
  CLAUDE_ADAPTER_MANIFEST, OPENCODE_ADAPTER_MANIFEST, CODEX_ADAPTER_MANIFEST, GEMINI_ADAPTER_MANIFEST,
].map((manifest) => [manifest.id, manifest])));

export const adapterManifest = (id, manifests = ADAPTER_MANIFESTS) => manifests[String(id || '')] || null;

export function discoverAdapters({ manifests = ADAPTER_MANIFESTS, binaries = {}, env = process.env, spawn } = {}) {
  return Object.values(manifests).map((manifest) => manifest.probe({ binary: binaries[manifest.id], env, spawn }));
}
