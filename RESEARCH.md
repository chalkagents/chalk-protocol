# Chalk Protocol — research basis

Deep-research pass (28 sources, 137 claims extracted, 25 verified by 3-vote adversarial
verification, 23 confirmed / 2 killed). Scope: **code-centric build loop** — what a
layer-2 agent harness should *enforce* to hold AI coding agents to fundamentals.

Core thesis (confirmed): since frontier models are strong coders, the harness should not
try to code better — it should hold the agent to **external verification, locked specs,
and test integrity**. The biggest, best-supported lever is *external verification*, not
TDD-the-procedure.

## The seven evidence-backed primitives

| # | Primitive | Chalk gate | Key source | Confidence |
|---|-----------|-----------|------------|------------|
| P1 | Acceptance-criteria precondition (tests = intent) | `start` refuses without criteria | TiCoder (arXiv 2404.10100) | high |
| P2 | Tests = locked contract + small/single-feature tasks | hash tests; enforce small scope | Tests-as-Prompt (2505.09027) | high |
| P3 | Context over procedure (surface at-risk tests, not a TDD lecture) | `context` emits test-impact map | TDAD (2603.17973) | high (magnitudes refuted) |
| P4 | External verification gate (never self-judgment) | `done` blocked until `verify` green | Huang 2310.01798; CRITIC 2305.11738 (ICLR'24) | high |
| P5 | Review gate, but agent review is insufficient | `review` + DoD blind-spot checklist | Human-AI Synergy (2603.15911) | high |
| P6 | Test-integrity / no agent write-access to oracle | tests read-only + hash check; `amend-spec` gate | ImpossibleBench (2510.20270); METR (2025-06-05) | high |
| P7 | Drift/regression guards scaled to task size | held-out regression set; size-scaled diff discipline | SpecBench (2605.21384) | high (weak fit) |

Prior art to learn from: **Spec-Kit** (github/spec-kit) — gated `specify → clarify → plan
→ tasks → analyze → implement` with test-before-implementation ordering. Gets
spec-as-contract and gated prerequisites right; lacks external-verify + test-integrity.
Community note: "specs don't guarantee correctness" → must pair spec spine with external
verification.

## Hard caveats (do not overstate)

- TiCoder's **+45.97% pass@1** is an *idealized upper bound* (simulated-oracle feedback,
  pre-2024 models). Cite as directional, not a guaranteed delta.
- Two TDAD magnitudes were **refuted in verification** (70%-regression-reduction vote 1-2;
  "TDD-alone-makes-it-worse" vote 0-3). Only the qualitative *context-over-procedure* and
  *naive test-first can backfire on small models* conclusions survived.
- SpecBench's "28pp hack-gap per 10x code size" has weak fit (R²≈0.21), one 30-task bench.
- Reward-hack rates (ImpossibleBench 49–54%, METR 30%) are **adversarial stress-tests**,
  not base rates — but the read-only/hidden-test mitigations are robust and actionable.
- Self-correction findings are strongest on reasoning, generalized to code via the
  unit-test exception.

## Open questions (carry into design)

1. For *current* frontier models on real multi-file repos, is test-before-code as a hard
   precondition net-positive, or should tests be a locked contract rather than a procedural
   prompt? (P1 vs P3 tension.)
2. Right read/write boundary over tests: read-only prevents cheating but blocks legit
   refactors — need a concrete `amend-spec` policy.
3. How to author/maintain a held-out regression suite in a solo BYO-CLI harness with no
   second human?
4. Concrete thresholds for size-scaled diff discipline — no source gives calibrated numbers.

## Sources (primary)

- TiCoder — arXiv 2404.10100 (IEEE TSE 2024)
- Tests as Prompt / WebApp1K — arXiv 2505.09027
- TDAD — arXiv 2603.17973
- LLMs Cannot Self-Correct Reasoning Yet — arXiv 2310.01798 (ICLR 2024)
- CRITIC — arXiv 2305.11738 (ICLR 2024)
- When Can LLMs Actually Correct Their Own Mistakes? — arXiv 2406.01297 (TACL)
- Human-AI Synergy in Agentic Code Review — arXiv 2603.15911
- ImpossibleBench — arXiv 2510.20270 (ICLR 2026)
- METR reward hacking — metr.org/blog/2025-06-05-recent-reward-hacking
- SpecBench — arXiv 2605.21384
- Spec-Kit — github.com/github/spec-kit
