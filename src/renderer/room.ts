// Pure geometry of the office room, in logical pixels (1 logical px = P css px).

export const P = 2;
export const PAD = 4;
export const WALL_H = 26;
export const KITCHEN_W = 40;
export const LOUNGE_W = 88;
export const SEAT_W = 38;
export const CLUSTER_W = SEAT_W * 2;
const CLUSTER_GAP = 12;
const ROW_H = 60;
const ZONE_GAP = 6;
/** Room budget: ~850x300 css px so the permission card still fits below. */
export const MAX_W = 425;
export const MAX_H = 150;

export interface Pt { x: number; y: number }

export interface Seat extends Pt {
  /** x = person centre, y = top of the head while seated. */
  slot: number;
  cluster: number;
  row: number;
  /** 'up' = back to the viewer, screen visible; 'down' = faces the viewer. */
  facing: 'up' | 'down';
  /** Aisle (head-top y) used when leaving the desk. */
  aisleY: number;
}

interface Cluster extends Pt { row: number }

export interface Room {
  w: number;
  h: number;
  cols: number;
  rows: number;
  clusters: Cluster[];
  seats: Seat[];
  kitchenX: number;
  loungeX: number;
  coffee: Pt;
  loungeSpots: Pt[];
  /** Where roster figures wait (sofa, beanbags); inside the lounge only, never a desk. */
  benchSpots: Pt[];
  /** Head-top y of the walkway along the back wall. */
  wallAisleY: number;
}

const FIXED_W = PAD + KITCHEN_W + ZONE_GAP * 2 + LOUNGE_W + PAD;

/** Room for `slots` desks: 4-seat clusters (2 facing 2), up to 2 rows, grows with the team. */
export function roomLayout(slots: number, maxW = MAX_W, maxH = MAX_H): Room {
  const maxCols = Math.max(1, Math.floor((maxW - FIXED_W + CLUSTER_GAP) / (CLUSTER_W + CLUSTER_GAP)));
  const maxRows = maxH >= WALL_H + 4 + ROW_H * 2 ? 2 : 1;
  const want = Math.max(1, Math.ceil(slots / 4));
  const count = Math.min(want, maxCols * maxRows);
  const cols = Math.min(count, maxCols);
  const rows = Math.ceil(count / cols);
  const deskX = PAD + KITCHEN_W + ZONE_GAP;
  const loungeX = deskX + cols * CLUSTER_W + (cols - 1) * CLUSTER_GAP + ZONE_GAP;
  const w = loungeX + LOUNGE_W + PAD;
  const h = WALL_H + 4 + rows * ROW_H;
  const clusters: Cluster[] = [];
  const seats: Seat[] = [];
  for (let k = 0; k < count; k++) {
    const row = Math.floor(k / cols);
    const x = deskX + (k % cols) * (CLUSTER_W + CLUSTER_GAP);
    const y = WALL_H + 2 + row * ROW_H;
    clusters.push({ x, y, row });
    for (let j = 0; j < 4; j++) {
      const top = j >= 2;
      const centre = x + (j % 2) * SEAT_W + SEAT_W / 2;
      seats.push({
        slot: k * 4 + j,
        cluster: k,
        row,
        x: top ? centre - 8 : centre + 8,
        y: top ? y + 11 : y + 35,
        facing: top ? 'down' : 'up',
        aisleY: top ? y + 1 : y + 50,
      });
    }
  }
  const ly = WALL_H;
  return {
    w, h, cols, rows, clusters, seats,
    kitchenX: PAD,
    loungeX,
    coffee: { x: PAD + 13, y: WALL_H + 6 },
    // sofa (3 seats, under the lounge window) and two beanbags around the table
    loungeSpots: [
      { x: loungeX + 22, y: ly - 1 },
      { x: loungeX + 46, y: ly - 1 },
      { x: loungeX + 16, y: ly + 31 },
      { x: loungeX + 74, y: ly + 31 },
      { x: loungeX + 34, y: ly - 1 },
    ],
    // filled from the far end so a resting agent in loungeSpots[0] rarely shares a seat with a waiting one
    benchSpots: [
      { x: loungeX + 46, y: ly - 1 },
      { x: loungeX + 74, y: ly + 31 },
      { x: loungeX + 16, y: ly + 31 },
      { x: loungeX + 60, y: ly + 31 },
      { x: loungeX + 34, y: ly - 1 },
      { x: loungeX + 22, y: ly - 1 },
    ],
    wallAisleY: WALL_H + 1,
  };
}
