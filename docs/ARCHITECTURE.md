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
| Overlay | `window.ts`, `clickthrough.ts` | transparentes, klickdurchlässiges Fenster, Reset bei Hide/Reload/Crash |
| Renderer | `src/renderer/*` | Raum einmal in Offscreen-Cache, nur Figuren/Bildschirme animiert, `animationMode` bestimmt 60/10 fps oder Stillstand |
| Log | `log.ts`, `diag.ts` | JSONL pro Tag (ohne Texte), Dev-Log, `app.log` mit Rotation |
| Konfiguration | `config.ts`, `roles.ts`, `fsutil.ts` | atomare Writes, Rollen-Regeln |
| Mod | `mod/kayy-office/` | Router, Approver, Autopilot, Orchestrator, Pane, Event-Brücke |

## Zustandsmaschine eines Agents
`SessionStart → idle` · `PreToolUse → working` · `PostToolUse → working` (mit `ERROR:`-Präfix → `error`) · `Notification → waiting` · `Stop → done` (nach 15 s `idle`) · `SubagentStart → working`, `SubagentStop → done` (Platz frei nach 20 s) · `SessionEnd` entfernt Session und Subagents. Ruhende Agents werden nach 15 min entfernt, wartende nach 2 h. Zeitgesteuerte Übergänge löst **ein** Timer aus, der auf `nextDueMs` gesetzt wird; ohne fällige Aktion läuft kein Timer.

## Protokoll
- `POST /event`: JSON `AgentEvent` (`ts, sessionId, agentId, parentId?, event, tool?, cwd, message?, agentType?, source?, model?, file?, costUsd?, progress?`). Antwort 204.
- `POST /permission`: `{ sessionId, agentId, tool, summary, source? }`, bleibt bis zur Entscheidung offen, Antwort `{ decision }` mit Header `x-kayy-proof`.
- Signatur: `x-kayy-nonce` (Hex), `x-kayy-auth = HMAC-SHA256(token, "req|nonce|pfad|body")`; Beweis `HMAC-SHA256(token, "res|nonce|decision")`. Siehe [SECURITY.md](SECURITY.md).
- Validierung: `src/main/validate.ts` kürzt und prüft jedes Feld (Größen, Steuerzeichen, `progress` 1–99 Aufgaben).

## Renderer
`room.ts` (Layout/Möbel), `walk.ts` (Laufwege, reine Zustandsmaschine), `sun.ts` (Sonnenstand aus echter Uhrzeit), `pill.ts`/`pillplace.ts` (Namensschilder ohne Überlappung), `sprites.ts` (prozedurale Pixel-Sprites, gecacht), `card.ts`/`clickguard.ts` (Freigabe-Karte, Klick erst nach Verzögerung, mousedown+mouseup auf demselben Knopf). Alles Pixel-Art aus Rechtecken, keine Bild-Assets.

## Mod (Claude-seitig)
Hooks: `session.start`, `tool.call`, `tool.check`, `agent.spawn`, `turn.complete`, `session.end`, `command.run`, `prompt.compose`, `ui.render`. `tool.check` ändert nur ein core-`ask`, nie `allow`/`deny`. Autopilot-Richtlinie als reine Funktion (`autopilot.ts`), Pfade gegen Traversal, Links und Windows-Tricks geprüft, Shell nur über Positivliste.

## Tests
Reine Logik zuerst als Test (Reducer, Validierung, Auth, Layout, Laufwege, Risiko, Autopilot). Integrationstests starten echte Server und den Hook-Prozess. Mod-Tests laufen über `claude plugin test`. Leistung: `npm run perf` (Leerlauf < 1 % CPU, < 150 MB).
