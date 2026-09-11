// External adequacy and review commands run after the first verification. Callers must
// share one policy for re-binding evidence to their final source state before advancing.
export function verifyAfterExternalGates({ gates = [], externalRan = false, verify }) {
  if (!externalRan && !gates.some(gate => gate && !gate.skipped)) return null;
  return verify();
}
