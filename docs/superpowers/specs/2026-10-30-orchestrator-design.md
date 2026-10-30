# Orchestrator (Mod v3) – Design

Datum: 2026-10-30 · Freigabe: Kaja ("Ja, Orchestrator"). Ziel laut Kaja: **nicht jede Kleinigkeit freigeben müssen, nur bei echten Entscheidungen mitentscheiden**; Subagents sollen automatisch eingesetzt werden, wenn es Sinn ergibt. Kosten: 0 LLM-Calls, 0 Timer, minimaler Prompt-Zusatz.

## Bausteine (alle im Mod `kayy-office`, Quelle: `mod/kayy-office/` im Repo)

### 1. Autopilot (Entscheidungs-Filter) – `/office autopilot [on|off|status]`
Default **aus**, Zustand dauerhaft in `$.store`. Läuft im bestehenden `tool.check`-Hook, **nur** wenn: `core.decision === 'ask'` UND `e.approver === 'person'` UND `e.tool_use_id !== undefined` UND Autopilot an. Dann `allow` (reason `"Kayy Autopilot: <warum>"`), wenn die Richtlinie die Aktion als Routine einstuft; sonst unverändert weiter (Overlay-Karte bzw. normaler Dialog). **Nie** ein core `deny` → allow, nie ExitPlanMode/AskUserQuestion/MCP/WebFetch/WebSearch.
Richtlinie (rein lokal, konservativ, testbar als reine Funktion `autopilotDecision(input, ctx) → { allow, why }`):
- **Lesen** (`Read`, `Grep`, `Glob`, `LS`, `NotebookRead`) mit `isReadOnly === true`, Pfad innerhalb von `root`/`cwd` der Session.
- **Schreiben** (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`): Pfad (normalisiert, `..`/Symlink-Tricks verworfen) innerhalb `root`/`cwd`, **nicht** in `.git/`, `.claude/`, `.vscode/`, nicht sensibel (`.env*`, `.ssh`, `id_rsa`, `credentials`, `*.pem`).
- **Bash/PowerShell**: nur wenn der gesamte Befehl keine Umleitungen (`>`, `>>`, `<`, außer `2>&1`), keine Substitution (`$(`, Backtick), kein einzelnes `&`, kein `-exec` enthält und **jedes** Segment (getrennt an `;`, `&&`, `||`, `|`, Zeilenumbruch) mit einer Allowlist beginnt: `git` (status, diff, log, show, branch, add, commit, stash list, rev-parse), `ls`, `dir`, `pwd`, `cat`, `type`, `echo`, `head`, `tail`, `wc`, `grep`, `rg`, `findstr`, `Get-ChildItem`, `Get-Content`, `Select-String`, `Test-Path`, `Set-Location`, `cd`, `npm test`, `npm run build|typecheck|test|lint`, `npx vitest`, `npx tsc`, `tsc`, `vitest`, `node --version`. **Und** `riskOf` (Blast Radius, Kopie von `src/shared/risk.ts` im Mod) liefert `none`. Alles andere ⇒ keine Auto-Freigabe.
- Zähler (`auto`, `asked`) in `$.state`, im Pane und in `/office status` sichtbar („Autopilot an · 14 automatisch · 2 gefragt“).

### 2. Orchestrierungs-Richtlinie – `/office orchestrator [on|off|status]` (Default **an**)
`prompt.compose`-Hook hängt **einen** kurzen Abschnitt (≤ 110 Wörter, englisch, `scope: 'session'`) ans Ende des System-Prompts:
- Delegieren, wenn es Kosten/Zeit spart: Suchen/Lesen → `kayy-scout` (haiku); klar spezifizierte Umsetzung → `kayy-coder` (sonnet); Design, schweres Debugging, Security-Review → `kayy-architect` (opus). Unabhängige Teilaufgaben parallel. Triviales nicht delegieren.
- Entscheidungsrichtlinie: Den Nutzer nur fragen bei Unumkehrbarem/Destruktivem, Richtungs-/Architekturentscheidungen oder Kosten; sonst selbst entscheiden, Annahme in einer Zeile nennen, weitermachen. Nie um Erlaubnis für Routine-Lesen/-Bearbeiten im Projekt bitten.
Aus ⇒ kein Abschnitt. Router (Modellwahl bei Spawns) bleibt unverändert.

### 3. Entscheidungs-Signal ans Büro
Ruft das Modell `AskUserQuestion` (oder ExitPlanMode) auf, sendet der Mod ein `Notification`-Event (`message: "Entscheidung: <Frage, max. 120 Zeichen>"`) an das Overlay, damit der Agent aufsteht und der Nutzer im Hintergrund sieht, dass seine Entscheidung gebraucht wird. Das Overlay beantwortet solche Fragen **nie** (bestehende Regel). Pane: Zeile „Entscheidung offen“.

### Nicht-Ziele
Kein Chat-zu-Chat (`$.session.send`), keine LLM-Klassifikation, kein eigener Subagent-Start durch den Mod (das Modell delegiert selbst anhand der Richtlinie), kein Ändern von Berechtigungs-Einstellungen/Settings-Dateien.

## Sicherheit
Autopilot ist Opt-in und nur für Routine im eigenen Projektordner; Pfad-Prüfung gegen Traversal; `.claude/`/`.git/` bewusst ausgenommen (Hook-/Settings-Injection); Bash-Allowlist statt Denylist; jede Unsicherheit ⇒ normaler Dialog.

## Tests
`autopilotDecision` (Matrix: erlaubt/abgelehnt je Tool, Traversal `..`, `.claude/`, sensible Dateien, Umleitungen, Substitution, gemischte Segmente, `riskOf` high), `tool.check`-Integration (core deny bleibt deny; approver≠person/ohne tool_use_id nie; Autopilot aus ⇒ unverändert), `prompt.compose` (an/aus, genau ein Abschnitt), Entscheidungs-Event, Zähler/Pane, bestehende 55 Tests grün.
