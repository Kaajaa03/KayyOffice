import { riskOf } from '../shared/risk';

/** Which permission requests the overlay turns into a card. Everything else falls through to
 *  Claude's normal dialog ('ask'), so the overlay never adds noise for everyday commands. */
export type ApprovalMode = 'all' | 'risky' | 'off';

export const DEFAULT_APPROVAL_MODE: ApprovalMode = 'risky';

export function parseApprovalMode(v: unknown): ApprovalMode {
  return v === 'all' || v === 'risky' || v === 'off' ? v : DEFAULT_APPROVAL_MODE;
}

export function shouldShowCard(mode: ApprovalMode, tool: string, summary: string): boolean {
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return riskOf(tool, summary).level !== 'none';
}
