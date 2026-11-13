import { PRIORITY_RANK } from './priority.ts';
import type { FaultReport, QueueReportItem } from './types.ts';

/**
 * Deterministic Priority Queue Comparator
 *
 * Ordering rules:
 *   1. Priority rank: Critical (1) < High (2) < Medium (3) < Low (4)
 *   2. Submission timestamp: earliest submitted_at first (FIFO within priority)
 *   3. Report ID: lexicographical ascending tie-breaker (guarantees strict total order)
 */
export function compareQueueReports(a: Pick<FaultReport, 'id' | 'priority' | 'submittedAt'>, b: Pick<FaultReport, 'id' | 'priority' | 'submittedAt'>): number {
  const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const timeA = Date.parse(a.submittedAt);
  const timeB = Date.parse(b.submittedAt);
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
    return timeA - timeB;
  }

  return a.id.localeCompare(b.id);
}

export function buildDeterministicQueue(reports: FaultReport[], nowMs = Date.now()): QueueReportItem[] {
  const activeReports = reports.filter((r) => r.status !== 'Resolved' && r.status !== 'Rejected');
  const sorted = [...activeReports].sort(compareQueueReports);

  return sorted.map((report, idx) => {
    const submittedMs = Date.parse(report.submittedAt);
    const ageMinutes = Number.isNaN(submittedMs) ? 0 : Math.max(0, Math.round((nowMs - submittedMs) / 60000));
    const rank = idx + 1;
    const priorityRank = PRIORITY_RANK[report.priority];
    const queueReason = `Position #${rank}: Priority ${report.priority} (tier ${priorityRank}), submitted ${report.submittedAt}, deterministic ID tie-break ${report.id}.`;

    return {
      ...report,
      queueRank: rank,
      queueReason,
      ageMinutes,
    };
  });
}
