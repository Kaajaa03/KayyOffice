# Polish-Release (v1.0) – Plan und Abnahmekriterien

Datum: 2026-10-30 · Auftrag Kaja: „Bau alles was zu diesem Thema relevant ist. Mach es ein feingeschliffenes Ding, kein Vibecode-Müll.“

## Leitidee
Aus „funktioniert“ wird „fertig“: bekannte Schwächen aus den Reviews beheben, Look und Sprache konsistent machen, Betrieb diagnostizierbar machen, Doku/CI nachziehen – und den größten fehlenden Nutzen bauen (Fortschritt pro Agent). Kein neues Feature ohne Tests, kein Feature, das im Idle Ressourcen kostet.

## Arbeitspakete
| WP | Inhalt | Wer |
|---|---|---|
| **1 Härtung** | PostToolUseFailure (Fehlerzustand zuverlässig), Click-through-Reset, Housekeeping ohne Dauer-Timer, fertige Subagents räumen den Platz, atomare Settings-/Config-Writes + Backup-Rotation + BOM-Toleranz, Log-Rotation, Host-Header-Check (DNS-Rebinding), kürzere Permission-Timeouts, Diagnose-Log + Tray-„Diagnose“, CI-Workflow, `npm run check` | Subagent (Worktree) |
| **2 UX-Politur** | Zweisprachig (de/en, Standard nach System), echtes App-Icon (prozedural, Tray/Fenster/Installer), Layout-Prüfung 1–24 Agents, Welcome mit Statusanzeige, Tray-Tooltip live, reduzierte Bewegung (prefers-reduced-motion), Karte mit Agent-Typ/Session-Kürzel | Subagent (Worktree) |
| **3 Fortschritt** | `TodoWrite` im Mod → `progress` im Protokoll → Fortschrittsbalken + aktuelle Aufgabe am Namensschild, Fortschritt im Pane und Dev-Log | Hauptsession nach Merge von 1+2 |
| **4 Abschluss** | `noUnusedLocals/Parameters`, README/ARCHITECTURE/SECURITY/CHANGELOG, adversariales Review, Installer neu, Messung | Hauptsession |

## Bewusst nicht gebaut
- **Chat-zu-Chat (`$.session.send`)**: Endlos-Ping-Pong-Risiko, schwer testbar, geringer Nutzen gegenüber Subagents; erst bei konkretem Anwendungsfall.
- **Auto-Update, Telemetrie, eigener LLM-Aufruf**: widersprechen Zielen (lokal, 0 Tokens).
- **Deinstaller-Hook-Entfernung**: der gestagte Hook beendet sich still, wenn die App fehlt; Risiko > Nutzen ohne Testmöglichkeit.

## Definition of Done (gilt pro Paket und am Ende)
1. `npm test`, `npx tsc --noEmit` grün; Mod: `claude plugin test` + `validate` grün.
2. Neue Logik zuerst als Test (RED gesehen), reine Funktionen wo möglich.
3. Perf-Budget: `npm run perf` PASS (Idle < 1 % CPU, < 150 MB), aktiv < 3 %.
4. Sicherheit: Token nie auf dem Draht, kein deny→allow, nichts Geheimes in Logs; sicherheitsrelevante Änderungen werden adversarial geprüft.
5. Jede sichtbare Änderung per Screenshot geprüft (`--demo --screenshot`).
6. Keine toten Exporte/Parameter, keine auskommentierten Blöcke, keine TODO-Reste.
7. Doku stimmt mit dem Verhalten überein.
