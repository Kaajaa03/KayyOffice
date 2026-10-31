# kayy-office

Claude Code mod for the Kayy Office overlay (Electron pixel office). Zero LLM calls, no timers while idle, network only to `127.0.0.1`.

> **Do not load kayy-router together with kayy-office.** It already contains the router; both at once route every subagent twice. A toast says so once.

## Install

`/plugin install kayy-office --marketplace Kaajaa03/KayyOffice` (private repo, needs GitHub access). Local checkout: `claude plugin marketplace add <path to the KayyOffice repo>`, then `claude plugin install kayy-office@kayy`. Try without installing: `claude --plugin-dir <this folder>`. Remove: `claude plugin uninstall kayy-office@kayy`.

## What it does

- **Overlay feed**: session, tool, turn and subagent hooks go to `POST /event` with model, cost, context/limit, file and TodoWrite progress. A failed tool is only `ERROR: <tool> failed`, never its output. Config: `%APPDATA%\KayyOffice\config.json` (`{ token, port }`, or `$KAYY_CONFIG_DIR/config.json`). Fire-and-forget; after a failure it stays silent for 30 s. The overlay shows "Claude mod connected" while an event arrived within the last 5 minutes.
- **Auth**: the token is never sent. Requests carry `x-kayy-nonce` and `x-kayy-auth` = HMAC-SHA256(token, `req|nonce|path|body`). A `/permission` reply counts only with a valid `x-kayy-proof` for exactly that decision; otherwise it is `ask`.
- **Approver**: a real call whose core decision is `ask` for a person (never ExitPlanMode; AskUserQuestion has its own card) can be answered from the overlay or the pane; 20 s, then the normal dialog. A core allow/deny is never changed.
- **Questions**: a single-select `AskUserQuestion` (1-4 questions, 2-4 options each) becomes one overlay card per question with a button per option; your click is returned as the tool's answer (`questions` + `answers`). Multi select, text/number questions, 20 s without a click or the app off: Claude's normal dialog. Never a default answer.
- **Decision signal**: `AskUserQuestion` / `ExitPlanMode` send `Entscheidung: <question>`; the pane shows "Entscheidung offen". `ExitPlanMode` is only ever answered by you in Claude's dialog.
- **Router**: routes subagents to haiku/sonnet/opus by type (`rules.json`, edit to change), status line.
- **Orchestrator**: one short policy section in the system prompt: delegate only when it pays, ask only about irreversible actions, direction or cost.
- **Pane**: agents with model and progress (`3/7 · <task>`), cost, `Kontext 34 % · 5h 21 %`, router counts, autopilot counters, open decision, approvals (Erlauben/Ablehnen/Dialog).
- **Roster**: offered user/plugin agent types are sent as a `Roster` event (max 12).

## Commands

| Command | Effect |
|---|---|
| `/office` | open/close the pane |
| `/office status` | agents, approvals, cost, router, autopilot, orchestrator |
| `/office autopilot [on\|off\|status]` | autopilot (default **off**, remembered) |
| `/office orchestrator [on\|off\|status]` | orchestrator policy (default **on**, remembered) |
| `/router [status\|on\|off]` | subagent model routing |

## Autopilot

> **Only for your own, trusted projects.** Source files it may write can still change what an allowed `npm test` or `tsc` runs. Turn it off with `/office autopilot off`.

Only when on, only for a real tool call that a person would be asked about, never for a core allow/deny. Everything else goes the normal way. It allows:

- **Root**: only `$.session.root()` counts. Nothing at all when it is a drive root, your home folder or a parent of it, or under AppData, Windows, Program Files, ProgramData or System32.
- **Reads** (`Read`, `Grep`, `Glob`, `LS`, `NotebookRead`) the tool marks read-only, inside the root, also after resolving links. Never protected folders (`.git`, `.claude`, `.vscode`, `.ssh`, `.aws`, `.azure`, `.kube`, `.docker`, `.config`, `.gnupg`) or secrets (`.env*`, `.npmrc`, `.netrc`, `.git-credentials`, `.gitconfig`, `id_*`, `credentials*`, `token*`, `secrets*`, key/cert files, `*.kdbx`, ...), not even via globs.
- **Edits** (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`) under the same rules, never config or self-running code: `package.json`, lock files, `tsconfig*.json`, `*.config.*`, `.*rc`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`, `.husky/`, `.github/`, `node_modules/`, scripts (`*.cmd`, `*.bat`, `*.ps1`, `*.sh`, `*.vbs`, ...). Path tricks are refused: `..` above the root, mixed slashes, UNC/device paths, `~`, alternate data streams, 8.3 names, DOS device names, control/bidi/zero-width characters.
- **Shell** (`Bash`, `PowerShell`): printable ASCII only, no `$ % ~ ` ^ < > [ ] { } ( ) * ? @ ! #`, no redirects (except `2>&1`), no single `&`. Every segment (split at `;`, `&&`, `||`, `|`, newline) must be an allowlisted command with allowlisted flags, project-relative arguments, and pass the blast-radius check (`riskOf`):
  - `git status|diff|log|show|branch|rev-parse` (read-only flags), `git add <paths>` (no `-f`, `-A`, `.`), `git stash list`. `git commit` always waits for the person (it runs the repo's hooks).
  - `ls`, `dir`, `pwd`, `cat`, `type`, `echo`, `head`/`tail`, `wc`, `grep`/`rg`, `findstr`, `cd`, `Get-ChildItem`, `Get-Content`, `Select-String`, `Test-Path`, `Set-Location`.
  - `npm test`, `npm run build|typecheck|test|lint`, `tsc`/`npx tsc` (`--noEmit`, `-p tsconfig.json`), `vitest`/`npx vitest [run]`, `node --version`.

Never: `ExitPlanMode`, `AskUserQuestion`, MCP tools, `WebFetch`, `WebSearch`.

## Develop

Tests: `claude plugin test <this folder>`. Validate: `claude plugin validate <this folder>`.
