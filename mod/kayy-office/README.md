# kayy-office

Claude Code mod for the Kayy Office overlay (Electron pixel office). Zero LLM calls, no timers while idle, network only to `127.0.0.1`.

> **Do not load kayy-router together with kayy-office.** kayy-office contains the router; both at once route every subagent twice. Disable kayy-router (or leave it out of `--plugin-dir`). A toast says so once on first load.

- **Overlay feed**: maps session/tool/turn/subagent hooks to `POST /event` (`source: "mod"`, `model`, `costUsd`, `file`; a failed tool is only `ERROR: <tool> failed`, never its output). Reads `%APPDATA%\KayyOffice\config.json` (`{ token, port }`, or `$KAYY_CONFIG_DIR/config.json`). Fire-and-forget; after a failure it stays silent for 30 s.
- **Auth**: the token is never sent. Every request carries `x-kayy-nonce` (32 hex, fresh) and `x-kayy-auth` = HMAC-SHA256(token, `req|nonce|path|body`). A `/permission` reply counts only with `x-kayy-proof` = HMAC-SHA256(token, `res|nonce|decision`) for exactly that decision; otherwise it is `ask`. Own pure-TS SHA-256/HMAC.
- **Approver**: forwards only a real call (`tool_use_id` set) whose ask a person answers (`approver: "person"`), with a core `ask`, never ExitPlanMode/AskUserQuestion. Timeout 20 s, then the normal dialog. A core allow/deny is never changed.
- **Router**: kayy-router's rules (`rules.json`), `/router [status|on|off]`, status line.
- **Pane**: `/office` opens/closes it (agents, models, cost, router counts, approvals with Erlauben/Ablehnen/Dialog); `/office status` prints a summary.

Run with `claude --plugin-dir <this folder>`. Tests: `claude plugin test <this folder>`.
