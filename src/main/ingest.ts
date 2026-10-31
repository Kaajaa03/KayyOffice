// Connects the local HTTP server (mod events, permission requests) to the office and the card queue.
import { randomUUID } from 'node:crypto';
import { shouldShowCard } from './approvals';
import type { ApprovalMode } from './approvals';
import type { PermissionQueue } from './control';
import type { EventLog } from './log';
import type { Office } from './office';
import { saveRoster } from './rosterstore';
import { startServer } from './server';

interface IngestDeps {
  rosterFile: string;
  token: string;
  port: number;
  eventLog: EventLog;
  office: Office;
  queue: PermissionQueue;
  approvalMode(): ApprovalMode;
  showOverlay(): void;
  /** Any event was received (settings status "Claude mod connected"). */
  onEvent(): void;
}

export function startIngest(d: IngestDeps) {
  return startServer({
    token: d.token,
    port: d.port,
    onEvent: (e) => {
      d.onEvent();
      d.eventLog.append(e);
      d.office.apply(e);
      if (e.event === 'Roster' && e.roster) saveRoster(d.rosterFile, e.roster);
    },
    onPermission: (p, signal) => {
      // A question is never an allow/deny card: only with its options, and not when the cards are off.
      const isQuestion = p.tool === 'AskUserQuestion';
      if (isQuestion ? !p.options || d.approvalMode() === 'off' : !shouldShowCard(d.approvalMode(), p.tool, p.summary)) {
        return Promise.resolve('ask' as const); // everyday requests stay with Claude's own dialog
      }
      d.office.apply({
        ts: Date.now(), sessionId: p.sessionId, agentId: p.agentId, event: 'Notification',
        cwd: d.office.agent(p.agentId)?.cwd ?? '', message: `permission: ${p.tool}`,
      });
      d.showOverlay();
      return d.queue.add({ id: randomUUID(), agentId: p.agentId, tool: p.tool, summary: p.summary, options: p.options }, signal);
    },
  });
}
