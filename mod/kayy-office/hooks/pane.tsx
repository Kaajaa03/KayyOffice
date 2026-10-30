import { atom, read, type EngineInterface, type RenderInput } from 'claude-code'
import type { AgentRow, AutopilotState, OverlayLink, PendingRow } from '../types'
import { answerFromPane } from './approver'
import { autopilotLine } from './pilot'
import { MAIN, type Office } from './state'

const agents = atom({ plugin: 'kayy-office', key: 'agents' } as const, [] as AgentRow[], { shape: 'agents-1' })
const pending = atom({ plugin: 'kayy-office', key: 'pending' } as const, [] as PendingRow[], { shape: 'pending-1' })
const cost = atom({ plugin: 'kayy-office', key: 'cost' } as const, null as number | null)
const counts = atom({ plugin: 'kayy-office', key: 'counts' } as const, { haiku: 0, sonnet: 0, opus: 0 })
const isOff = atom({ plugin: 'kayy-office', key: 'isOff' } as const, false)
const autopilot = atom({ plugin: 'kayy-office', key: 'autopilot' } as const, { isOn: false, auto: 0, asked: 0 } as AutopilotState)
const decision = atom({ plugin: 'kayy-office', key: 'decision' } as const, null as string | null)
const link = atom({ plugin: 'kayy-office', key: 'link' } as const, 'unknown' as OverlayLink)

const STATUS: Record<AgentRow['status'], string> = {
  running: '● läuft',
  idle: '○ wartet',
  done: '✓ fertig',
  error: '✗ Fehler',
}

const CHIP: Record<string, string> = { haiku: 'H', sonnet: 'S', opus: 'O' }

export const modelChip = (model: string | undefined): string | undefined => {
  if (!model) return undefined
  const alias = model.match(/haiku|sonnet|opus/)?.[0]
  return alias ? CHIP[alias] : model.slice(0, 12)
}

/** Rows in tree order: each agent after its parent, with its depth for the indent. */
export const ordered = (list: readonly AgentRow[]): { row: AgentRow; depth: number }[] => {
  const ids = new Set(list.map(a => a.id))
  const parentOf = (a: AgentRow) => (a.parentId !== undefined && ids.has(a.parentId) ? a.parentId : a.id === MAIN ? undefined : ids.has(MAIN) ? MAIN : undefined)
  const out: { row: AgentRow; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (parent: string | undefined, depth: number) => {
    for (const a of list) {
      if (seen.has(a.id) || parentOf(a) !== parent) continue
      seen.add(a.id)
      out.push({ row: a, depth })
      if (depth < 6) walk(a.id, depth + 1)
    }
  }
  walk(undefined, 0)
  for (const a of list) if (!seen.has(a.id)) out.push({ row: a, depth: 0 })
  return out
}

const cutTo = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>, office: Office) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const width = Math.max(20, e.props.bodyColumns)
  const list = await read($, agents)
  const asks = await read($, pending)
  const spent = await read($, cost)
  const routed = await read($, counts)
  const routerOff = await read($, isOff)
  const overlay = await read($, link)
  const pilot = await read($, autopilot)
  const open = await read($, decision)

  return (
    <Box flexDirection="column">
      {open !== null && <Text bold color="yellow">Entscheidung offen: {open}</Text>}
      <Text bold>Agents</Text>
      {list.length === 0 && <Text dimColor>Noch keine Agents.</Text>}
      {ordered(list).map(({ row, depth }) => {
        const doing = row.file ?? row.tool
        const chip = modelChip(row.model)
        const name = row.id === MAIN ? 'Haupt-Agent' : row.type
        const prog = row.progress ? ` · ${row.progress.done}/${row.progress.total}${row.progress.current ? ' · ' + row.progress.current : ''}` : ''
        const line = `${'  '.repeat(depth)}${STATUS[row.status]} ${name}${doing ? ' · ' + doing : ''}${prog}`
        return (
          <Text dimColor={row.status === 'done'}>
            {cutTo(line, width - (chip ? 4 : 0))}
            {chip ? <Text color="cyan"> [{chip}]</Text> : ''}
          </Text>
        )
      })}
      <Text> </Text>
      <Text>Kosten: {spent === null ? 'unbekannt' : `$${spent.toFixed(2)}`}</Text>
      <Text>
        Router{routerOff ? ' (aus)' : ''}: haiku {routed.haiku} · sonnet {routed.sonnet} · opus {routed.opus}
      </Text>
      <Text>{autopilotLine(pilot)}</Text>
      <Text dimColor>Overlay: {overlay === 'ok' ? 'verbunden' : overlay === 'off' ? 'nicht erreichbar' : 'unbekannt'}</Text>
      {asks.length > 0 && <Text> </Text>}
      {asks.length > 0 && <Text bold>Freigaben</Text>}
      {asks.map(ask => (
        <Box flexDirection="column">
          <Text>
            {ask.tool}: {cutTo(ask.summary, Math.max(10, width - ask.tool.length - 2))}
          </Text>
          <Box flexDirection="row">
            <Button key={`allow-${ask.id}`} label="Erlauben" variant="primary" onPress={() => answerFromPane($, office, ask.id, 'allow')} />
            <Button key={`deny-${ask.id}`} label="Ablehnen" onPress={() => answerFromPane($, office, ask.id, 'deny')} />
            <Button key={`ask-${ask.id}`} label="Dialog" onPress={() => answerFromPane($, office, ask.id, 'ask')} />
          </Box>
        </Box>
      ))}
    </Box>
  )
}
