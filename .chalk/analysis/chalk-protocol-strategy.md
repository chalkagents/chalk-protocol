---
title: Chalk Protocol — Strategy & Concept Notes
status: draft
created: 2026-05-27
topic: positioning, ontology, living-docs tooling
---

# Chalk Protocol — Strategy & Concept Notes

A working summary of an early design conversation about defining `.chalk/` as
an open-source convention for human + agent project artifacts.

## The core idea

Standardize a `.chalk/` directory that holds a project's working artifacts as
markdown — the convention author already uses subfolders like:

- `.chalk/plans`
- `.chalk/references`
- `.chalk/analysis`
- `.chalk/issues`
- `.chalk/docs`

Metaphor: a **chalkboard** — shared, visible, written and erased by both humans
and agents, persistent between sessions. That image justifies key design
decisions: committed to git (shared + persistent), co-authored (human + agent),
and lifecycle-aware (active vs. archived).

## What it actually is: convention, not framework

It's best defined as a **convention / spec**, not a "framework" (implies a
runtime) or strictly a "protocol" (implies parties negotiating a format). The
most successful peers are conventions: EditorConfig, Conventional Commits, Keep
a Changelog, `llms.txt`, SemVer.

**Recommendation:** spec-first open convention, with optional reference tooling
later. Define it via a canonical, versioned `SPEC` using RFC 2119 language
(MUST/SHOULD/MAY) with examples. Make it machine-readable (a manifest declaring
spec version + dirs, plus a frontmatter convention so agents can discover, parse,
and cross-link artifacts).

## Positioning decision: superset / interop umbrella

Chosen direction: chalk as a **unifying convention** spanning instructions,
memory, and artifacts — the broadest framing, and the hardest to differentiate.

The risk is xkcd 927 ("now there are N+1 competing standards") and asking people
to abandon tools they already use. The way through:

- **Do not replace existing conventions — embrace them.** `.chalk/` is the
  umbrella that gives `AGENTS.md` / `CLAUDE.md` a home and connects them to the
  memory and artifact planes. Adoption cost drops to near zero; chalk rides
  existing momentum instead of fighting it.
- **Win on a mental model, not features.** A superset only earns its existence
  if it offers a cleaner ontology than the pile of files people have today.

### The three-plane ontology

1. **Guidance** — stable, human-authored intent. Interops with
   `AGENTS.md` / `CLAUDE.md`; includes `docs/`, `references/`.
2. **Working memory** — mutable current state: active context, decisions log,
   progress.
3. **Artifacts** — append-mostly outputs: `plans/`, `analysis/`, `issues/`.

### Conformance ladder (tiny on-ramp for an ambitious scope)

- **L0** — a `.chalk/` with a manifest ("you have chalk")
- **L1** — + artifacts
- **L2** — + working memory
- **L3** — + instructions interop

Lets people adopt incrementally instead of all-at-once.

## Prior art to know (and answer "why not just use X?")

- **Cline "Memory Bank"** — closest existing thing; agent-maintained markdown
  files. Chalk's wedge: a *typed taxonomy of durable artifacts*, not a fixed
  memory set.
- **`AGENTS.md` / `CLAUDE.md` / `.cursor/rules`** — *instructions to the agent*.
  Chalk artifacts are *work products*. "Filing cabinet" vs. "instructions" is the
  clearest differentiator.
- **`llms.txt`** — best playbook for *popularizing* a convention (crisp spec page,
  memorable name, website, public adopter directory).
- **`.github/`, `.vscode/`** — precedent that a dotfolder convention can go
  universal.
- **Swimm / Mintlify** — closest prior art for the living-docs idea below
  (code-coupled docs + drift detection).

## Naming watch-out

`chalk` is one of the most-downloaded npm packages ever (terminal colors).
Serious namespace/discoverability collision. `chalk-protocol` sidesteps it for
the repo/site; decide the npm/PyPI package name and domain early.

## Living-docs tooling idea (`.chalk/docs`)

Concept: **docs as a continuously-maintained build artifact.** Instead of
prompting an AI to "rewrite the docs," software watches changes as the developer
works, analyzes each change's *impact* (major / minor / patch, semver-style), and
makes **targeted, incremental** updates to affected sections in the background —
not a full regeneration. Keeps a *procedural record* of how docs evolved (a docs
changelog), so docs carry their own provenance.

### The hard problems (generation is the easy 20%)

1. **The code↔doc mapping is the real product.** Incremental updates require an
   index linking concepts/modules/APIs → doc locations. Without it you regenerate
   everything; with it you get surgical edits. This is the secret sauce.
2. **Diff noise / stability.** LLMs rephrase even when meaning is unchanged →
   churny, unreviewable diffs. Must change *only* what actually changed.
3. **Silently-wrong docs are worse than stale docs.** Need a confidence/review
   gate; the major/minor classification is the lever — patch flows through, major
   opens a review.

### Trigger

Per-save is too noisy/expensive. The natural atomic unit is the **commit or PR**
(atomic, carries intent, where review already happens). Hook in at the
agent/commit/PR boundary, debounced.

Pipeline: `diff → semantic change analysis (classify + identify affected
concepts) → map to doc sections via the index → propose targeted edits →
confidence gate → commit with provenance`.

## Strategic fork: keep convention and product separate

- **The convention** (`.chalk/` format, frontmatter, provenance, docs-changelog)
  stays tool-agnostic — that's what makes it a *standard* anyone can build on.
- **The auto-doc software** is a *reference implementation* on top — the adoption
  wedge and likely commercial piece.

Fusing them means the "standard" is just one product's file format and nobody
else adopts it.

## Open questions / next decisions

- Does the three-plane model hold up against real `.chalk/` usage, or are there
  things that don't fit cleanly?
- Does the living-docs tool run **live / in-loop** as the agent works, or
  **post-hoc** on each commit/PR? This drives the whole architecture (live needs
  a cheap-to-query code↔doc index; post-hoc can rebuild more per run).
- First deliverable scope: spec-only, spec + README + example structure, or
  spec + tooling design doc.
