# Kayy Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lokales Windows-Overlay mit Pixel-Büro, das den Live-Status aller Claude-Code-Agents zeigt, Permissions steuerbar macht und Rollen/Projekte/Logs abbildet – ohne Tokenverbrauch und mit minimalem Ressourcenbedarf.

**Architecture:** Claude-Code-Hooks rufen ein winziges Node-Script (`hook.js`), das Events per HTTP an einen lokalen Server in der Electron-App schickt. Ein reiner Reducer (`reduce`) hält den Zustand, ein Canvas-Renderer zeichnet das Büro nur bei Events/Animation. Steuerung (Stufe B) und Rollen/Log (Stufe C) setzen auf dieselbe Event-Pipeline auf.

**Tech Stack:** Electron, TypeScript, esbuild (Bundling), Vitest, Node `http`, Canvas 2D, electron-builder.

**Spec:** `docs/superpowers/specs/2026-10-29-kayy-office-design.md`

## Global Constraints

- Lokales Desktop-Programm, keine Webseite, kein Hosting; Server nur auf `127.0.0.1`, Token-Header Pflicht.
- Kein LLM-Aufruf, kein Polling der Agents, keine Telemetrie.
- Idle < 1 % CPU, < 150 MB RAM (Ziel < 100 MB); Animation 60 fps bei Aktivität, ≤ 10 fps bzw. pausiert bei Idle/versteckt.
- Hook-Script: keine Abhängigkeiten (nur `http`), < 50 ms, Timeout 150 ms, Fehler still; App aus ⇒ Claude Code unbeeinträchtigt.
- Port 47821 mit Fallback auf den nächsten freien Port.
- Hook-Installer ändert nur eigene Einträge, legt Backup an, ist rückgängig machbar.
- Events: `{ ts, sessionId, agentId, parentId?, event, tool?, cwd, message? }`; Hook-Events: SessionStart, PreToolUse, PostToolUse, Notification, Stop, SubagentStart, SubagentStop, SessionEnd.
- Agent-Zustände: `idle | working | waiting | done | error`; Tool-Kategorien `code | terminal | browser | other`.
- Kein Secret im Repo; Token liegt in `%APPDATA%/KayyOffice/config.json`.

## Review Focus

1. Malformed/zu großes Hook-JSON (leer, kein JSON, > 64 KB): wird verworfen, App bleibt stabil, Hook beendet mit Exit 0. → Task 3, 5
2. Späte/unerwartete Events (PostToolUse nach Stop, Event für unbekannte Session, SubagentStop ohne Start): kein Absturz, kein Geister-Agent. → Task 2
3. `settings.json` fehlt, ist ungültiges JSON oder enthält schon fremde Hooks: nichts geht verloren, Backup existiert. → Task 6
4. Pfade mit Leerzeichen (`C:\Users\...`) im Hook-Kommando; mehrere Sessions im selben `cwd`. → Task 6, 2
5. App startet mitten in laufender Session / wird beendet, während ein Permission-Hook wartet: Agent erscheint beim nächsten Event; wartender Hook fällt auf normalen Prompt zurück (Timeout). → Task 2, 11

---

## Datei-Struktur

```
package.json, tsconfig.json, esbuild.config.mjs, vitest.config.ts
hook/hook.js                      Hook-Script (Plain JS, keine Deps)
src/shared/types.ts               Event, Agent, AppState, Config
src/main/state.ts                 reduce(), initialState()
src/main/validate.ts              parseEvent()
src/main/config.ts                loadConfig(), Token/Port
src/main/server.ts                startServer()
src/main/installer.ts             installHooks(), uninstallHooks()
src/main/window.ts                Overlay, Tray, Hotkey
src/main/main.ts, preload.ts      Wiring
src/main/control.ts               Permission-Queue (B)
src/main/power.ts                 Wachbleiben (B)
src/main/roles.ts                 roles.json (C)
src/main/log.ts                   Recap, Dev-Log (C)
src/renderer/index.html, renderer.ts
src/renderer/scene.ts             layoutDesks() (rein)
src/renderer/sprites.ts           prozedurale Pixel-Sprites
src/renderer/loop.ts              FrameGate (rAF-Gating)
tools/mock-events.ts, tools/perf-check.ts
tests/*.test.ts
```

---

### Task 1: Projekt-Scaffold und Typen

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `.gitignore`, `src/shared/types.ts`, `tests/types.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):
  - `type EventName = 'SessionStart'|'PreToolUse'|'PostToolUse'|'Notification'|'Stop'|'SubagentStart'|'SubagentStop'|'SessionEnd'`
  - `interface AgentEvent { ts: number; sessionId: string; agentId: string; parentId?: string; event: EventName; tool?: string; cwd: string; message?: string }`
  - `type AgentStatus = 'idle'|'working'|'waiting'|'done'|'error'`
  - `type ToolCategory = 'code'|'terminal'|'browser'|'other'`
  - `interface Agent { id: string; sessionId: string; parentId?: string; cwd: string; status: AgentStatus; category?: ToolCategory; lastEventTs: number; message?: string }`
  - `interface AppState { agents: Record<string, Agent> }`
  - `function toolCategory(tool?: string): ToolCategory` – Edit/Write/NotebookEdit→code, Bash/PowerShell→terminal, WebFetch/WebSearch/mcp__*browser*/mcp__*chrome*→browser, sonst other.

- [ ] **Step 1: Failing test** `tests/types.test.ts`: `toolCategory('Edit')==='code'`, `toolCategory('Bash')==='terminal'`, `toolCategory('WebFetch')==='browser'`, `toolCategory('Read')==='other'`, `toolCategory(undefined)==='other'`.
- [ ] **Step 2:** `npm install -D typescript vitest esbuild electron @types/node`, Skripte: `build` (esbuild main/preload/renderer nach `dist/`), `start` (build + `electron dist/main.js`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`). Run `npm test` → FAIL (toolCategory fehlt).
- [ ] **Step 3:** Typen und `toolCategory` in `src/shared/types.ts` implementieren.
- [ ] **Step 4:** `npm test` → PASS, `npm run typecheck` → ohne Fehler.
- [ ] **Step 5:** Commit `chore: scaffold project and shared types` (`node_modules`, `dist` in `.gitignore`).

---

### Task 2: Zustands-Reducer

**Files:**
- Create: `src/main/state.ts`
- Test: `tests/state.test.ts`

**Interfaces:**
- Consumes: `AgentEvent`, `AppState`, `Agent`, `toolCategory` (Task 1)
- Produces:
  - `initialState(): AppState`
  - `reduce(state: AppState, e: AgentEvent): AppState` (rein, ohne Mutation)
  - `pruneStale(state: AppState, now: number, maxAgeMs: number): AppState`
  - `DONE_TO_IDLE_MS = 15000` (Konstante, genutzt vom Renderer/Main für Übergang done→idle via `tick(state, now)`)
  - `tick(state: AppState, now: number): AppState` – setzt `done` älter als `DONE_TO_IDLE_MS` auf `idle`.

Übergänge: SessionStart→idle; PreToolUse→working (+category); PostToolUse→working; Notification→waiting (message gesetzt); Stop→done; SubagentStart→neuer Agent mit `parentId`, working; SubagentStop→Agent done; SessionEnd→Agent und seine Kinder entfernt. Unbekannte Session bei Nicht-Start-Event legt den Agent an (App startet mitten in Session).

- [ ] **Step 1: Failing tests** `tests/state.test.ts` (je ein Test): `PreToolUse Bash → status working, category terminal`; `Notification → waiting`; `Stop → done`; `tick nach 15000 ms → idle`; `SubagentStart legt Kind mit parentId an, SessionEnd entfernt Eltern und Kinder`; **Review Focus 2:** `PostToolUse für unbekannte Session legt genau einen Agent an und wirft nicht; pruneStale entfernt ihn nach maxAgeMs` (Geister-Agent verschwindet von selbst), `SubagentStop ohne Start wirft nicht und ändert state nicht`; **Review Focus 4:** `zwei Sessions mit gleichem cwd ergeben zwei Agents`; `reduce mutiert Eingabe-State nicht` (Deep-Freeze).
- [ ] **Step 2:** `npx vitest run tests/state.test.ts` → FAIL.
- [ ] **Step 3:** Reducer, `tick`, `pruneStale` in `src/main/state.ts` implementieren (Agent-ID = `event.agentId`).
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `feat: pure agent state reducer`.

---

### Task 3: Event-Validierung

**Files:**
- Create: `src/main/validate.ts`
- Test: `tests/validate.test.ts`

**Interfaces:**
- Consumes: `AgentEvent`, `EventName`
- Produces: `parseEvent(raw: unknown): AgentEvent | null` – prüft Pflichtfelder und Typen, kürzt `message` auf 500 Zeichen, `tool` auf 100, `cwd` auf 500; `MAX_BODY_BYTES = 65536` (exportiert).

- [ ] **Step 1: Failing tests:** gültiges Event wird unverändert zurückgegeben; fehlendes `sessionId`→`null`; unbekanntes `event`→`null`; `message` mit 10 000 Zeichen wird auf 500 gekürzt; Nicht-Objekt (`null`, `"x"`, `42`)→`null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** `parseEvent` implementieren. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: validate and sanitize hook events`.

---

### Task 4: Config und lokaler Server

**Files:**
- Create: `src/main/config.ts`, `src/main/server.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `parseEvent`, `MAX_BODY_BYTES` (Task 3)
- Produces:
  - `loadConfig(dir: string): { token: string; port: number }` – legt `config.json` mit Zufalls-Token (32 Byte hex) und `port: 47821` an, falls nicht vorhanden.
  - `startServer(opts: { token: string; port: number; onEvent: (e: AgentEvent) => void }): Promise<{ port: number; close(): Promise<void> }>` – bindet `127.0.0.1`, probiert bei `EADDRINUSE` bis zu 20 Folgeports, schreibt den tatsächlichen Port zurück in die Config (Aufrufer-Verantwortung: `saveConfigPort`). `POST /event`: Header `x-kayy-token` Pflicht (sonst 401), Body-Limit `MAX_BODY_BYTES` (sonst 413), ungültiges Event 400, gültig 204.
  - `saveConfigPort(dir: string, port: number): void`

- [ ] **Step 1: Failing tests:** falscher Token→401; gültiges Event→204 und `onEvent` genau einmal; Body 70 KB→413 und `onEvent` nicht aufgerufen; Kaputtes JSON→400; zweiter Server auf belegtem Port bekommt `port+1`; Server ist nur über `127.0.0.1` gebunden (`server.address().address === '127.0.0.1'`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementieren (Node `http`, kein Framework). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: local event server with token auth`.

---

### Task 5: Hook-Script

**Files:**
- Create: `hook/hook.js`
- Test: `tests/hook.test.ts`

**Interfaces:**
- Consumes: Server-Protokoll (Task 4)
- Produces: `hook/hook.js` – liest Claude-Code-Hook-JSON von stdin, mappt `hook_event_name→event`, `session_id→sessionId`, `tool_name→tool`, `cwd`, `message`; `agentId = session_id` (bzw. `agent_id`/`subagent`-Feld, falls vom Hook geliefert, mit `parentId = session_id`); liest Token/Port aus `%APPDATA%/KayyOffice/config.json`; POST mit 150 ms Timeout; **Exit-Code immer 0**, keine Ausgabe auf stdout (außer im Blocking-Modus, Task 11).

- [ ] **Step 1: Failing tests** (starten echten Test-Server via `startServer`, `hook.js` als Kindprozess mit gesetzter Config-Dir-Env `KAYY_CONFIG_DIR`): gültiger PreToolUse-Input erreicht `onEvent` mit `tool: 'Bash'`; **Review Focus 1:** leerer stdin, kein-JSON-stdin und 100-KB-stdin enden mit Exit 0 und ohne `onEvent`; App nicht erreichbar (Port frei) ⇒ Exit 0 in < 500 ms.
- [ ] **Step 2:** Run → FAIL. **Step 3:** `hook.js` implementieren (nur `http`, `fs`, `path`). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: dependency-free hook script`.

---

### Task 6: Hook-Installer

**Files:**
- Create: `src/main/installer.ts`
- Test: `tests/installer.test.ts`

**Interfaces:**
- Produces:
  - `installHooks(settingsPath: string, hookScriptPath: string): { backupPath: string | null }`
  - `uninstallHooks(settingsPath: string): void`
  - Eigene Einträge tragen die Markierung `"kayy-office"` im Kommando (`node "<hookScriptPath>" # kayy-office`); Pfad immer in Anführungszeichen.

- [ ] **Step 1: Failing tests** (Temp-Dir): fehlende Datei→wird angelegt, enthält alle 8 Events; **Review Focus 3:** bestehende fremde Hooks bleiben nach install erhalten; ungültiges JSON→wirft verständlichen Fehler, Original unverändert, kein Überschreiben; Backup-Datei wird bei bestehender Datei angelegt; doppeltes `installHooks` erzeugt keine Duplikate; `uninstallHooks` entfernt nur Einträge mit Markierung; **Review Focus 4:** Pfad `C:\Users\Max Mustermann\x\hook.js` steht in Anführungszeichen im Kommando.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementieren. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: non-destructive hook installer`.

---

### Task 7: Overlay-Fenster, Tray, Hotkey, Main-Wiring

**Files:**
- Create: `src/main/window.ts`, `src/main/main.ts`, `src/main/preload.ts`, `src/renderer/index.html`
- Modify: `esbuild.config.mjs`

**Interfaces:**
- Consumes: `startServer`, `loadConfig`, `reduce`, `tick`, `pruneStale`
- Produces:
  - `createOverlay(): BrowserWindow` – transparent, frameless, always-on-top (`'screen-saver'`-Level), `skipTaskbar`, nicht fokussierbar, oben mittig auf dem Primärdisplay (Breite min(900, 60 % Workarea)), klickdurchlässig (`setIgnoreMouseEvents(true, { forward: true })`), `backgroundThrottling: true`.
  - `toggleOverlay(win): void` – Hotkey `Ctrl+Alt+O` und Tray-Klick; versteckt ⇒ `win.hide()` und IPC `visibility:false` an Renderer.
  - IPC (preload, `contextBridge`): `onState(cb: (s: AppState) => void)`, `onVisibility(cb: (v: boolean) => void)`. Main sendet State **nur bei Änderung** (gedrosselt auf max. 20/s).
  - Tray-Menü: „Anzeigen/Verstecken“, „Hooks installieren“, „Hooks entfernen“, „Beenden“. Einzelinstanz-Lock.

- [ ] **Step 1:** Implementieren; State-Update-Drossel als kleine reine Funktion `throttle(fn, ms)` in `main.ts`.
- [ ] **Step 2:** Verifikation manuell: `npm run start` – Tray-Icon erscheint, Hotkey blendet Fenster ein/aus, `curl -X POST http://127.0.0.1:47821/event -H "x-kayy-token: <aus config>" -d '{...}'` sendet ein Event, Renderer erhält State (Konsole). Erwartet: kein Fehler, Fenster klickdurchlässig.
- [ ] **Step 3:** Commit `feat: overlay window, tray, hotkey and main wiring`.

---

### Task 8: Renderer – Pixel-Büro

**Files:**
- Create: `src/renderer/scene.ts`, `src/renderer/sprites.ts`, `src/renderer/loop.ts`, `src/renderer/renderer.ts`
- Test: `tests/scene.test.ts`, `tests/loop.test.ts`

**Interfaces:**
- Consumes: `AppState`, `Agent`
- Produces:
  - `layoutDesks(agents: Agent[], width: number): Desk[]` mit `interface Desk { agentId: string; x: number; y: number; row: number }` – stabile Reihenfolge nach `lastEventTs` der ersten Sichtung (Agent behält Platz), Subagents direkt neben Eltern, Zeilenumbruch bei Breite.
  - `class FrameGate { constructor(opts: { activeFps: 60; idleFps: 10 }); shouldDraw(now: number, hasAnimation: boolean, visible: boolean): boolean }` – `visible=false` ⇒ nie zeichnen; ohne Animation ⇒ höchstens `idleFps`; sonst `activeFps`.
  - `sprites.ts`: `drawAgent(ctx, agent, desk, t)`, `drawDesk(ctx, desk, category, t)`, `drawBackground(ctx, w, h, hour)` – alles prozedural (Rechtecke, 1 Logical-Pixel = 3 Screen-Pixel, `imageSmoothingEnabled=false`). Darstellung: working = tippende Arme + Bildschirm mit Kategorie-Symbol (Code/Terminal/Browser); waiting = Figur steht, Ausrufezeichen, Glow in Agentenfarbe; done = Kaffeetasse; error = rotes Blinken; idle = sitzt ruhig. Farbe pro Agent aus Hash der `id` (Palette mit 8 kontrastreichen Farben, lesbar auf Hell/Dunkel). Hintergrund-Stimmung nach Tageszeit (Tag/Dämmerung/Nacht).
  - Der Renderer ruft `requestAnimationFrame` nur auf, wenn `FrameGate.shouldDraw` oder eine Animation läuft; sonst stoppt die Schleife, bis der nächste State-Update oder `visibility:true` sie weckt.

- [ ] **Step 1: Failing tests:** `layoutDesks` – 3 Agents ergeben 3 verschiedene Positionen innerhalb `width`; Agent behält Position, wenn ein anderer entfernt wird; Subagent steht neben Eltern; `FrameGate` – `visible=false`→nie; ohne Animation nur alle ≥ 100 ms; mit Animation alle ≥ 16 ms.
- [ ] **Step 2:** Run → FAIL. **Step 3:** `scene.ts`, `loop.ts` implementieren; `sprites.ts` und `renderer.ts` bauen. **Step 4:** Tests → PASS.
- [ ] **Step 5:** Manuell: Mock-Events (Task 9) zeigen alle Zustände sauber; Screenshot-Check auf 100 % und 150 % Windows-Skalierung. Commit `feat: pixel office renderer with frame gating`.

---

### Task 9: Mock-Event-Generator

**Files:**
- Create: `tools/mock-events.ts`
- Modify: `package.json` (Script `mock`)

**Interfaces:**
- Consumes: Server-Protokoll; Config aus `%APPDATA%/KayyOffice/config.json`
- Produces: `npm run mock -- <szenario>` mit Szenarien `single`, `team` (5 Agents + Subagents, verschiedene Tools), `permission` (Notification → wartend), `error`, `cleanup` (SessionEnd aller Agents).

- [ ] **Step 1:** Implementieren (Schleife mit zufälligen Intervallen 0,5–3 s, endet nach 60 s oder Ctrl+C).
- [ ] **Step 2:** Verifikation: App läuft, `npm run mock -- team` – alle fünf Agents erscheinen, wechseln Zustände, `cleanup` leert das Büro.
- [ ] **Step 3:** Commit `feat: mock event generator`.

---

### Task 10: Performance-Abnahme

**Files:**
- Create: `tools/perf-check.ts`
- Modify: `package.json` (Script `perf`)

**Interfaces:**
- Produces: `npm run perf` – startet die App, wartet 30 s Idle, misst per `app.getAppMetrics()` (über IPC/Debug-Flag `--perf`) CPU % und Gesamt-RAM, gibt PASS/FAIL gegen Idle < 1 % CPU und < 150 MB RAM aus; zweiter Lauf mit Szenario `team` misst Aktiv-Last (Ausgabe nur informativ).

- [ ] **Step 1:** Implementieren. **Step 2:** `npm run perf` → Idle PASS. Bei FAIL: Ursache fixen (Throttling, Canvas-Größe, Timer), nicht Grenzwert anheben.
- [ ] **Step 3:** Commit `test: idle performance check`.

---

### Task 11: Steuerung – Permissions (Stufe B)

**Files:**
- Create: `src/main/control.ts`
- Modify: `src/main/server.ts`, `hook/hook.js`, `src/main/main.ts`, `src/renderer/renderer.ts`
- Test: `tests/control.test.ts`

**Interfaces:**
- Consumes: Server (Task 4), Hook (Task 5)
- Produces:
  - `class PermissionQueue { add(req: { id: string; agentId: string; tool: string; summary: string }): Promise<'allow'|'deny'|'ask'>; resolve(id: string, d: 'allow'|'deny'): void; pending(): PermissionRequestInfo[] }` – nicht beantwortete Anfragen laufen nach `PERMISSION_TIMEOUT_MS = 20000` auf `'ask'` (= normaler Claude-Code-Prompt).
  - Server: `POST /permission` hält die Verbindung offen, bis `PermissionQueue` entscheidet, und antwortet `{ decision }`.
  - `hook.js` im Blocking-Modus (Hook-Event `PermissionRequest`): sendet `/permission`, wartet max. 22 s, schreibt bei `allow`/`deny` das Hook-Ergebnis-JSON auf stdout, bei `ask`/Fehler nichts (⇒ normaler Prompt).
  - Overlay: wartender Agent steht auf, Glow; Klick auf Figur öffnet Mini-Panel mit **Erlauben / Ablehnen** (Tool + Kurzfassung); nur dieser Bereich ist klickbar (Mouse-Forwarding per `setIgnoreMouseEvents` umschalten).

- [ ] **Step 1: Verifizieren:** Schema des `PermissionRequest`-Hooks in der aktuellen Claude-Code-Dokumentation prüfen (Eingabefelder, Ausgabeformat `decision.behavior`); **Abweichung zur Spec** (dort PreToolUse) in der Spec vermerken und committen.
- [ ] **Step 2: Failing tests:** `add` + `resolve('allow')` ergibt `'allow'`; ohne Antwort nach Timeout (Fake-Timer) ergibt `'ask'`; **Review Focus 5:** App-Shutdown (`queue.dispose()`) löst alle wartenden mit `'ask'` auf; Server hält `/permission` offen und liefert Entscheidung.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implementieren. **Step 5:** Tests → PASS.
- [ ] **Step 6:** Manuell mit echtem Claude Code: Aktion, die Permission braucht, erscheint im Overlay, Klick auf Erlauben führt sie aus; App beenden während Wartezeit ⇒ normaler Prompt erscheint.
- [ ] **Step 7:** Commit `feat: permission approval from overlay`.

---

### Task 12: Wachbleiben

**Files:**
- Create: `src/main/power.ts`
- Test: `tests/power.test.ts`

**Interfaces:**
- Produces: `class AwakeManager { constructor(blocker: { start(type: 'prevent-display-sleep'|'prevent-app-suspension'): number; stop(id: number): void }); update(state: AppState): void }` – startet `prevent-app-suspension`, solange mindestens ein Agent `working`/`waiting` ist, stoppt sobald keiner mehr (mit 60 s Nachlauf); in Tray ein-/ausschaltbar (Default an).

- [ ] **Step 1: Failing tests** (Fake-Blocker): working→start einmal; zweites working→kein zweites start; alle idle + 60 s→stop; deaktiviert→nie start.
- [ ] **Step 2–4:** FAIL → implementieren → PASS (`powerSaveBlocker` aus Electron in `main.ts` injizieren).
- [ ] **Step 5:** Commit `feat: keep system awake while agents work`.

---

### Task 13: Rollen und Projektgruppen (Stufe C)

**Files:**
- Create: `src/main/roles.ts`
- Modify: `src/main/state.ts` (Agent bekommt optional `role?: string`), `src/renderer/scene.ts`, `src/renderer/sprites.ts`
- Test: `tests/roles.test.ts`

**Interfaces:**
- Produces:
  - `interface RoleDef { match: { cwdContains?: string; namePattern?: string }; role: string; color: string; sprite?: string }`
  - `loadRoles(path: string): RoleDef[]` – fehlende Datei ⇒ `[]`; ungültige Einträge werden übersprungen und geloggt.
  - `assignRole(agent: Agent, roles: RoleDef[]): { role?: string; color?: string; sprite?: string }` – erster Treffer gewinnt.
  - `groupByProject(agents: Agent[]): Record<string, Agent[]>` – Schlüssel = letzter Pfad-Ordner von `cwd`.
  - Renderer zeichnet pro Projekt einen eigenen Raum mit Schild (Projektname), Rollen-Label am Schreibtisch.

- [ ] **Step 1: Failing tests:** erster Treffer gewinnt; kein Treffer ⇒ leeres Objekt; kaputte Datei/Eintrag ⇒ übersprungen, kein throw; `groupByProject` fasst zwei Agents desselben `cwd` zusammen; Windows-Pfad `C:\a\b\Proj` ⇒ `Proj`.
- [ ] **Step 2–4:** FAIL → implementieren → PASS. **Step 5:** Commit `feat: roles and project rooms`.

---

### Task 14: Recap und Dev-Log

**Files:**
- Create: `src/main/log.ts`
- Modify: `src/main/main.ts` (Logger an Event-Pipeline), Tray-Menü („Recap öffnen“)
- Test: `tests/log.test.ts`

**Interfaces:**
- Produces:
  - `class EventLog { append(e: AgentEvent): void; day(date: string): DaySummary }` mit `interface DaySummary { date: string; perAgent: Record<string, { toolCalls: number; activeMs: number; projects: string[] }> }`; Persistenz als JSONL pro Tag in `%APPDATA%/KayyOffice/logs/YYYY-MM-DD.jsonl` (Append, kein Lesen im Hot-Path).
  - `renderDevLog(summary: DaySummary): string` – Markdown mit Überschrift pro Projekt und Zeile pro Agent; Zielordner konfigurierbar (`config.devLogDir`), Datei `YYYY-MM-DD.md`.
  - `weekSummary(endDate: string, log: EventLog): DaySummary[]` (7 Tage).

- [ ] **Step 1: Failing tests:** 3 Tool-Events ⇒ `toolCalls: 3`; `activeMs` summiert Zeit zwischen PreToolUse und PostToolUse; `renderDevLog` enthält Projektname und Agent-ID; `weekSummary` liefert 7 Einträge, fehlende Tage leer.
- [ ] **Step 2–4:** FAIL → implementieren → PASS. **Step 5:** Commit `feat: daily recap and dev log`.

---

### Task 15: Paketierung, README, GitHub

**Files:**
- Create: `README.md`, `electron-builder.yml`
- Modify: `package.json` (Script `dist`)

- [ ] **Step 1:** `npm i -D electron-builder`; Windows-Target `nsis` (Installer) plus `portable`; Hook-Script wird als `extraResources` mitgegeben; Installer-Pfad des Hooks korrekt in `installHooks` (Dev vs. gepackt unterscheiden).
- [ ] **Step 2:** README: Zweck, Installation, Hotkey, Hooks installieren/entfernen, Performance-Zahlen, Roadmap (Tauri, weitere Tools).
- [ ] **Step 3:** `npm run dist` ⇒ Installer entsteht; Installation auf diesem PC, Start, Mock-Test, Deinstallation entfernt Autostart/Hooks nur auf Wunsch.
- [ ] **Step 4:** Nach `gh auth login`: `gh repo create KayyOffice --private --source . --push`.
- [ ] **Step 5:** Commit `docs: readme and packaging`.
