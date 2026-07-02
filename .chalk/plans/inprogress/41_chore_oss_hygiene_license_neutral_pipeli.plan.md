---
generator: chalk-protocol
id: "task-5223a193"
name: "chore: OSS hygiene — LICENSE, neutral pipeline-test fixtures, issue/PR templates, CONTRIBUTING/SECURITY/CODE_OF_CONDUCT"
overview: "LICENSE file exists at repo root with the full MIT text (matches package.json license: MIT)"
created: "2026-07-02T05:00:52.825Z"
todos:
  - id: "task-5223a193-c1"
    content: "LICENSE file exists at repo root with the full MIT text (matches package.json license: MIT)"
    status: pending
  - id: "task-5223a193-c2"
    content: "test/pipeline.test.mjs uses neutral fixtures — no github.com-devid or personal remote; full suite green"
    status: pending
  - id: "task-5223a193-c3"
    content: ".github/ISSUE_TEMPLATE has bug_report.yml (asks chalk version + doctor output), friction_report.yml (where did you get stuck), feature_request.yml; PULL_REQUEST_TEMPLATE.md exists"
    status: pending
  - id: "task-5223a193-c4"
    content: "CONTRIBUTING.md (chalk-loop contribution flow + node --test), SECURITY.md (private disclosure), CODE_OF_CONDUCT.md exist at root"
    status: pending
  - id: "task-5223a193-c5"
    content: "README has a Status & feedback section linking the friction-report template"
    status: pending
---

# chore: OSS hygiene — LICENSE, neutral pipeline-test fixtures, issue/PR templates, CONTRIBUTING/SECURITY/CODE_OF_CONDUCT

> state: **in-progress** · phase: discovery

## Objective

- LICENSE file exists at repo root with the full MIT text (matches package.json license: MIT)
- test/pipeline.test.mjs uses neutral fixtures — no github.com-devid or personal remote; full suite green
- .github/ISSUE_TEMPLATE has bug_report.yml (asks chalk version + doctor output), friction_report.yml (where did you get stuck), feature_request.yml; PULL_REQUEST_TEMPLATE.md exists
- CONTRIBUTING.md (chalk-loop contribution flow + node --test), SECURITY.md (private disclosure), CODE_OF_CONDUCT.md exist at root
- README has a Status & feedback section linking the friction-report template

## Locked tests (read-only — P6)

- `test/oss-files.test.mjs`

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
