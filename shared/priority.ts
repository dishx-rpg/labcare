import type { PriorityLevel } from './types.ts';

/**
 * Deterministic Priority Determination Engine
 *
 * Levels: Critical, High, Medium, Low
 *
 * Rule 1 (Safety Override): Any hazardous safety trigger in the fault description
 *   immediately overrides user-selected urgency and assigns Critical priority.
 * Rule 2 (Operational Impact Escalation): Complete failure / sample loss / offline
 *   with Medium or Low urgency elevates priority by one tier (up to High).
 * Rule 3 (Standard Urgency): Uses reporter-selected urgency when no override applies.
 */

export const PRIORITY_RANK: Record<PriorityLevel, number> = {
  Critical: 1,
  High: 2,
  Medium: 3,
  Low: 4,
};

const CRITICAL_HAZARD_TRIGGERS = [
  'fire',
  'smoke',
  'spark',
  'sparks',
  'arc flash',
  'gas leak',
  'toxic',
  'chemical spill',
  'radiation',
  'explosion',
  'electric shock',
  'biohazard',
  'cryogenic leak',
  'burning',
  'uncontrolled pressure',
  'bio-containment',
];

const HIGH_IMPACT_TRIGGERS = [
  'complete failure',
  'cannot boot',
  'sample loss',
  'production halt',
  'system down',
  'leaking',
  'total outage',
  'unresponsive',
];

export interface PriorityResult {
  priority: PriorityLevel;
  reason: string;
  hazardDetected: boolean;
  triggerKeywords: string[];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function determinePriority(
  urgency: PriorityLevel,
  description: string
): PriorityResult {
  const lowerDesc = (description || '').toLowerCase();

  const hazardMatches = CRITICAL_HAZARD_TRIGGERS.filter((kw) =>
    new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i').test(lowerDesc)
  );

  if (hazardMatches.length > 0) {
    return {
      priority: 'Critical',
      hazardDetected: true,
      triggerKeywords: hazardMatches,
      reason: `Hazardous safety override triggered by [${hazardMatches.join(', ')}]: escalated to Critical priority regardless of stated urgency (${urgency}).`,
    };
  }

  if (urgency === 'Critical') {
    return {
      priority: 'Critical',
      hazardDetected: false,
      triggerKeywords: [],
      reason: 'Assigned Critical based on reporter-declared Critical urgency.',
    };
  }

  const highMatches = HIGH_IMPACT_TRIGGERS.filter((kw) =>
    new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i').test(lowerDesc)
  );

  if (highMatches.length > 0 && (urgency === 'Medium' || urgency === 'Low')) {
    return {
      priority: 'High',
      hazardDetected: false,
      triggerKeywords: highMatches,
      reason: `Elevated from ${urgency} to High due to severe operational impact indicator [${highMatches.join(', ')}].`,
    };
  }

  return {
    priority: urgency,
    hazardDetected: false,
    triggerKeywords: [],
    reason: `Assigned ${urgency} priority matching reporter-declared urgency with no hazardous override triggers.`,
  };
}
