# Provider adapter capability matrix

The first-party adapters implement the same `chalk-agent-adapter/1` boundary. Provider choice does
not change Chalk's task or gate semantics. This table is checked against the exported adapter
manifests by the documentation tests.

| Adapter | Canonical roles | Permission modes | Output kinds |
|---|---|---|---|
| Claude Code (`claude`) | executor, planner, reviewer, discovery, feedback, retro, handoff, pr-narrative, regression-author | read-only, workspace-write | text, json, none |
| OpenCode (`opencode`) | executor, planner, reviewer, discovery, feedback, retro, handoff, pr-narrative, regression-author | read-only, workspace-write | text, json, none |
| Codex CLI (`codex`) | executor, planner, reviewer | read-only, workspace-write | text, json |
| Gemini CLI (`gemini`) | executor, planner, reviewer | read-only, workspace-write | text, json |

<!-- adapter-manifest claude roles=executor,planner,reviewer,discovery,feedback,retro,handoff,pr-narrative,regression-author access=read-only,workspace-write output=text,json,none -->
<!-- adapter-manifest opencode roles=executor,planner,reviewer,discovery,feedback,retro,handoff,pr-narrative,regression-author access=read-only,workspace-write output=text,json,none -->
<!-- adapter-manifest codex roles=executor,planner,reviewer access=read-only,workspace-write output=text,json -->
<!-- adapter-manifest gemini roles=executor,planner,reviewer access=read-only,workspace-write output=text,json -->

`read-only` and `workspace-write` are Protocol v1 capabilities, not claims that every provider uses
the same flags. Each adapter maps them to its CLI's native permission controls, and Chalk
independently detects workspace mutations after read-only calls. Unsupported roles return an
explicit `unsupported` response instead of silently falling back.

For setup and provider-specific permission mappings, see [Connect](./CONNECT.md),
[Claude Code](./integrations/claude-code.md), [OpenCode](./integrations/opencode.md),
[Codex CLI](./integrations/codex.md), and [Gemini CLI](./integrations/gemini-cli.md).
