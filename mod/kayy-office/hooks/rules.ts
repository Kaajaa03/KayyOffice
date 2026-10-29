import { DEFAULT_RULES, type Alias, type Rules } from './routing'

const ALIASES: readonly string[] = ['haiku', 'sonnet', 'opus']
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

// Any problem in the text means the whole file is ignored: half-applied rules are worse than defaults.
export const parseRules = (text: string | undefined): { rules: Rules; isFallback: boolean } => {
  const fallback = { rules: DEFAULT_RULES, isFallback: true }
  if (text === undefined) return fallback
  try {
    const raw = JSON.parse(text)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fallback
    const rules: Rules = { ...DEFAULT_RULES, byType: { ...DEFAULT_RULES.byType } }

    if (raw.byType !== undefined) {
      const t = raw.byType
      if (typeof t !== 'object' || t === null) return fallback
      for (const [k, v] of Object.entries(t)) {
        if (typeof v !== 'string' || !ALIASES.includes(v)) return fallback
        rules.byType[k] = v as Alias
      }
    }
    for (const key of ['readVerbs', 'writeVerbs'] as const) {
      if (raw[key] === undefined) continue
      if (!isStrings(raw[key])) return fallback
      rules[key] = raw[key].map((s: string) => s.toLowerCase())
    }
    if (raw.maxPromptChars !== undefined) {
      if (typeof raw.maxPromptChars !== 'number' || !(raw.maxPromptChars > 0)) return fallback
      rules.maxPromptChars = raw.maxPromptChars
    }
    return { rules, isFallback: false }
  } catch {
    return fallback
  }
}
