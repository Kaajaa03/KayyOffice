# Changelog

## 1.0.0 – 2026-10-30
Polish-Release.
- **Fortschritt pro Agent:** `TodoWrite` (Mod und Hook) → Balken und aktuelle Aufgabe am Namensschild, erledigte Aufgaben im Dev-Log.
- **Look:** Pixel-Büro als ganzer Raum (Fliesen, Fenster mit echter Sonne, Küche, Lounge, Schreibtischgruppen, laufende Agents), Namensschilder ohne Überlappung, Layout für 1–40 Agents geprüft, App-Icon, zweisprachig (de/en), reduzierte Bewegung.
- **Bedienung:** Willkommensfenster mit Status und Demo, Tray-Tooltip live, Freigabe-Modus (Standard: nur riskante Befehle), Diagnose-Log.
- **Härtung:** Fehlerzustand über `PostToolUseFailure`, atomare Schreibzugriffe und Backup-Rotation für `settings.json`/`config.json`, Host-Header-Prüfung (DNS-Rebinding), kürzere Timeouts, Log-Rotation, Click-through-Reset, kein Dauer-Timer, fertige Subagents räumen ihren Platz, strikte TypeScript-Prüfung, CI.

## 0.3.0 – 2026-10-30
Orchestrator im Mod: Autopilot (Opt-in, strikte Allowlist, adversarial geprüft), Orchestrierungs-Richtlinie, Entscheidungs-Signal.

## 0.2.0 – 2026-10-29
Claude-Mod `kayy-office` (Router, Approver, Pane), signiertes Protokoll (Token nie auf dem Draht), Modell-Chip, Kosten, Datei, Blast-Radius-Warnung, Pixel-Raum-Renderer.

## 0.1.0 – 2026-10-29
Erste Fassung: Hooks → lokaler Server → Overlay, Freigaben im Overlay, Rollen, Dev-Log.
