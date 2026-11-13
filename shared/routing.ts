import type {
  AssignmentType,
  FaultCategory,
  HandlerProfile,
  PriorityLevel,
  ReportStatus,
  RoutingRule,
  RoutingTraceStep,
} from './types.ts';

export interface RoutingInput {
  reportId: string;
  category: FaultCategory;
  zone: string;
  priority: PriorityLevel;
  knownZones: string[];
  routingRules: RoutingRule[];
  handlers: HandlerProfile[];
  existingActiveAssignmentHandlerIds?: Array<{ reportId: string; handlerId: number }>;
  excludedHandlerIds?: number[];
}

export interface RoutingDecision {
  assignedHandlerId: number | null;
  assignedHandlerName: string | null;
  assignmentType: AssignmentType;
  status: ReportStatus;
  unknownZone: boolean;
  duplicateBlocked: boolean;
  escalate: boolean;
  escalationReason: string | null;
  explanation: string;
  trace: RoutingTraceStep[];
}

/**
 * Smart Routing & Handler Assignment Algorithm
 *
 * Steps:
 *  1. Duplicate Assignment Guard: Reject duplicate assignment if report already has an active assignment.
 *  2. Zone Recognition Check: Check if zone exists in known laboratory zones; flag unknown zones.
 *  3. Routing Table Lookup: Exact match (category, zone) -> fallback wildcard (category, '*').
 *  4. Primary Handler Check: Verify availability === true and currentLoad < maxCapacity.
 *  5. Backup Handler Fallback: If primary is unavailable/full/excluded, evaluate backup handler.
 *  6. Queueing & Critical Escalation: If no handler can accept, place in Queued state and escalate Critical reports.
 */
export function evaluateSmartRouting(input: RoutingInput): RoutingDecision {
  const trace: RoutingTraceStep[] = [];
  let stepCounter = 1;
  const excluded = new Set(input.excludedHandlerIds ?? []);

  // 1. Duplicate prevention check
  const existingForReport = (input.existingActiveAssignmentHandlerIds ?? []).find(
    (a) => a.reportId === input.reportId
  );
  if (existingForReport) {
    trace.push({
      step: stepCounter++,
      stage: 'Duplicate Prevention Guard',
      outcome: 'blocked',
      detail: `Report ${input.reportId} already holds an active assignment to Handler #${existingForReport.handlerId}. Duplicate assignment blocked.`,
    });
    return {
      assignedHandlerId: existingForReport.handlerId,
      assignedHandlerName:
        input.handlers.find((h) => h.id === existingForReport.handlerId)?.name ?? null,
      assignmentType: 'manual',
      status: 'Assigned',
      unknownZone: false,
      duplicateBlocked: true,
      escalate: false,
      escalationReason: null,
      explanation: `Duplicate assignment prevented: ${input.reportId} is already assigned to Handler #${existingForReport.handlerId}.`,
      trace,
    };
  }

  trace.push({
    step: stepCounter++,
    stage: 'Duplicate Prevention Guard',
    outcome: 'pass',
    detail: `No active assignment exists for ${input.reportId}. Proceeding to zone & routing evaluation.`,
  });

  // 2. Zone verification
  const normalizedZone = (input.zone || '').trim().toUpperCase();
  const isKnownZone = input.knownZones.map((z) => z.toUpperCase()).includes(normalizedZone);

  if (!isKnownZone) {
    trace.push({
      step: stepCounter++,
      stage: 'Laboratory Zone Lookup',
      outcome: 'fallback',
      detail: `Zone "${input.zone}" is not registered in active laboratory zones [${input.knownZones.join(', ')}]. Searching wildcard fallback rules.`,
    });
  } else {
    trace.push({
      step: stepCounter++,
      stage: 'Laboratory Zone Lookup',
      outcome: 'pass',
      detail: `Verified laboratory zone "${normalizedZone}".`,
    });
  }

  // 3. Routing rule match: exact (category, zone) then wildcard (category, '*')
  const activeRules = input.routingRules.filter((r) => r.isActive);
  const exactRule = activeRules.find(
    (r) => r.category === input.category && r.zone.toUpperCase() === normalizedZone
  );
  const wildcardRule = !exactRule
    ? activeRules.find((r) => r.category === input.category && r.zone === '*')
    : undefined;
  const matchedRule = exactRule ?? wildcardRule;

  if (!matchedRule) {
    const escalate = input.priority === 'Critical' || !isKnownZone;
    const escalationReason = !isKnownZone
      ? `Unknown laboratory zone "${input.zone}" with no fallback routing rule for ${input.category}.`
      : `Unassigned Critical report (${input.category} in ${normalizedZone}) — no routing rule configured.`;

    trace.push({
      step: stepCounter++,
      stage: 'Routing Table Lookup',
      outcome: 'blocked',
      detail: `No active routing rule matched (${input.category}, ${normalizedZone}) or fallback (${input.category}, *).`,
    });
    trace.push({
      step: stepCounter++,
      stage: escalate ? 'Queue & Escalation' : 'Queue Placement',
      outcome: escalate ? 'escalate' : 'fallback',
      detail: escalate
        ? `Placed in Queued state and raised ${input.priority} escalation: ${escalationReason}`
        : `Placed in deterministic priority queue awaiting manual administrator dispatch.`,
    });

    return {
      assignedHandlerId: null,
      assignedHandlerName: null,
      assignmentType: 'queued',
      status: 'Queued',
      unknownZone: !isKnownZone,
      duplicateBlocked: false,
      escalate,
      escalationReason: escalate ? escalationReason : null,
      explanation: !isKnownZone
        ? `Unknown zone "${input.zone}" has no routing rule for ${input.category}; queued and escalated for manual dispatch.`
        : `No routing rule found for (${input.category}, ${normalizedZone}); placed in priority queue.`,
      trace,
    };
  }

  trace.push({
    step: stepCounter++,
    stage: 'Routing Table Lookup',
    outcome: exactRule ? 'pass' : 'fallback',
    detail: exactRule
      ? `Matched exact routing rule #${matchedRule.id} for (${input.category}, ${normalizedZone}).`
      : `No exact rule for (${input.category}, ${normalizedZone}); matched wildcard fallback rule #${matchedRule.id} for (${input.category}, *).`,
  });

  // 4. Primary handler evaluation
  const primary = input.handlers.find((h) => h.id === matchedRule.primaryHandlerId);
  if (primary) {
    const isExcluded = excluded.has(primary.id);
    const hasCapacity = primary.currentLoad < primary.maxCapacity;
    if (!isExcluded && primary.isAvailable && hasCapacity) {
      trace.push({
        step: stepCounter++,
        stage: 'Primary Handler Evaluation',
        outcome: 'pass',
        detail: `Primary handler ${primary.name} is available (load ${primary.currentLoad}/${primary.maxCapacity}). Assigned as primary.`,
      });
      return {
        assignedHandlerId: primary.id,
        assignedHandlerName: primary.name,
        assignmentType: 'primary',
        status: 'Assigned',
        unknownZone: !isKnownZone,
        duplicateBlocked: false,
        escalate: false,
        escalationReason: null,
        explanation: `${!isKnownZone ? `Unknown zone "${input.zone}" routed via wildcard rule. ` : ''}Assigned to primary handler ${primary.name} (load ${primary.currentLoad}/${primary.maxCapacity}) for ${input.category}.`,
        trace,
      };
    }

    const reasonText = isExcluded
      ? 'previously rejected/excluded for this report'
      : !primary.isAvailable
      ? 'marked unavailable'
      : `at full capacity (${primary.currentLoad}/${primary.maxCapacity})`;
    trace.push({
      step: stepCounter++,
      stage: 'Primary Handler Evaluation',
      outcome: 'fallback',
      detail: `Primary handler ${primary.name} cannot accept: ${reasonText}. Evaluating backup handler.`,
    });
  } else {
    trace.push({
      step: stepCounter++,
      stage: 'Primary Handler Evaluation',
      outcome: 'fallback',
      detail: `Primary handler #${matchedRule.primaryHandlerId} not found. Evaluating backup handler.`,
    });
  }

  // 5. Backup handler evaluation
  const backup = matchedRule.backupHandlerId
    ? input.handlers.find((h) => h.id === matchedRule.backupHandlerId)
    : undefined;

  if (backup) {
    const isExcluded = excluded.has(backup.id);
    const hasCapacity = backup.currentLoad < backup.maxCapacity;
    if (!isExcluded && backup.isAvailable && hasCapacity) {
      trace.push({
        step: stepCounter++,
        stage: 'Backup Handler Fallback',
        outcome: 'pass',
        detail: `Backup handler ${backup.name} is available (load ${backup.currentLoad}/${backup.maxCapacity}). Assigned via fallback.`,
      });
      return {
        assignedHandlerId: backup.id,
        assignedHandlerName: backup.name,
        assignmentType: 'backup',
        status: 'Assigned',
        unknownZone: !isKnownZone,
        duplicateBlocked: false,
        escalate: false,
        escalationReason: null,
        explanation: `Primary handler ${primary?.name ?? 'N/A'} was unavailable or at capacity; assigned to backup handler ${backup.name} (load ${backup.currentLoad}/${backup.maxCapacity}).`,
        trace,
      };
    }

    const reasonText = isExcluded
      ? 'excluded for this report'
      : !backup.isAvailable
      ? 'marked unavailable'
      : `at full capacity (${backup.currentLoad}/${backup.maxCapacity})`;
    trace.push({
      step: stepCounter++,
      stage: 'Backup Handler Fallback',
      outcome: 'blocked',
      detail: `Backup handler ${backup.name} also cannot accept: ${reasonText}.`,
    });
  } else {
    trace.push({
      step: stepCounter++,
      stage: 'Backup Handler Fallback',
      outcome: 'blocked',
      detail: `No backup handler configured on rule #${matchedRule.id}.`,
    });
  }

  // 6. Queue & Escalate if Critical (or Unknown zone)
  const shouldEscalate = input.priority === 'Critical';
  const escalationReason = shouldEscalate
    ? `Unassigned Critical report (${input.category} in ${input.zone}): both primary and backup handlers unavailable or at capacity.`
    : null;

  trace.push({
    step: stepCounter++,
    stage: shouldEscalate ? 'Queue & Critical Escalation' : 'Deterministic Queueing',
    outcome: shouldEscalate ? 'escalate' : 'fallback',
    detail: shouldEscalate
      ? `Report queued and Critical SLA escalation opened immediately.`
      : `Report placed in priority queue until a qualified handler frees capacity.`,
  });

  return {
    assignedHandlerId: null,
    assignedHandlerName: null,
    assignmentType: 'queued',
    status: 'Queued',
    unknownZone: !isKnownZone,
    duplicateBlocked: false,
    escalate: shouldEscalate,
    escalationReason,
    explanation: `All configured handlers for (${input.category}, ${input.zone}) are unavailable or at capacity; report placed in priority queue${shouldEscalate ? ' and escalated as Critical' : ''}.`,
    trace,
  };
}
