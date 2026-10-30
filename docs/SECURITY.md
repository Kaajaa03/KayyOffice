# Sicherheit

## Annahmen
Ein einzelner Windows-Benutzer, der seine eigenen Projekte bearbeitet. Andere Prozesse auf demselben Rechner (auch anderer Benutzer, auch Webseiten im Browser) sind nicht vertrauenswürdig. Netzwerk: nur `127.0.0.1`.

## Schutzmaßnahmen
| Bedrohung | Maßnahme |
|---|---|
| Fremdprozess besetzt den Port und gibt Freigaben vor | Der Token wird nie gesendet. Anfragen tragen `HMAC(token, "req\|nonce\|pfad\|body")`, Antworten auf `/permission` einen Beweis `HMAC(token, "res\|nonce\|decision")` für genau diese Entscheidung. Ohne gültigen Beweis gilt „ask“ (normaler Dialog) |
| Wiedereinspielen abgefangener Anfragen | Nonce-Cache (begrenzt, 10 min) |
| Webseite im Browser spricht den Server an (DNS-Rebinding) | Host muss `127.0.0.1:<Port>` oder `localhost:<Port>` sein, sonst 421 vor dem Lesen des Bodys |
| Übergroße oder kaputte Eingaben | Body-Limit 64 KB, strikte Validierung, Kürzung aller Felder, Steuerzeichen entfernt |
| Versehentliche Freigabe per Doppelklick | Klick erst nach 600 ms (1,5 s bei riskanten Befehlen), mousedown und mouseup auf demselben Knopf, nächste Karte wird neu „scharf“ |
| Geheimnisse in Dateien | Nachrichten- und Aufgabentexte werden nie gespeichert; Fehler werden nur als „`<Tool>` fehlgeschlagen“ gemeldet; `app.log` enthält keine Befehle oder Tokens (lange Hex-Strings werden geschwärzt) |
| Beschädigte Einstellungen | `config.json` wird atomar geschrieben; Claudes `settings.json` fasst die App nur an, um alte Hook-Einträge (`--kayy-office`) zu entfernen: vorher Backup (erstes plus neueste, insgesamt 5), atomar, ungültiges JSON wird nie überschrieben |
| Die App ist aus oder hängt | Der Mod fällt still auf Claudes normalen Dialog zurück, nie auf „allow“ |

## Freigaben
- Das Overlay und der Mod ändern nie ein core-`deny`. Der Mod gibt nur ein core-`ask` weiter, nur für echte Aufrufe (`tool_use_id`) mit Person als Entscheider.
- `ExitPlanMode` und `AskUserQuestion` werden nie über das Overlay beantwortet.
- **Autopilot** (Opt-in, Standard aus) darf nur Routine im Projektordner freigeben: Lesen/Schreiben im `root` der Session (Laufwerks-Wurzel, Home und Systemordner schalten ihn ab), nie in `.git/`, `.claude/`, `.vscode/`, `.ssh/`, nie in Konfigurations- oder Skriptdateien (`package.json`, `*.config.*`, `.husky/`, CI-Workflows, `.mcp.json` …) und keine Geheimnisse. Shell nur mit Positivliste (jeder Befehl, jede Option, jedes Argument), ohne Umleitungen, Substitution, Umgebungsvariablen oder Pfade außerhalb des Projekts. Ein unabhängiger Angriffs-Review (Umgebungsvariablen, Test-Runner-Optionen, Pfad-Tricks, Konfig-dann-Test-Ketten) ist eingearbeitet.

## Restrisiken, bewusst
- Automatisch geschriebener Quellcode kann beeinflussen, was ein anschließender Testlauf tut. Deshalb gilt der Autopilot nur für eigene, vertrauenswürdige Projekte.
- Der Token liegt im Klartext in `%APPDATA%\KayyOffice\config.json` (Benutzerprofil). Wer dieses Profil lesen kann, kann Anfragen signieren.
- Die Blast-Radius-Erkennung ist eine Heuristik, kein Schutzwall: Sie warnt, ersetzt aber nicht Claudes Berechtigungssystem.

## Melden
Probleme bitte als privates Issue im Repository oder direkt an den Besitzer.
