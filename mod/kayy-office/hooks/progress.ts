// Pure: a TodoWrite call's task list as "done of total" plus the task in progress (see the WP3 spec).

export type Progress = { done: number; total: number; current?: string }

const STATUS = new Set(['pending', 'in_progress', 'completed'])
const MAX_TOTAL = 99
const MAX_CURRENT = 80

// C0 and C1 control characters, DEL, and the line/paragraph separators U+2028/U+2029.
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]', 'g')

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

/** True when the input carries a `todos` array (even an empty one): a real list, not malformed input. */
export const hasTodoList = (input: unknown): boolean =>
  typeof input === 'object' && input !== null && Array.isArray((input as { todos?: unknown }).todos)

export const sameProgress = (a: Progress | undefined, b: Progress | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.done === b.done && a.total === b.total && a.current === b.current)

/** One task of the Task tools (TaskCreate/TaskUpdate); the book is keyed by task id. */
export type TaskRec = { subject: string; activeForm?: string; status: 'pending' | 'in_progress' | 'completed' }

const obj = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined)

/**
 * Applies a successful TaskCreate/TaskUpdate to `book` and returns the progress of all its tasks
 * (undefined: no tasks, too many, or not a task tool). `input` is the call's arguments, `result` the tool output.
 * TaskCreate delivers the id only in its result: `{ task: { id } }`.
 */
export const taskProgress = (book: Map<string, TaskRec>, tool: string, input: unknown, result: unknown): Progress | undefined => {
  const i = obj(input)
  if (tool !== 'TaskCreate' && tool !== 'TaskUpdate') return undefined
  if (tool === 'TaskCreate') {
    const id = obj(obj(result)?.task)?.id
    const subject = clean(i?.subject)
    if (typeof id === 'string' && id !== '' && subject !== undefined) book.set(id, { subject, activeForm: clean(i?.activeForm), status: 'pending' })
  } else if (obj(result)?.success !== false) {
    const id = i?.taskId
    const task = typeof id === 'string' ? book.get(id) : undefined
    if (task !== undefined) {
      if (i?.status === 'deleted') book.delete(id as string)
      else {
        if (typeof i?.status === 'string' && STATUS.has(i.status)) task.status = i.status as TaskRec['status']
        task.subject = clean(i?.subject) ?? task.subject
        task.activeForm = clean(i?.activeForm) ?? task.activeForm
      }
    }
  }
  let done = 0
  let current: string | undefined
  for (const t of book.values()) {
    if (t.status === 'completed') done++
    else if (t.status === 'in_progress' && current === undefined) current = t.activeForm ?? t.subject
  }
  if (book.size < 1 || book.size > MAX_TOTAL) return undefined
  return current === undefined ? { done, total: book.size } : { done, total: book.size, current }
}
