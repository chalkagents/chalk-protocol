---
generator: chalk-protocol
id: "task-459bc189"
name: "fix: evidence-push failures are swallowed (catch{}) — blob-SHA 404s surface as broken PR images"
overview: "a failed git push in chalk evidence is no longer swallowed: a visible ⚠ warning line names the push failure and its cause"
created: "2026-07-06T06:46:13.557Z"
todos:
  - id: "task-459bc189-c1"
    content: "a failed git push in chalk evidence is no longer swallowed: a visible ⚠ warning line names the push failure and its cause"
    status: done
  - id: "task-459bc189-c2"
    content: "when the push fails, the PR body is NOT edited with blob-SHA image URLs (no 404 images land in the PR); the final status line says the screenshots were captured but not attached"
    status: done
  - id: "task-459bc189-c3"
    content: "when the push succeeds, behavior is unchanged: the evidence markdown with commit-SHA blob URLs is appended to the PR body"
    status: done
  - id: "task-459bc189-c4"
    content: "an e2e test drives the REAL push path via the bare-remote + stub-gh fixture pattern (per repoWithBare in test/gate-hardening.test.mjs): one case with a working remote asserting the body edit, one with a broken remote asserting the ⚠ line and the skipped body edit"
    status: done
---

# fix: evidence-push failures are swallowed (catch{}) — blob-SHA 404s surface as broken PR images

> state: **done** · phase: discovery

## Objective

- a failed git push in chalk evidence is no longer swallowed: a visible ⚠ warning line names the push failure and its cause
- when the push fails, the PR body is NOT edited with blob-SHA image URLs (no 404 images land in the PR); the final status line says the screenshots were captured but not attached
- when the push succeeds, behavior is unchanged: the evidence markdown with commit-SHA blob URLs is appended to the PR body
- an e2e test drives the REAL push path via the bare-remote + stub-gh fixture pattern (per repoWithBare in test/gate-hardening.test.mjs): one case with a working remote asserting the body edit, one with a broken remote asserting the ⚠ line and the skipped body edit

## Locked tests (read-only — P6)

- `test/evidence-push.test.mjs`

## Reviews

- **block** · 2026-07-06T07:17 · adversary
- **pass** · 2026-07-06T07:20 · adversary

---
_Generated from `.chalk/tasks.json` by `chalk plans`. Edit tasks via the chalk CLI, not here._
