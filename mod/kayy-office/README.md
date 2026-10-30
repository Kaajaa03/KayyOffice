# kayy-office

Claude Code mod for the Kayy Office overlay (Electron pixel office). Zero LLM calls, no timers while idle, network only to `127.0.0.1`.

> **Do not load kayy-router together with kayy-office.** kayy-office contains the router; both at once route every subagent twice. Disable kayy-router (or leave it out of `--plugin-dir`). A toast says so once on first load.

Install (private repo, needs GitHub access): `/plugin install kayy-office --marketplace Kaajaa03/KayyOffice`. Local checkout: `claude plugin marketplace add <path to the KayyOffice repo>` then `claude plugin install kayy-office@kayy`. Remove: `claude plugin uninstall kayy-office@kayy`.

- **Overlay feed**: maps session/tool/turn/subagent hooks to `POST /event` (`source: "mod"`, `model`, `costUsd`, `file`; a failed tool is only `ERROR: <tool> failed`, never its output). Reads `%APPDATA%\KayyOffice\config.json` (`{ token, port }`, or `$KAYY_CONFIG_DIR/config.json`). Fire-and-forget; after a failure it stays silent for 30 s.
- **Auth**: the token is never sent. Every request carries `x-kayy-nonce` (32 hex, fresh) and `x-kayy-auth` = HMAC-SHA256(token, `req|nonce|path|body`). A `/permission` reply counts only with `x-kayy-proof` = HMAC-SHA256(token, `res|nonce|decision`) for exactly that decision; otherwise it is `ask`. Own pure-TS SHA-256/HMAC.
- **Approver**: forwards only a real call (`tool_use_id` set) whose ask a person answers (`approver: "person"`), with a core `ask`, never ExitPlanMode/AskUserQuestion. Timeout 20 s, then the normal dialog. A core allow/deny is never changed.
- **Router**: kayy-router's rules (`rules.json`), `/router [status|on|off]`, status line.
- **Pane**: `/office` opens/closes it (agents, models, cost, router counts, autopilot counters, open decision, approvals with Erlauben/Ablehnen/Dialog); `/office status` prints a summary.
- **Decision signal**: when Claude calls `AskUserQuestion` or `ExitPlanMode`, the overlay gets a `Notification` event `Entscheidung: <question, max. 120 chars>` and the pane shows "Entscheidung offen". Nobody but you answers such questions.
- **Progress**: when an agent calls `TodoWrite`, the `PostToolUse` event carries `progress: { done, total, current? }` (`done` = completed tasks, `total` = all valid tasks, 1-99, else none; `current` = the in-progress task's `activeForm` or `content`, control characters removed, max. 80 chars). Sent only when it differs from that agent's last one, never for other tools or after a failed call. The pane appends `3/7 · <current>` to the agent row until its Stop/turn end. Costs no tokens: the data is already in the tool call.

## Commands

| Command | Effect |
|---|---|
| `/office` | open/close the pane |
| `/office status` | agents, open approvals, cost, router, autopilot, orchestrator |
| `/office autopilot [on\|off\|status]` | autopilot (default **off**, remembered across sessions) |
| `/office orchestrator [on\|off\|status]` | orchestration policy in the system prompt (default **on**, remembered) |
| `/router [status\|on\|off]` | model routing for subagents |

## Autopilot: what it lets through

> **Only for your own, trusted projects.** Ordinary source files autopilot may write can still change what an allowed `npm test` or `tsc` runs afterwards. Default **off**.

Only when it is on, the engine itself would **ask** (a core allow or deny is never changed), the ask is for a real tool call and a person would answer it. Then it allows (reason `Kayy Autopilot: …`) only:

- **Project root**: only `$.session.root()` counts; the cwd serves only as the base for relative paths, and only when it lies inside the root. Autopilot does nothing at all when the root is a drive root, your home folder or a parent of it, or lies under AppData, Windows, Program Files, ProgramData or System32.
- **Reads** (`Read`, `Grep`, `Glob`, `LS`, `NotebookRead`) the tool itself marks read-only, inside the root, both as spelled and where links lead; never protected folders (`.git`, `.claude`, `.vscode`, `.ssh`, `.aws`, `.azure`, `.kube`, `.docker`, `.config`, `.gnupg`) or secrets (`.env*`, `.npmrc`, `.netrc`, `.git-credentials`, `.gitconfig`, `id_*`, `credentials*`, `token*`, `secrets*`, `*.pem`, `*.p12`, `*.pfx`, `*.key`, `*.kdbx`, …), not even through search globs such as `**/.env*`.
- **Edits** (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`) under the same rules, and never config or code that runs by itself: `package.json`, lock files, `tsconfig*.json`, `*.config.*`, `.*rc`, `.npmrc`, `.mcp.json`, `.gitattributes`, `.gitmodules`, `CLAUDE.md`, `AGENTS.md`, `electron-builder.yml`, anything in `.husky/`, `.github/`, `node_modules/`, and scripts (`*.cmd`, `*.bat`, `*.ps1`, `*.sh`, `*.vbs`, …). Ordinary `.ts`/`.tsx`/`.js` sources stay writable. Refused path tricks: `..` above the root, mixed slashes, case on Windows, UNC/device paths, `C:x`, `~`, alternate data streams, 8.3 short names, trailing dots/spaces, DOS device names (`con`, `nul.txt`), control/bidi/zero-width characters.
- **Shell** (`Bash`, `PowerShell`): printable ASCII only; none of these characters: dollar, percent, tilde, backtick, caret, `<`, `>`, brackets of any kind, `*`, `?`, `@`, `!`, `#`; no redirects (except `2>&1`), no single `&`, no backslash next to a quote, no provider paths (`env:`, `HKCU:`), no `-exec`. Every segment (split at `;`, `&&`, `||`, `|`, newline) must be an allowlisted command with allowlisted flags only, every argument a project-relative path without protected folders or secrets, and the blast-radius check (`riskOf`) must find nothing:
  - `git status [-s|--short|-b|--branch|--porcelain]`, `git diff|log|show [--stat|--name-only|--name-status|--oneline|-n N|--no-color|--cached|--staged|--]` (plus `git log -N`), `git branch [-a|-r|--list|-v|--show-current]`, `git add <paths>` (no `-f`, `-A`, `.`), `git commit [-a] -m <msg> [--allow-empty]`, `git stash list`, `git rev-parse [--short|--abbrev-ref|--show-toplevel] HEAD`.
  - `ls`, `dir`, `pwd`, `cat`, `type`, `echo`, `head`/`tail` (`-n N`, `-N`), `wc` (`-l -w -c -m`), `grep`/`rg` (short safe flags such as `-n -i -r -l -c -w -F`), `findstr` (`/n /i /s …`), `cd`, `Get-ChildItem`, `Get-Content`, `Select-String`, `Test-Path`, `Set-Location`.
  - exactly `npm test` or `npm run build|typecheck|test|lint`; `tsc`/`npx tsc` alone, with `--noEmit` and/or `-p tsconfig.json`; `vitest`/`npx vitest` alone or with `run`; `node --version`.

Never: `ExitPlanMode`, `AskUserQuestion`, MCP tools, `WebFetch`, `WebSearch`, anything else. Everything not allowed goes the normal way (overlay card or dialog) and counts as "gefragt". Turn it off with `/office autopilot off`.

## Orchestrator

Adds one short English section (≤ 110 words, scope `session`) at the end of the system prompt: delegate searching/reading to `kayy-scout`, clear implementation to `kayy-coder`, design/hard debugging/security to `kayy-architect`, independent subtasks in parallel, nothing trivial; ask the user only about irreversible/destructive actions, direction/architecture or cost, otherwise decide, state the assumption in one line and continue. Turn it off with `/office orchestrator off`.

Run with `claude --plugin-dir <this folder>`. Tests: `claude plugin test <this folder>`.
