// Pure scene logic: stable desk slots per agent, seating in the room, and the office counters.
import { projectOf } from '../shared/project';
import type { Agent } from '../shared/types';
import { roomLayout } from './room';
import type { Room, Seat } from './room';

/** Seat index; the room geometry (room.ts) maps it to a position. */
interface Desk {
  agentId: string;
  slot: number;
}

/** Stateful so an agent keeps its desk while others come and go. */
export class DeskLayout {
  private slots = new Map<string, number>();

  layout(agents: Agent[]): Desk[] {
    const present = new Set(agents.map((a) => a.id));
    for (const id of [...this.slots.keys()]) if (!present.has(id)) this.slots.delete(id);
    const used = new Set(this.slots.values());
    const lowestFree = () => {
      let i = 0;
      while (used.has(i)) i++;
      return i;
    };
    const pending = agents
      .filter((a) => !this.slots.has(a.id))
      .sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId) || a.lastEventTs - b.lastEventTs || a.id.localeCompare(b.id));
    const slotFor = (a: Agent): number => {
      const parentSlot = a.parentId ? this.slots.get(a.parentId) : undefined;
      if (parentSlot !== undefined && !used.has(parentSlot + 1)) return parentSlot + 1;
      const mates = agents
        .filter((m) => m.id !== a.id && this.slots.has(m.id) && projectOf(m) === projectOf(a))
        .map((m) => this.slots.get(m.id)!);
      if (mates.length) {
        const after = Math.max(...mates) + 1;
        if (!used.has(after)) return after;
        const before = Math.min(...mates) - 1;
        if (before >= 0 && !used.has(before)) return before;
      }
      return lowestFree();
    };
    for (const a of pending) {
      const slot = slotFor(a);
      this.slots.set(a.id, slot);
      used.add(slot);
    }
    return agents.map((a) => ({ agentId: a.id, slot: this.slots.get(a.id)! }));
  }
}

export interface OfficeStats { total: number; working: number; waiting: number; costUsd: number | null }

/** Footer numbers; cost sums top-level sessions only (subagent cost is part of its session). */
export function officeStats(agents: Agent[]): OfficeStats {
  let working = 0, waiting = 0, cost = 0, hasCost = false;
  for (const a of agents) {
    if (a.status === 'working') working++;
    if (a.status === 'waiting') waiting++;
    if (!a.parentId && a.costUsd !== undefined) { cost += a.costUsd; hasCost = true; }
  }
  return { total: agents.length, working, waiting, costUsd: hasCost ? +cost.toFixed(4) : null };
}

/** Puts each desk's agent on its seat; desks beyond the room count as overflow. Labels = project names per cluster. */
export function seatAgents(desks: Desk[], agents: Record<string, Agent>, room: Room): { seated: Array<{ a: Agent; s: Seat }>; labels: string[]; overflow: number } {
  const seated: Array<{ a: Agent; s: Seat }> = [];
  const projects: string[][] = room.clusters.map(() => []);
  let overflow = 0;
  for (const d of [...desks].sort((x, y) => x.slot - y.slot)) {
    const s = room.seats[d.slot];
    const a = agents[d.agentId];
    if (!s) { overflow++; continue; }
    seated.push({ a, s });
    const name = projectOf(a);
    if (!projects[s.cluster].includes(name)) projects[s.cluster].push(name);
  }
  return { seated, labels: projects.map((p) => p.join(' · ')), overflow };
}

/** Desk rows of the room needed for these desks. */
export function rowCount(desks: Desk[]): number {
  return desks.length ? roomLayout(Math.max(...desks.map((d) => d.slot)) + 1).rows : 0;
}
