# Kayy Office

Pixel-Büro-Overlay für **Claude-Code-Agents** unter Windows (inspiriert von Lumio für Mac). Jeder Agent bekommt einen Schreibtisch: er tippt, wenn er arbeitet, steht auf, wenn er dich braucht, und holt sich Kaffee, wenn er fertig ist. Permissions kannst du direkt im Overlay freigeben.

**Lokal, ohne Tokens:** Claude-Code-Hooks rufen ein winziges Node-Script, das Events an `127.0.0.1` schickt. Kein LLM-Aufruf, kein Polling, keine Telemetrie, kein Hosting.

```
Claude Code Hook ─► hook.js ─HTTP─► 127.0.0.1:47821 ─► Electron (Main) ─IPC─► Canvas-Büro
```

## Zwei Wege, Agents anzuschließen
| Weg | Was du bekommst |
|---|---|
| **Claude-Mod `kayy-office`** (empfohlen) | Status, **Modell pro Agent**, **Kosten**, aktuelle Datei, Router (Subagent → passendes Modell), Freigaben, Pane direkt in der Claude-App |
| **Hooks** (Tray → „Hooks installieren“) | Status, aktuelle Datei, Freigaben. Läuft auch mit der CLI ohne Mod |

Beides gleichzeitig ist erlaubt: sobald der Mod für eine Session meldet, ignoriert das Overlay die Hook-Events derselben Session (keine Doppelzählung).

## Erster Start
Beim ersten Start öffnet sich ein **Willkommensfenster** (später: Tray → „Willkommen / Hilfe“) mit drei Schritten: Verbinden, **Demo ansehen** (15 s), Bedienung. Das Büro selbst erscheint erst, wenn Agents arbeiten; nach dem Start zeigt eine kleine Pille oben kurz „läuft · wartet auf Agents“.

## Am Schreibtisch
Farbiger Chip = Modell (**H**aiku, **S**onnet, **O**pus, **F**able), darunter Name und Status; bei Edit/Write steht der **Dateiname** da. Fußzeile: Anzahl, aktiv, wartend, Session-Kosten.

## Blast Radius (Freigabe-Karte)
Bei gefährlichen Befehlen (`rm -rf`, `Remove-Item -Recurse`, `git reset --hard`, `git push --force`, `git clean -f`, `curl … | bash`, `DROP TABLE`, `format X:`) zeigt die Karte eine rote Warnzeile mit Ziel und der Allow-Knopf wird erst nach 1,5 s klickbar. Rein lokal, kein LLM.

## Ressourcen (gemessen mit `npm run perf`)
| | CPU | RAM (private, alle Prozesse) |
|---|---|---|
| Idle | ~0,04 % | ~80 MB |
| 5 Agents aktiv (60 fps) | ~0,9 % | ~96 MB |

Gespart wird durch: Event-getriebenes Rendering (ohne aktive Agents läuft keine Animations-Schleife), Software-Rendering + In-Process-GPU (halbiert den RAM), kein Timer im Leerlauf. `KAYY_GFX=hw` schaltet auf GPU-Rendering um.

## Benutzung
```bash
npm install
npm start            # Build + App starten (Tray-Icon unten rechts)
```
Tray-Menü: **Hooks installieren** (trägt Hooks nicht-destruktiv in `~/.claude/settings.json` ein, mit Backup), **Hooks entfernen**, Dev-Log/Wochen-Recap, Rollen, Wach-bleiben, Autostart (nur installierte Version).
Hotkey **Ctrl+Alt+O** blendet das Overlay ein/aus. Neue Claude-Code-Sessions nutzen die Hooks automatisch. Voraussetzung: `node` im PATH.

## Rollen und Projekte
`%APPDATA%\KayyOffice\roles.json` (wird beim ersten Start mit Beispielen angelegt, Tray → „Rollen neu laden“):
```json
[{ "match": { "namePattern": "review" }, "role": "Reviewer", "color": "#ffa94d" }]
```
`namePattern` (Regex) trifft auf Agent-ID und Subagent-Typ, `cwdContains` auf den Arbeitsordner. Erster Treffer gewinnt. Agents desselben Projekts (letzter Ordner von `cwd`) sitzen zusammen in einem Raum.

## Permissions im Overlay
Der `PermissionRequest`-Hook fragt die App. Klick auf **Allow/Deny** entscheidet. Keine Antwort in 25 s, App aus oder Fehler ⇒ ganz normaler Claude-Code-Prompt.

## Dev-Log
Events werden pro Tag als JSONL unter `%APPDATA%\KayyOffice\logs` gesammelt (ohne LLM). Tray → „Dev-Log (heute) öffnen“ erzeugt Markdown, Zielordner per `devLogDir` in `config.json` einstellbar (z. B. Obsidian-Vault).

## Entwicklung
```bash
npm test             # Vitest
npm run typecheck
npm run mock -- team # Fake-Events (single | team | permission | error | cleanup)
npm run perf         # Idle-Abnahme (PASS/FAIL); "-- active" für Last
npm run dist         # Installer + Portable nach release/
```
Demo ohne Agents: `electron . --demo` (optional `--screenshot=out.png`).

## Roadmap
Orchestrator-Mod (Chats sprechen miteinander, mit Turn-Limit), weitere Tools (Codex, Cursor) als Adapter, Tauri-Portierung für noch weniger RAM, Antworten aus dem Overlay.
