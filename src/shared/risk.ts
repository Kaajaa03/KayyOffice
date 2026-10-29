/** "Blast radius": a local, LLM-free guess at how destructive a pending tool call is. */
export interface Risk {
  level: 'none' | 'medium' | 'high';
  note: string;
  /** What would be hit, when it can be read from the command (path). */
  target?: string;
}

const NONE: Risk = { level: 'none', note: '' };
const unquote = (s: string) => s.replace(/^["'`]+|["'`]+$/g, '');
const DELETERS = new Set(['rm', 'del', 'erase', 'rmdir', 'rd', 'ri', 'remove-item']);
const WRAPPERS = new Set(['sudo', 'env', 'nohup', 'time', 'command', 'xargs', 'exec', 'doas']);
const hasShortFlag = (tokens: string[], letter: RegExp) => tokens.some((t) => /^-[a-z]+$/i.test(t) && letter.test(t));

/** First non-flag token, or the value after -Path/-LiteralPath. */
function targetOf(tokens: string[]): string | undefined {
  const i = tokens.findIndex((t) => /^-(literal)?path$/i.test(t));
  if (i >= 0 && tokens[i + 1]) return unquote(tokens[i + 1]);
  const t = tokens.find((x) => !x.startsWith('-') && !/^\/[a-z]$/i.test(x));
  return t ? unquote(t) : undefined;
}

function segmentRisk(segment: string): Risk {
  let tokens = segment.trim().split(/\s+/).filter(Boolean);
  while (tokens.length && (WRAPPERS.has(tokens[0].toLowerCase()) || /^\w+=\S*$/.test(tokens[0]))) tokens = tokens.slice(1);
  if (!tokens.length) return NONE;
  const name = tokens[0].toLowerCase().replace(/\.exe$/, '');
  const args = tokens.slice(1);

  if (DELETERS.has(name)) {
    const unixRecursive = args.some((t) => /^-[a-z]{1,4}$/i.test(t) && /r/i.test(t) && !/^-force$/i.test(t)) || args.includes('--recursive');
    const psRecursive = args.some((t) => /^-r(ec(urse)?)?$/i.test(t));
    const cmdRecursive = (name === 'del' || name === 'erase' || name === 'rmdir' || name === 'rd') && args.some((t) => /^\/s$/i.test(t));
    if (unixRecursive || psRecursive || cmdRecursive) {
      return { level: 'high', note: 'Löscht Dateien rekursiv', target: targetOf(args) };
    }
    return NONE;
  }

  if (name === 'git') {
    let i = 0;
    while (i < args.length && args[i].startsWith('-')) i += /^-[Cc]$/.test(args[i]) ? 2 : 1; // git -C path / -c k=v / --no-pager
    const sub = args[i]?.toLowerCase();
    const rest = args.slice(i + 1);
    if (sub === 'reset' && rest.includes('--hard')) return { level: 'high', note: 'Verwirft alle lokalen Änderungen' };
    if (sub === 'push') {
      const force = rest.some((t) => t === '--force' || t.startsWith('--force-with-lease') || /^-[a-z]*f[a-z]*$/.test(t) || /^\+\S/.test(t));
      if (force) return { level: 'high', note: 'Überschreibt die Remote-Historie' };
    }
    if (sub === 'clean' && hasShortFlag(rest, /f/)) return { level: 'high', note: 'Löscht untracked Dateien' };
  }
  return NONE;
}

export function riskOf(tool: string, summary: string): Risk {
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    return /(^|[\\/])\.env($|\.)|[\\/]\.ssh[\\/]|id_rsa|credentials|\.pem$/i.test(summary)
      ? { level: 'medium', note: 'Sensible Datei (Zugangsdaten/Schlüssel)', target: summary }
      : NONE;
  }
  if (!/^(Bash|PowerShell)$/.test(tool) || !summary) return NONE;
  const cmd = summary;

  // whole-string patterns that span pipes / need no tokenising
  if (/\b(curl|wget)\b[^|;\n]*\|\s*(sudo\s+)?(ba|z)?sh\b/i.test(cmd)) return { level: 'high', note: 'Führt heruntergeladenen Code aus' };
  if (/\bdrop\s+(table|database)\b/i.test(cmd)) return { level: 'high', note: 'Löscht Datenbank-Objekte' };
  if (/\bformat\s+[a-z]:/i.test(cmd)) return { level: 'high', note: 'Formatiert ein Laufwerk' };
  if (/-exec\s+rm\s+-[a-z]*r/i.test(cmd)) return { level: 'high', note: 'Löscht Dateien rekursiv' };

  // commands wrapped in `bash -c "..."`, `powershell -Command '...'`, `cmd /c "..."`
  for (const m of cmd.matchAll(/\b(?:(?:ba|z|da)?sh\s+-[a-z]*c|(?:pwsh|powershell)(?:\.exe)?\b[^"'\n]*?-c(?:ommand)?|cmd(?:\.exe)?\s+\/c)\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    const inner = riskOf(tool, m[1] ?? m[2] ?? '');
    if (inner.level !== 'none') return inner;
  }

  let medium: Risk | null = null;
  for (const segment of cmd.split(/[;&|\n(){}`]+/)) {
    const r = segmentRisk(segment);
    if (r.level === 'high') return r;
  }
  if (/\b(chmod|chown)\s+-R\b/.test(cmd)) medium = { level: 'medium', note: 'Ändert Rechte rekursiv' };
  return medium ?? NONE;
}
