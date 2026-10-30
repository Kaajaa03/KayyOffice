# Fortschritt pro Agent (WP3) – Design

Idee (Kaja, „Savvy Progress“): am Schreibtisch sehen, wie weit ein Agent mit seiner Aufgabenliste ist. 0 Tokens: die Daten stehen schon im `TodoWrite`-Toolaufruf des Modells.

## Protokoll
`AgentEvent.progress?: { done: number; total: number; current?: string }`
- `done` = Aufgaben mit Status `completed`, `total` = alle Aufgaben (1–99), `current` = `activeForm` (sonst `content`) der Aufgabe mit Status `in_progress`, auf 80 Zeichen gekürzt, Steuerzeichen entfernt.
- Quelle (Mod): Hook auf `tool.call` für `TodoWrite`; Eingabe `{ todos: [{ content, status, activeForm? }] }`. Gesendet wird ein normales `PostToolUse`-Event des Agents mit `progress` (nur wenn sich `done/total/current` gegenüber dem zuletzt gesendeten Stand dieses Agents ändern). Ungültige/leere Listen ⇒ kein Event.
- Quelle (Hooks): `hook.js` mappt `tool_input.todos` bei `TodoWrite` genauso (Mod hat Vorrang wie bei allen Events).
- Overlay validiert (`validate.ts`): `done`,`total` ganze Zahlen 0..99, `done <= total`, `current` ≤ 80 Zeichen; sonst ignoriert. `Agent.progress` bleibt bis `Stop`/neue Liste; wird **nicht** persistiert (nicht ins JSONL), nur Dev-Log zählt „Aufgaben erledigt: n“ (Maximum `done` je Agent und Tag).
- Darstellung: Namensschild zeigt unter dem Namen einen schmalen Fortschrittsbalken (done/total) und in der zweiten Zeile `current` (statt Tool/Datei), wenn vorhanden; Pane zeigt „3/7 · Datei anlegen“. Idle-Kosten: keine Animation.

## Datenschutz
`current` ist Modelltext über die eigene Arbeit, kann aber Pfade/Namen enthalten: nie ins Log, nie in Dateien außer dem (vom Nutzer erzeugten) Dev-Log nur als Zahl.
