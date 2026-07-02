---
generator: chalk-protocol
id: "task-76eda7af"
name: "chore: npm publish readiness — package metadata + files array, release.yml trusted publishing, pack-manifest test"
overview: "npm tarball carries all runtime-resolved + onboarding files (adapters, share/agents, LICENSE, QUICKSTART/PROTOCOL/RESEARCH) and never the dogfood spine or tests (npm pack pinned)"
created: "2026-07-02T05:01:09.171Z"
todos:
  - id: "task-76eda7af-c1"
    content: "npm tarball carries all runtime-resolved + onboarding files (adapters, share/agents, LICENSE, QUICKSTART/PROTOCOL/RESEARCH) and never the dogfood spine or tests (npm pack pinned)"
    status: done
  - id: "task-76eda7af-c2"
    content: "registry metadata set: repository/bugs/homepage/keywords, MIT, bin.chalk, engines node>=18"
    status: done
  - id: "task-76eda7af-c3"
    content: "publishConfig: public access + provenance by default"
    status: done
  - id: "task-76eda7af-c4"
    content: "release.yml publishes via OIDC trusted publishing on v* tags (id-token write, no secrets wired), runs node --test BEFORE publish, normalizes version from the tag; follow-up task queued for chalk release --commit"
    status: done
---

# chore: npm publish readiness — package metadata + files array, release.yml trusted publishing, pack-manifest test

> state: **done** · phase: discovery

## Objective

- npm tarball carries all runtime-resolved + onboarding files (adapters, share/agents, LICENSE, QUICKSTART/PROTOCOL/RESEARCH) and never the dogfood spine or tests (npm pack pinned)
- registry metadata set: repository/bugs/homepage/keywords, MIT, bin.chalk, engines node>=18
- publishConfig: public access + provenance by default
- release.yml publishes via OIDC trusted publishing on v* tags (id-token write, no secrets wired), runs node --test BEFORE publish, normalizes version from the tag; follow-up task queued for chalk release --commit

## Locked tests (read-only — P6)

- `test/package.test.mjs`

## Reviews

- **pass** · 2026-07-02T06:36 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
