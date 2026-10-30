// Pure: a TodoWrite call's task list as "done of total" plus the task in progress (see the WP3 spec).

export type Progress = { done: number; total: number; current?: string }

const STATUS = new Set(['pending', 'in_progress', 'completed'])
const MAX_TOTAL = 99
const MAX_CURRENT = 80

// C0 and C1 control characters and DEL.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g

const clean = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const s = v.replace(CONTROL, '').slice(0, MAX_CURRENT)
  return s.length > 0 ? s : undefined
}

/** `input` is the TodoWrite arguments (`{ todos: [...] }`); undefined when there is nothing valid to show. */
export const todoProgress = (input: unknown): Progress | undefined => {
  if (typeof input !== 'object' || input === null) return undefined
  const todos = (input as { todos?: unknown }).todos
  if (!Array.isArray(todos)) return undefined
  let done = 0
  let total = 0
  let current: string | undefined
  for (const item of todos) {
    if (typeof item !== 'object' || item === null) continue
    const { status, content, activeForm } = item as Record<string, unknown>
    if (typeof status !== 'string' || !STATUS.has(status) || typeof content !== 'string') continue
    total++
    if (status === 'completed') done++
    else if (status === 'in_progress' && current === undefined) current = clean(activeForm) ?? clean(content)
  }
  if (total < 1 || total > MAX_TOTAL) return undefined
  return current === undefined ? { done, total } : { done, total, current }
}

export const sameProgress = (a: Progress | undefined, b: Progress | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.done === b.done && a.total === b.total && a.current === b.current)
