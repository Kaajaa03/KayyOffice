# Kayy Office Mod + Overlay-Integration – Design

Datum: 2026-10-29 · Status: freigegeben von Kaja ("denk dir genau das aus", Empfehlung: Mod = Gehirn, Overlay = Anzeige)

## Ziel
Ein Claude-Mod `kayy-office`, der **Router + Datenquelle + Approver + Pane** in einem ist und das fertige Overlay (Electron, Windows) speist. Claude kann im Hintergrund laufen, das Pixel-Büro zeigt alles. Kein LLM-Aufruf, 0 Tokens im Betrieb, kein Timer im Idle.

## Aufteilung
| Teil | Aufgabe |
|---|---|
| Mod `kayy-office` (in Claude) | Events aus Hooks der Mod-API → Overlay (`POST /event`), Approver (`tool.check`), Router (`agent.spawn`, aus kayy-router übernommen), Pane in der App (Agent-Liste, Modelle, Kosten, offene Freigaben) |
| Overlay (Electron) | Pixel-Büro, Freigabe-Karte, Modell-Chip, Kosten, Willkommen/Demo. Nimmt Events von Mod **und** (weiter) von Hooks |

Mod und Hooks dürfen parallel laufen: Events tragen `source: "mod"`. Sobald das Overlay für eine Session Mod-Events sieht, ignoriert es Hook-Events und Hook-Permission-Anfragen derselben Session (keine Doppelkarten/-zählungen).

## Protokoll (Mod → Overlay, `http://127.0.0.1:<port>`, Header `x-kayy-token`)
Token und Port stehen in `%APPDATA%\KayyOffice\config.json` (`{ token, port }`). Fehlt die Datei oder ist die App aus: still nichts tun (Fehler schlucken, nie Claude behindern, kein Retry-Sturm: nach Fehlschlag 30 s pausieren).

### `POST /event` – JSON `AgentEvent`
`{ ts, sessionId, agentId, parentId?, event, tool?, cwd, message?, agentType?, source:"mod", model?, costUsd? }`
- `event` ∈ SessionStart | PreToolUse | PostToolUse | Notification | Stop | SubagentStart | SubagentStop | SessionEnd (wie bisher).
- `model`: Alias/ID des Agents (`haiku`, `sonnet`, `opus`, volle ID erlaubt, max 100 Zeichen).
- `costUsd`: Session-Kosten bisher (Zahl), nur auf `Stop`/`SessionStart`-Events nötig.
- Mapping: session.start→SessionStart, tool.call (vor `next`)→PreToolUse, nach `next`→PostToolUse (Fehler ⇒ `message: "ERROR: …"`), turn.complete→Stop, agent.spawn→SubagentStart (agentId = Spawn-ID, parentId = Eltern-Loop/Session, `agentType` = subagentType, `model` = gewähltes Modell), Ende eines Subagents→SubagentStop, session.end→SessionEnd.
- Fire-and-forget: nie auf die Antwort warten, die Hooks dürfen nicht verlangsamt werden (kurzer Timeout).

### `POST /permission` – JSON `{ sessionId, agentId, tool, summary, source:"mod" }`
Header zusätzlich `x-kayy-nonce: <zufälliger Hex-String>`. Antwort: `200 {"decision":"allow"|"deny"|"ask"}` und Header `x-kayy-proof = HMAC-SHA256(token, nonce)` (hex). **Der Mod muss den Proof prüfen** (eigene SHA-256/HMAC-Implementierung ohne Node/Crypto, gegen Testvektoren getestet); ohne gültigen Proof gilt die Antwort als `ask`.
Die Anfrage bleibt bis zur Entscheidung offen (max. ~20 s), danach `ask`.

## Approver (`tool.check`)
`const core = await next(e)`; nur wenn `core.decision === 'ask'` **und** das Tool nicht `ExitPlanMode`/`AskUserQuestion` ist: Overlay fragen (summary = `command`/`file_path`/gekürztes JSON, max. 300 Zeichen). `allow`/`deny` → mit `reason: "Kayy Office"` zurückgeben; `ask`, Timeout, Fehler oder App aus → `core` unverändert (normaler Dialog). Niemals aus eigener Initiative `allow` bei `core` = `deny`.
Pane-Karte als zweiter Weg (wer zuerst antwortet, gewinnt), wenn machbar.

## Router
Verhalten und Tests von `kayy-router` (Ordner `C:\Users\kaja\.claude\dev-mods\2268a6eb-a1ed-43b2-9053-31357f2d35a0\kayy-router\`) unverändert übernehmen (Regeln, `/router status|on|off`, Statuszeile); das alte Mod nicht verändern. Gewähltes Modell geht als `model` ins SubagentStart-Event.

## Pane
`$.ui.open({ id, title: "Kayy Office" })`: Liste der Agents (Status, Tool, Modell, Eltern/Kind), Session-Kosten, Router-Zähler, offene Freigaben mit Allow/Deny. Redraw nur bei Ereignissen, kein Timer. Slash-Befehl `/office` öffnet/schließt das Pane.

## Overlay-Änderungen (separat, im Repo)
- `AgentEvent`/`Agent`: `source`, `model`, `costUsd`; Mod-Vorrang vor Hooks je Session; `/permission` ignoriert Hook-Anfragen von Mod-Sessions.
- Modell-Chip (H/S/O, Farbe) am Schreibtisch, Kosten-Zeile in der Fußzeile, leerer Zustand + Demo-Knopf + Willkommensfenster (Bedienung für Einsteiger).

## Nicht-Ziele
Kein Umschalten des Haupt-Chat-Modells, keine LLM-Klassifikation, keine Netzwerkziele außer 127.0.0.1, keine Secrets in Logs/Events.

## Tests
Mod: Mapping Hook→Event, Fehler/App-aus schlucken, Proof-Prüfung (SHA-256/HMAC-Vektoren), Approver (`ask`→Overlay-Antwort, Timeout→core, `deny` bleibt `deny`, ExitPlanMode nie), Router 21 Tests. Overlay: Dedup-Logik, Modell-Parsing, neue Felder in `parseEvent`.
