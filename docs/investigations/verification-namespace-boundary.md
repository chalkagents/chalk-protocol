# Verification namespace boundary: accepted direction

Status: the user approved conservative namespace checks first. Implementation and validation are in progress; task `task-3689504d` remains incomplete. The observations below describe the original reproduction before the fix.

The latest Codex review reproduced a false GREEN in the locked transient-input test in 3 of 16 isolated repetitions. The existing observer waits 250 ms and drains callbacks already delivered. It has no proof that notifications for vanished new files have arrived. Existing-file metadata checks cannot detect an absent-before, absent-after file.

## Deterministic reproduction

Run from the Chalk repository:

```sh
node docs/investigations/verification-namespace-probe.mjs
```

The probe uses disposable temporary repositories and a preload that withholds only `ephemeral.js` notifications. All other notifications and real verification commands run normally. It creates, reads, and deletes the transient input during final input collection. It does not edit the Chalk application, locked tests, or completion state. It must run where filesystem watching is supported; a restricted macOS sandbox returned EMFILE and correctly closed the gate, which is not evidence about this race.

Observed on macOS outside that sandbox:

| Scenario | Current result | Source directory metadata changed |
| --- | --- | --- |
| Unchanged | GREEN / fresh | No |
| Create and remove explicitly ignored build directory | GREEN / fresh | Yes |
| Create, read, and remove ordinary source; notification withheld | **Incorrect GREEN / fresh** | Yes |
| Both preceding mutations; only source notification withheld | **Incorrect GREEN / fresh** | Yes |

A directory metadata change is a useful conservative signal. However, an ignored-output notification cannot account for all changes to that directory: the fourth case has both an ignored operation and an unseen source operation. Advancing the baseline after an ignored notification would keep the false GREEN.

## Platform evidence

[Watchman's synchronization documentation](https://facebook.github.io/watchman/docs/cookies) describes cookie barriers, but explicitly reports that macOS FSEvents may deliver earlier changes after both the cookie and `FSEventStreamFlushSync`. Installing Watchman or increasing the drain timer therefore does not establish the promised completeness boundary on this host.

## Reviewable alternatives

1. **Conservative namespace checks first.** Treat changes to source-directory membership as unresolved identity and close the gate, even when some received notifications name ignored output. Generated files remain supported inside stable, pre-existing directories excluded from source observation. A command that creates/removes an ignored directory directly beside source must prepare that directory before verification and retain it, or redirect its output. This tightens compatibility and requires a sanctioned amendment of the current positive test in `verification-recovery-boundaries.test.mjs`. It must not be represented as a transparent bug fix. Directory identity must be captured before execution, checked at completion, and never reset merely because an ignored event arrived. The completion timestamp and subsequent validation need an explicit, tested observation boundary; this probe is not proof of that implementation.

2. **Protected verification runner first.** Run the checks against an isolated source snapshot with enforced source protection and explicit writable output/cache locations. This aligns with the original P1 direction, but needs platform enforcement, toolchain/path compatibility checks, and tests proving denied source writes cannot silently satisfy a gate. Copying files or changing mode bits alone is insufficient. It is a larger change than the current evidence-record task and can still require output-path configuration.

Decision: option 1 as a smaller fail-closed slice, followed by the protected runner. The compatibility test is amended through `chalk amend-spec`: creating/removing the ignored directory must close the gate, and generated files inside a stable ignored directory must still pass. Existing negative assertions remain. Evidence reuse remains unimplemented and must not be enabled from these observational receipts. Implementation still requires full verification and Codex review.
