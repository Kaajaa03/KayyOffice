// AskUserQuestion on the overlay: one card per question, one button per option label.
// The labels never come back from the overlay, only the clicked index; the answer text is always
// taken from the model's own question, so a forged reply can pick an option but never invent one.
export const QUESTION_TOOL = 'AskUserQuestion'

export type Question = { question: string; options: { label: string }[] }
export type QuestionPayload = { sessionId: string; agentId: string; tool: typeof QUESTION_TOOL; summary: string; options: string[] }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * The questions when every one can be answered by a single click: 1-4 plain choice questions,
 * single select, 2-4 labelled options, distinct question texts. Anything else (multi select, text,
 * number, a malformed input) is undefined and stays with Claude's own dialog.
 */
export const askableOf = (input: unknown): Question[] | undefined => {
  const questions = isObject(input) ? input.questions : undefined
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 4) return undefined
  const out: Question[] = []
  for (const q of questions) {
    if (!isObject(q) || typeof q.question !== 'string' || q.question.trim() === '') return undefined
    if (q.multiSelect === true || (q.kind !== undefined && q.kind !== 'choice')) return undefined
    const options = q.options
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) return undefined
    const labels = options.map(o => (isObject(o) ? o.label : undefined))
    if (!labels.every((l): l is string => typeof l === 'string' && l.trim() !== '')) return undefined
    if (new Set(labels).size !== labels.length) return undefined
    out.push({ question: q.question, options: labels.map(label => ({ label })) })
  }
  if (new Set(out.map(q => q.question)).size !== out.length) return undefined
  return out
}

/** `{ question text: chosen label }` for one pick per question; undefined if a pick is not a valid option index. */
export const answersOf = (questions: Question[], picks: readonly number[]): Record<string, string> | undefined => {
  if (picks.length !== questions.length) return undefined
  const answers: Record<string, string> = {}
  for (const [i, q] of questions.entries()) {
    const label = q.options[picks[i]!]?.label
    if (label === undefined || !Number.isInteger(picks[i])) return undefined
    answers[q.question] = label
  }
  return answers
}

/**
 * The input of the call with the answers filled in (`updatedInput` replaces the whole input, so
 * the questions are kept): the original questions as the model wrote them, plus `answers`.
 */
export const updatedInputOf = (input: unknown, answers: Record<string, string>): Record<string, unknown> => ({
  ...(isObject(input) ? input : {}),
  answers,
})

/** The tool's own output for an answered dialog: what `AskUserQuestion` would have returned. */
export const resultOf = (input: unknown, answers: Record<string, string>): { questions: unknown[]; answers: Record<string, string> } => {
  const questions = isObject(input) && Array.isArray(input.questions) ? input.questions : []
  return { questions, answers }
}

/**
 * Puts the questions to the overlay one after the other. Every click is a real answer from the
 * person; a question left open (timeout, overlay off, bad proof) ends it with undefined, so the whole
 * call falls back to the normal dialog. Never a default answer.
 */
export async function askQuestions(
  ask: (payload: QuestionPayload) => Promise<number | undefined>,
  questions: Question[],
  who: { sessionId: string; agentId: string },
): Promise<Record<string, string> | undefined> {
  const picks: number[] = []
  for (const q of questions) {
    const pick = await ask({ ...who, tool: QUESTION_TOOL, summary: q.question.slice(0, 300), options: q.options.map(o => o.label) })
    if (pick === undefined) return undefined
    picks.push(pick)
  }
  return answersOf(questions, picks)
}
