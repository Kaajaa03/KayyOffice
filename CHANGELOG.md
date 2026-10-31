# Changelog

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
