# Architektur

```
Claude Code ──Hook──► hook.js ─┐                                    ┌─► Renderer (Canvas: Raum, Figuren, Karte)
                               ├─ signiertes HTTP ─► Server ─► State ┤
Claude-Mod  ──$.http.fetch────┘   127.0.0.1:<Port>   (main)  reduce ├─► Tray (Tooltip, Menü)
                                                                    └─► EventLog (JSONL, Dev-Log)
Freigaben:  Hook/Mod ──POST /permission (blockierend)──► PermissionQueue ──Klick──► Antwort (HMAC-Beweis)
```

## Prozesse und Module
| Teil | Ort | Aufgabe |
|---|---|---|
| Hook | `hook/hook.js` | Abhängigkeitsfrei, beendet immer mit 0, gibt nur eine Permission-Entscheidung auf stdout aus |
| Server | `src/main/server.ts`, `auth.ts` | nur `127.0.0.1`, Host-Prüfung, HMAC + Nonce-Cache, `/event`, `/permission` |
| Zustand | `src/main/state.ts` | reiner Reducer `reduce(state, event)`, `tick`, `nextDueMs`, `pruneStale` |
| Quellen-Vorrang | `src/main/source.ts` | Mod vor Hook je Session |
| Freigaben | `control.ts`, `approvals.ts`, `src/shared/risk.ts` | Warteschlange (20 s), Modus, Blast-Radius-Heuristik |
| Start | `main.ts`, `flags.ts` | kurzer Kompositionspunkt; alle Kommandozeilen-Flags typisiert an einer Stelle |
| Verdrahtung | `office.ts`, `ingest.ts`, `ipc.ts`, `actions.ts`, `tray.ts`, `tooltip.ts`, `devtools.ts` | `office`: Zustand, Demo, Publish-Drossel, Housekeeping; `ingest`: Server → Zustand; `ipc`: alle Fenster-Nachrichten mit Absender-Prüfung; `actions`: Hooks installieren, Hinweis, Werkzeuge; `tray`: Anzeigen/Einstellungen/Demo/Beenden; `devtools`: Perf-Messung und Screenshot |
| Overlay | `window.ts`, `clickthrough.ts` | transparentes, klickdurchlässiges Fenster, Reset bei Hide/Reload/Crash |
| Renderer | `src/renderer/*` | Raum einmal in Offscreen-Cache, nur Figuren/Bildschirme animiert, `animationMode` bestimmt 60/10 fps oder Stillstand |
| Log | `log.ts`, `diag.ts` | JSONL pro Tag (ohne Texte), Dev-Log, `app.log` mit Rotation |
| Konfiguration | `config.ts`, `roles.ts`, `fsutil.ts` | atomare Writes, Rollen-Regeln (`roles.json` wird per `fs.watch` neu geladen, kein Timer) |
| Größe | `scale.ts` | reine Funktionen: Stufen 0,67/1/1,33/1,67/2 (ganze Pixel pro 3-px-Einheit), `parseScale`, `stepScale`, `fitScale` (größte Stufe, die auf die Arbeitsfläche passt), `rescaleBounds` (Mitte und Oberkante bleiben, dann `clampToWorkAreas`) |
| Transparenz | `opacity.ts` | `parseOpacity`/`clampOpacity`, 0,5 bis 1 in 0,05-Schritten |
| Einstellungen | `settings.ts`, `src/renderer/settings.*` | `SettingsModel` (Snapshot + Whitelist-Setter mit Validierung, alle Nebenwirkungen injiziert, ohne Electron testbar); Fenster mit echten Labels/Inputs, IPC `settings:get`/`settings:set`/`settings:action` (Absender muss das Einstellungsfenster sein), Push `settings:changed` |
| Mod | `mod/kayy-office/` | Router, Approver, Autopilot, Orchestrator, Pane, Event-Brücke |

## Zustandsmaschine eines Agents
`SessionStart → idle` · `PreToolUse → working` · `PostToolUse → working` (mit `ERROR:`-Präfix → `error`) · `Notification → waiting` · `Stop → done` (nach 15 s `idle`) · `SubagentStart → working`, `SubagentStop → done` (Platz frei nach 20 s) · `SessionEnd` entfernt Session und Subagents. Ruhende Agents werden nach 15 min entfernt, wartende nach 2 h. Zeitgesteuerte Übergänge löst **ein** Timer aus, der auf `nextDueMs` gesetzt wird; ohne fällige Aktion läuft kein Timer.

## Größe, Zoom und Ziehen
Fenstergröße = Basisgröße (900 × 460, begrenzt durch die Arbeitsfläche) × Stufe; dazu `webContents.setZoomFactor(Stufe)` nach jedem `did-finish-load` und bei jeder Änderung. Der Renderer rechnet weiter in CSS-Pixeln (`innerWidth` bleibt die Basisbreite), `devicePixelRatio` steigt mit dem Zoom, der Canvas bleibt scharf. Die Trefferprüfung nutzt `clientX/Y`. Das Ziehen der Titelleiste liest den echten Mauszeiger im Main-Prozess (`screen.getCursorScreenPoint`, Nachrichten `drag:start`/`drag:move`/`drag:end`), weil `screenX`-Deltas je nach Zoom und DPI nicht verlässlich sind. Strg + Mausrad über der Titelleiste sendet `scale:step` (Absender = Overlay). Die Transparenz (`win.setOpacity`) gilt für das ganze Fenster, die Freigabe-Karte eingeschlossen.

## Protokoll
- `POST /event`: JSON `AgentEvent` (`ts, sessionId, agentId, parentId?, event, tool?, cwd, message?, agentType?, source?, model?, file?, costUsd?, progress?, context?, limit?, roster?`). Antwort 204.
- `POST /permission`: `{ sessionId, agentId, tool, summary, source? }`, bleibt bis zur Entscheidung offen, Antwort `{ decision }` mit Header `x-kayy-proof`.
- Signatur: `x-kayy-nonce` (Hex), `x-kayy-auth = HMAC-SHA256(token, "req|nonce|pfad|body")`; Beweis `HMAC-SHA256(token, "res|nonce|decision")`. Siehe [SECURITY.md](SECURITY.md).
- Nutzung: `context { percent, tokens?, window? }` (Kontextfenster der Session) und `limit { kind, percent }` (Konto-Limit, z. B. `five_hour`) hängen sticky am Agent und erscheinen in der Fußzeile (ab 70 % bernstein, ab 85 % rot).
- Roster: Das Event `Roster` meldet die verfügbaren Agent-Typen (`roster: [{ type, model? }]`, max. 12). Es erzeugt oder ändert nie einen Agent; der Reducer legt die Liste in `AppState.roster` ab (bleibt nach `SessionEnd`, nicht im JSONL-Log, nicht im Dev-Log). Der Renderer setzt jeden Typ, der gerade nicht arbeitet, als wartende Figur auf Sofa/Sitzsäcke der Lounge (`bench.ts`, 6 Plätze, Rest als „+n“); ein Typ gilt als „im Einsatz“, wenn ein Agent mit `name === type` arbeitet, wartet oder einen Fehler hat. Die Bank kostet keine Schreibtischplätze und hält die Render-Schleife nicht an.
- Validierung: `src/main/validate.ts` kürzt und prüft jedes Feld (Größen, Steuerzeichen, `progress` 1–99 Aufgaben).

## Renderer
`room.ts` (Layout/Möbel, Bank-Plätze), `bench.ts` (Wartebereich), `footer.ts` (Fußzeile mit Warnstufen), `walk.ts` (Laufwege, reine Zustandsmaschine), `sun.ts` (Sonnenstand aus echter Uhrzeit), `pill.ts`/`pillplace.ts` (Namensschilder ohne Überlappung), `sprites.ts` (prozedurale Pixel-Sprites, gecacht), `card.ts`/`clickguard.ts` (Freigabe-Karte, Klick erst nach Verzögerung, mousedown+mouseup auf demselben Knopf). Alles Pixel-Art aus Rechtecken, keine Bild-Assets.

## Mod (Claude-seitig)
Hooks: `session.start`, `tool.call`, `tool.check`, `agent.spawn`, `turn.complete`, `session.end`, `command.run`, `prompt.compose`, `ui.render`. `tool.check` ändert nur ein core-`ask`, nie `allow`/`deny`. Autopilot-Richtlinie als reine Funktion (`autopilot.ts`), Pfade gegen Traversal, Links und Windows-Tricks geprüft, Shell nur über Positivliste.

## Tests
Reine Logik zuerst als Test (Reducer, Validierung, Auth, Layout, Laufwege, Risiko, Autopilot). Integrationstests starten echte Server und den Hook-Prozess. Mod-Tests laufen über `claude plugin test`. Leistung: `npm run perf` (Leerlauf < 1 % CPU, < 150 MB).
