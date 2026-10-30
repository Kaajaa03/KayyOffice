export type Alias = 'haiku' | 'sonnet' | 'opus'

export type Rules = {
  byType: Record<string, Alias>
  readVerbs: string[]
  writeVerbs: string[]
  maxPromptChars: number
}

export const DEFAULT_RULES: Rules = {
  byType: {
    Explore: 'haiku',
    'kayy-scout': 'haiku',
    'claude-code-guide': 'haiku',
    'general-purpose': 'sonnet',
    'kayy-coder': 'sonnet',
    'kayy-tester': 'sonnet',
    'kayy-reviewer': 'sonnet',
    Plan: 'opus',
    'kayy-architect': 'opus',
  },
  readVerbs: ['suche', 'finde', 'liste', 'zähle', 'lies', 'search', 'find', 'list', 'count', 'read'],
  // Stems: a write verb counts when a word starts with it (lösch → löschen, fix → fixing). When unsure, sonnet.
  writeVerbs: [
    'änder', 'schreib', 'lösch', 'implementier', 'fix', 'write', 'wrote', 'edit', 'delet', 'implement',
    'entfern', 'erstell', 'updat', 'creat', 'remov', 'renam', 'add', 'mov', 'refactor', 'ersetz', 'replac',
    'bearbeit', 'anpass', 'modif', 'patch', 'rewrit', 'ergänz', 'beheb',
  ],
  maxPromptChars: 400,
}

// Read verbs match strictly: equal or the verb plus at most one letter (suche/suchen, read/reads, not readme).
const hasReadVerb = (tokens: string[], verbs: string[]) =>
  tokens.some(t => verbs.some(v => t === v || (t.startsWith(v) && t.length - v.length <= 1)))

// Write verbs match by stem: a false positive only costs sonnet instead of haiku.
const hasWriteVerb = (tokens: string[], stems: string[]) => tokens.some(t => stems.some(v => t.startsWith(v)))

export const chooseModel = (
  rules: Rules,
  input: { subagentType: string; prompt?: string; model?: string },
): Alias | undefined => {
  if (input.model !== undefined || input.subagentType === 'fork') return undefined
  const byType = rules.byType[input.subagentType]
  if (input.subagentType !== 'general-purpose') return byType

  const prompt = input.prompt ?? ''
  if (prompt.length === 0 || prompt.length >= rules.maxPromptChars) return 'sonnet'
  const tokens = prompt.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean)
  const isReadOnly = hasReadVerb(tokens, rules.readVerbs) && !hasWriteVerb(tokens, rules.writeVerbs)
  return isReadOnly ? 'haiku' : (byType ?? 'sonnet')
}
