/** "Blast radius": a local, LLM-free guess at how destructive a pending tool call is. */
export interface Risk {
  level: 'none' | 'medium' | 'high';
  note: string;
  /** What would be hit, when it can be read from the command (path). */
  target?: string;
}

const NONE: Risk = { level: 'none', note: '' };
const unquote = (s: string) => s.replace(/^["']|["']$/g, '');

export function riskOf(tool: string, summary: string): Risk {
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    return /(^|[\\/])\.env($|\.)|[\\/]\.ssh[\\/]|id_rsa|credentials|\.pem$/i.test(summary)
      ? { level: 'medium', note: 'Sensible Datei (Zugangsdaten/Schlüssel)', target: summary }
      : NONE;
  }
  if (!/^(Bash|PowerShell)$/.test(tool) || !summary) return NONE;
  const cmd = summary;

  const rm = cmd.match(/(?:^|[;&|(]\s*)rm\s+((?:-{1,2}[\w-]+\s+)+)(\S+)/);
  if (rm && /(^|\s)-[a-z]*r|--recursive/i.test(rm[1])) {
    return { level: 'high', note: 'Löscht Dateien rekursiv', target: unquote(rm[2]) };
  }
  const ri = cmd.match(/Remove-Item\s+(\S+)[^;&|]*-Recurse/i);
  if (ri) return { level: 'high', note: 'Löscht Dateien rekursiv', target: unquote(ri[1]) };
  if (/\b(del|erase|rmdir|rd)\b[^;&|]*\s\/s\b/i.test(cmd)) return { level: 'high', note: 'Löscht Dateien rekursiv' };
  if (/\bgit\s+reset\s+(?:\S+\s+)*--hard\b/i.test(cmd)) return { level: 'high', note: 'Verwirft alle lokalen Änderungen' };
  if (/\bgit\s+push\b[^;&|]*\s(--force\b|--force-with-lease\b|-f\b)/i.test(cmd)) {
    return { level: 'high', note: 'Überschreibt die Remote-Historie' };
  }
  if (/\bgit\s+clean\b[^;&|]*\s-[a-z]*f/i.test(cmd)) return { level: 'high', note: 'Löscht untracked Dateien' };
  if (/\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba)?sh\b/i.test(cmd)) return { level: 'high', note: 'Führt heruntergeladenen Code aus' };
  if (/\bdrop\s+(table|database)\b/i.test(cmd)) return { level: 'high', note: 'Löscht Datenbank-Objekte' };
  if (/\bformat\s+[a-z]:/i.test(cmd)) return { level: 'high', note: 'Formatiert ein Laufwerk' };
  if (/\b(chmod|chown)\s+-R\b/.test(cmd)) return { level: 'medium', note: 'Ändert Rechte rekursiv' };
  return NONE;
}
