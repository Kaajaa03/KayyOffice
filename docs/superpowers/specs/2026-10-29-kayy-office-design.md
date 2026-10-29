# Kayy Office – Design

Datum: 2026-10-29 · Status: Entwurf zur Review

## Ziel
Windows-Pendant zu Lumio (Mac): ein visuelles Pixel-Büro, in dem jeder Claude-Code-Agent (inkl. Subagents) einen Schreibtisch hat. Zeigt live Status, erlaubt Steuerung (Permissions) und bildet Rollen/Projekte für Multi-Agent-Arbeit ab.

## Nicht-Ziele
- Kein LLM-Aufruf, kein Polling der Agents, keine Telemetrie. Netzwerk: nur localhost.
- Kein Cloud-Dienst, keine Accounts.
- Zunächst nur Claude Code (andere Tools = spätere Adapter).

## Erfolgskriterien
1. **Effizienz:** Idle < 1 % CPU, < 150 MB RAM (Ziel < 100 MB), keine Aktivität ohne Events; Hook-Script < 50 ms.
2. **Smooth:** Animationen 60 fps bei Aktivität, gedrosselt (≤ 10 fps bzw. pausiert) bei Idle/versteckt.
3. **Robust:** App aus/abgestürzt ⇒ Claude Code unbeeinträchtigt.
4. **Schön:** konsistente Pixel-Art-Ästhetik, Tag/Nacht-Stimmung, lesbare Zustände auf einen Blick.

## Architektur

```
Claude Code Hook ──► hook.js (Node, winzig) ──HTTP POST──► localhost:47821 ──► Main (Electron)
                                                                                 │ IPC
                                                                       Renderer (Canvas-Büro)
```

Units (je eine Aufgabe, klare Schnittstelle):
- `hook/` – `hook.js`: liest Hook-JSON von stdin, normalisiert, POST an App (Timeout 150 ms, Fehler still). Für Steuerung (Stufe B) blockierender Modus mit Antwort-Timeout.
- `src/main/server.ts` – lokaler HTTP-Server (nur 127.0.0.1, Zufalls-Token im Header, Port-Fallback), validiert Events.
- `src/main/state.ts` – **reine Funktion** `reduce(state, event) → state`; Agents, Zustände, Projekte. Voll unit-testbar.
- `src/main/window.ts` – transparentes, frameless, always-on-top Overlay; klickdurchlässig außer interaktiven Bereichen; Tray-Icon; Hotkey zum Ein-/Ausklappen; pausiert Rendering wenn versteckt.
- `src/renderer/` – Canvas-Renderer: Sprites, Schreibtische, Animationen, Tag/Nacht. Zeichnet nur bei Dirty-State oder laufender Animation (requestAnimationFrame-Gating).
- `src/main/control.ts` (Stufe B) – offene Permission-Anfragen, Freigabe/Ablehnung → Antwort an wartenden Hook.
- `src/main/roles.ts` (Stufe C) – lädt `roles.json`, ordnet Agents Rolle/Farbe/Sprite zu, gruppiert nach `cwd`.
- `src/main/log.ts` (Stufe C) – Tages-/Wochen-Recap und Dev-Log (Markdown) aus Events, ohne LLM.
- `tools/mock-events.ts` – Event-Generator, um das Büro ohne echte Agents zu testen.

## Event-Modell
Hooks: SessionStart, PreToolUse, PostToolUse, Notification, Stop, SubagentStart, SubagentStop, SessionEnd.
Normalisiert: `{ ts, sessionId, agentId, parentId?, event, tool?, cwd, message? }`.

Zustände je Agent: `idle` → `working(tool-kategorie: code|terminal|browser|other)` → `waiting` (Notification/Permission) → `done` (Stop; nach Timeout `idle`) / `error`. Ghost-Cleanup: Sessions ohne Event > N Min verschwinden.

## Stufen
- **A – Status (MVP):** Datenfluss, Overlay, Schreibtische, Zustände, Tray, Hotkey, Mock-Generator, Hook-Installer (ergänzt `settings.json` nicht-destruktiv, mit Backup).
- **B – Steuerung:** Permission im Overlay freigeben/ablehnen via blockierendem PreToolUse-Hook (nur wenn App läuft; sonst normaler Prompt), Wachbleiben solange Agents laufen (`powerSaveBlocker`), Toasts/Glow in Agentenfarbe.
- **C – Rollen & Log:** `roles.json`, Projektgruppen im Büro, Tages-/Wochen-Recap, Dev-Log in Markdown (Zielordner konfigurierbar, z. B. Vault).

## Effizienz-Maßnahmen
- Event-getrieben; kein Timer-Polling außer Animations-Frames.
- Ein Renderer-Fenster; Hintergrund-Throttling an; Canvas-Sprites aus Atlas, keine DOM-Animation.
- Kein Framework-Overhead im Renderer (Vanilla TS + Canvas).
- Hook-Script ohne Abhängigkeiten, nur `http`.
- Spätere Option: Portierung auf Tauri (Renderer wiederverwendbar).

## Sicherheit
- Server nur auf 127.0.0.1, Token-Header (Token liegt in User-Config, Hook liest ihn).
- Kein Ausführen von Inhalten aus Events; Payloads werden validiert/gekürzt.
- Hook-Installer ändert nur eigene Einträge, legt Backup an, ist rückgängig machbar.

## Tests
- Unit: `reduce()` (Zustandsübergänge, Subagents, Cleanup), Event-Validierung, roles/log.
- Integration: Mock-Events → Server → State.
- Visuell/manuell: Mock-Generator mit Szenarien (1 Agent, 5 Agents, Permission-Wartend, Fehler).
- Perf-Check: Idle-CPU/RAM-Messung als Teil der Abnahme.

## Projekt-Setup
- Ordner: `C:\Users\kaja\IdeaProjects\KayyOffice`, Git, später privates GitHub-Repo.
- Stack: Electron + TypeScript, Vitest, electron-builder (Windows-Installer später).

## Offene Punkte
- Pixel-Art-Assets: zunächst selbst generiert (Code/einfache Sprites); Feinschliff später.
- GitHub-Repo: privat anlegen, sobald `gh auth login` erneuert ist.
