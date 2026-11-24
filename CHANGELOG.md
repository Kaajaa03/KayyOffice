# Changelog

## 1.3.5 – 2026-11-24
- **Nutzungsverlauf:** Tageskosten (USD) und Sessions in `usage.json`, 30 Tage, Anzeige im Einstellungsfenster (7 Tage). Keine Prompts oder Pfade, Session-IDs nur als Hash.
- **Fortschritt auch mit Task-Tools:** `TaskCreate`/`TaskUpdate` werden wie `TodoWrite` ausgewertet (nur gegen die Typen und Tests geprüft).
- **Schneller:** Textkürzen per Binärsuche statt linearer Schleife; Log-Aufräumen läuft täglich, nicht nur beim Start.
- **Diagnose:** Renderer-Abstürze loggen jetzt auch den `exitCode`.
- **Lizenz:** MIT (`LICENSE`).

## 1.3.4 – 2026-11-24
- **Frage-Karte:** Optionsbeschreibungen unter dem Label (bis 3 Zeilen, 300 Zeichen), Fragen bleiben 2 Minuten statt 20 Sekunden stehen.

## 1.3.3 – 2026-11-23
- **Gemeinsame Config** in `%USERPROFILE%\.kayy-office`: Claude Desktop (Store-App) leitet AppData um, App und Mod sahen verschiedene Tokens.
- Token wird bei Signatur-Fehler neu geladen, Autostart bei jedem Start erneuert, Tray-Eintrag „Neu laden“, Auto-Reload des abgestürzten Renderers, `npm run sync-mod`.

## 1.3.2 – 2026-11-01
- **Frage-Karte:** Optionen stehen untereinander in voller Breite, nichts wird mehr abgeschnitten.
- **Wartebereich:** Schilder in der Lounge werden gestaffelt, statt sich zu überdecken.

## 1.3.1 – 2026-10-31
- **Ungenutzte Chats** (idle) verlieren nach 5 Minuten ihre Figur.
- **Wartebereich** wird in `roster.json` gespeichert und überlebt einen Neustart.
- **Orchestrierungs-Richtlinie** delegiert nach festen Auslösern statt „wenn es sich lohnt“.
- Autopilot: `git commit` und `grep -r` warten immer auf die Person.
- README neu gestaltet (Banner, Screenshots, Diagramm).
- Neu, optional (Standard aus): **Signalton**, wenn ein Agent auf dich wartet (Einstellungen → System).
- Subagent-Schilder zeigen den Typ (`reviewer`, `coder` …); `npm run setup` und CI für Windows, Linux und macOS.

## 1.3.0 – 2026-10-31
Nur noch der Claude-Mod.
- **Hook-Weg entfernt:** `hook.js`, Installieren/Entfernen, Hinweisdialog und die Quellen-Weiche (`source`) sind weg; der Mod ist der einzige Weg, Agents zu melden. Einstellungen → Verbindung zeigt „Claude-Mod verbunden“ (Event in den letzten 5 Minuten) und sonst den Installationsbefehl.
- **Alte Hooks verschwinden automatisch:** Beim Start entfernt die App ihre `--kayy-office`-Einträge aus `~/.claude/settings.json` (Backup, fremde Hooks bleiben) und das gestagte `hook.js`.
- **Autostart ab dem ersten Start** der installierten App (abschaltbar unter Einstellungen → System).
- Neues Debug-Flag `--claude-dir=<Ordner>` ersetzt `~/.claude` für Testläufe. Der Mod sendet kein `source` mehr.

## 1.2.1 – 2026-10-31
Aufgeräumt, ohne neue Funktionen.
- Das Willkommensfenster ist entfallen: Beim ersten Start öffnen sich die Einstellungen mit kurzer Einführung.
- `main.ts` von 486 auf rund 150 Zeilen, aufgeteilt in `tray`, `ipc`, `ingest`, `office`, `actions`, `flags`; alle Kommandozeilen-Flags an einer Stelle.
- Renderer-Code gekürzt und in thematische Module gegliedert; ungenutzte Exporte, tote Funktionen und doppelte Hilfen entfernt.
- Alte Planungsdokumente, ungenutzte Screenshots und Konfigurationsreste gelöscht.

## 1.2.0 – 2026-10-30
Größe und Einstellungen.
- **Größe:** fünf Stufen (67, 100, 133, 167, 200 %), jeweils ganze Pixel für die Pixel-Kunst; Fenstergröße plus Seitenzoom, Mitte und Oberkante bleiben beim Wechsel, auf kleinen Bildschirmen automatisch begrenzt. Strg + Mausrad über der Titelleiste.
- **Transparenz:** 50 bis 100 % in 5-%-Schritten (gilt auch für die Freigabe-Karte).
- **Einstellungsfenster** (Tray-Menü oder Doppelklick auf das Tray-Icon): Sprache, Größe, Transparenz, Position, Freigaben, Verbindungsstatus (Hooks, Claude-Mod, Port) mit Installieren/Entfernen direkt im Fenster, Autostart, Wach bleiben, Werkzeuge. Alles wirkt sofort.
- **Tray vereinfacht:** Anzeigen/Verstecken, Einstellungen…, Demo zeigen, Beenden.
- Fehlertexte in Klartext (Details im Diagnose-Log); `roles.json` wird nach dem Speichern automatisch neu geladen.
- Ziehen der Titelleiste folgt dem echten Mauszeiger (exakt bei jeder Größe). Debug-Flags `--settings`, `--scale`, `--lang`, `--config-dir`.

## 1.1.0 – 2026-10-30
Effizienz und Bedienung.
- **Büro verschiebbar:** Titelleiste ziehen oder feste Plätze im Tray; Position wird gemerkt und nach Monitor-Wechsel zurück auf einen Bildschirm geholt.
- **Weniger Ballast:** Hooks laufen asynchron (Claude wartet nicht mehr ~60 ms pro Aufruf); sobald der Mod meldet, bietet das Overlay einmalig an, die überflüssigen Hooks zu entfernen.
- **Schlankere Richtlinie:** nur noch ~125 Tokens und „direkt arbeiten, nur delegieren wenn es sich lohnt“ statt pauschalem Delegieren.
- **Neue Subagent-Typen:** `kayy-tester` und `kayy-reviewer` (Router: Sonnet).
- **Nutzung in der Fußzeile:** Kontextfüllung der Session und Konto-Limit (`context`, `limit` im Protokoll), Warnstufen ab 70 % und 85 %.
- **Wartebereich:** neues Event `Roster` (verfügbare Agent-Typen); nicht eingesetzte Typen warten als gedimmte Figuren in der Lounge, ohne Schreibtischplätze oder Dauer-Animation zu kosten.
- Demo (`--demo`, `--demo-count`) zeigt Roster, Kontext und Limit.

## 1.0.0 – 2026-10-30
Polish-Release.
- **Fortschritt pro Agent:** `TodoWrite` (Mod und Hook) → Balken und aktuelle Aufgabe am Namensschild, erledigte Aufgaben im Dev-Log.
- **Look:** Pixel-Büro als ganzer Raum (Fliesen, Fenster mit echter Sonne, Küche, Lounge, Schreibtischgruppen, laufende Agents), Namensschilder ohne Überlappung, Layout für 1–40 Agents geprüft, App-Icon, zweisprachig (de/en), reduzierte Bewegung.
- **Bedienung:** Tray-Tooltip live, Freigabe-Modus (Standard: nur riskante Befehle), Diagnose-Log.
- **Härtung:** Fehlerzustand über `PostToolUseFailure`, atomare Schreibzugriffe und Backup-Rotation für `settings.json`/`config.json`, Host-Header-Prüfung (DNS-Rebinding), kürzere Timeouts, Log-Rotation, Click-through-Reset, kein Dauer-Timer, fertige Subagents räumen ihren Platz, strikte TypeScript-Prüfung, CI.

## 0.3.0 – 2026-10-30
Orchestrator im Mod: Autopilot (Opt-in, strikte Allowlist, adversarial geprüft), Orchestrierungs-Richtlinie, Entscheidungs-Signal.

## 0.2.0 – 2026-10-29
Claude-Mod `kayy-office` (Router, Approver, Pane), signiertes Protokoll (Token nie auf dem Draht), Modell-Chip, Kosten, Datei, Blast-Radius-Warnung, Pixel-Raum-Renderer.

## 0.1.0 – 2026-10-29
Erste Fassung: Hooks → lokaler Server → Overlay, Freigaben im Overlay, Rollen, Dev-Log.

## 1.3.3
- Fix: empty office after a reboot. Claude Desktop is a Store app and sees `%APPDATA%` redirected into its package, so the app (started by Windows) and the mod read two different `config.json` files with different tokens (every event rejected with 401). The shared config now lives in `%USERPROFILE%\.kayy-office` (old AppData files are taken over once); the mod looks there first.
- The app reloads the token from disk on a signature mismatch, re-creates the Windows autostart entry on every start, logs why a request was rejected, and has a tray entry "Reload".
