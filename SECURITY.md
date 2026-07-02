# Security Policy

## What counts as a vulnerability here

Chalk is a harness that *constrains* AI coding agents, so beyond the usual (command injection,
path traversal), we treat **gate-defeat vectors** as security issues: any way an agent — or the
code it writes — can mark work done without the gates passing, read or influence the held-out
regression set (P7 blindness), tamper with locked tests undetected (P6), or smuggle instructions
into reviewer/executor prompts (prompt injection through diffs, task titles, or issue bodies).

## Reporting

Please **do not open a public issue** for vulnerabilities. Instead use
[GitHub private vulnerability reporting](https://github.com/chalkagents/chalk-protocol/security/advisories/new)
on this repository. Include a reproduction if you can — a failing scenario under `node --test`
is ideal.

You'll get an acknowledgment within a few days. Fixes land through chalk's own gated loop and are
credited in the changelog unless you prefer otherwise.

## Scope notes

- Chalk shells out to commands **you configure** (`protocol.verify.*`, executor/reviewer commands).
  Those commands run with your privileges by design; "chalk runs my configured command" is not a
  vulnerability, but "chalk runs something I *didn't* configure" absolutely is.
- Autonomous mode (`chalk run`, `chalk pipeline`) executes an LLM agent with write access to your
  working tree. Run it in a worktree/sandbox and review PRs before merge — the gates reduce, not
  eliminate, the need for human review.
