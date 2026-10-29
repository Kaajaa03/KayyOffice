import type { Agent } from '../shared/types';

export const CELL_W = 108;
export const CELL_H = 150;

export interface Desk {
  agentId: string;
  slot: number;
  x: number;
  y: number;
  row: number;
}

/** Stateful so an agent keeps its desk while others come and go. */
export class DeskLayout {
  private slots = new Map<string, number>();

  layout(agents: Agent[], width: number): Desk[] {
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
    for (const a of pending) {
      const parentSlot = a.parentId ? this.slots.get(a.parentId) : undefined;
      const slot = parentSlot !== undefined && !used.has(parentSlot + 1) ? parentSlot + 1 : lowestFree();
      this.slots.set(a.id, slot);
      used.add(slot);
    }
    const cols = Math.max(1, Math.floor(width / CELL_W));
    return agents.map((a) => {
      const slot = this.slots.get(a.id)!;
      const row = Math.floor(slot / cols);
      return { agentId: a.id, slot, row, x: (slot % cols) * CELL_W, y: row * CELL_H };
    });
  }
}

export function rowCount(desks: Desk[]): number {
  return desks.length ? Math.max(...desks.map((d) => d.row)) + 1 : 0;
}
