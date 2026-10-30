import type { PromptComposeSection } from 'claude-code'

export const ORCHESTRATOR_ID = 'kayy-office:orchestrator'

/** The one section the orchestrator adds to the system prompt (English, under 110 words). */
export const ORCHESTRATOR_TEXT = [
  'Kayy orchestration policy.',
  'Delegate when it saves cost or time: searching and reading go to kayy-scout (haiku);',
  'clearly specified implementation goes to kayy-coder (sonnet);',
  'design, hard debugging and security review go to kayy-architect (opus).',
  'Run independent subtasks in parallel. Do not delegate trivial work.',
  'Decisions: ask the user only about irreversible or destructive actions, direction or architecture choices, or spending money;',
  'otherwise decide yourself, state the assumption in one line and continue.',
  'Never ask permission for routine reading or editing inside the project.',
].join(' ')

/** The engine's sections with the policy as the last `session` section (on), or without it (off). */
export const withOrchestrator = (sections: readonly PromptComposeSection[], isOn: boolean): PromptComposeSection[] => {
  const others = sections.filter(s => s.id !== ORCHESTRATOR_ID)
  return isOn ? [...others, { id: ORCHESTRATOR_ID, text: ORCHESTRATOR_TEXT, scope: 'session' }] : others
}
