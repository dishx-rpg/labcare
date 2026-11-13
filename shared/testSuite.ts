import { classifyFaultDescription } from './classifier.ts';
import { validateEquipmentId } from './dfa.ts';
import { determinePriority } from './priority.ts';
import { compareQueueReports } from './queue.ts';
import { evaluateSmartRouting } from './routing.ts';
import type { HandlerProfile, RoutingRule, VerificationTestResult } from './types.ts';

function runCase(
  id: string,
  name: string,
  suite: VerificationTestResult['suite'],
  fn: () => { expected: string; actual: string; passed: boolean }
): VerificationTestResult {
  const start = performance.now();
  try {
    const res = fn();
    return {
      id,
      name,
      suite,
      expected: res.expected,
      actual: res.actual,
      passed: res.passed,
      durationMs: Number((performance.now() - start).toFixed(3)),
    };
  } catch (err) {
    return {
      id,
      name,
      suite,
      expected: 'No runtime error',
      actual: err instanceof Error ? err.message : String(err),
      passed: false,
      durationMs: Number((performance.now() - start).toFixed(3)),
    };
  }
}

export function runVerificationSuite(): VerificationTestResult[] {
  const sampleHandlers: HandlerProfile[] = [
    {
      id: 1,
      userId: 2,
      name: 'Marcus Chen',
      email: 'handler@labcare.edu',
      specialtyCategory: 'Electrical',
      primaryZone: 'CH',
      isAvailable: true,
      maxCapacity: 4,
      currentLoad: 1,
      phoneExt: '4102',
    },
    {
      id: 2,
      userId: 3,
      name: 'Priya Nair',
      email: 'handler.mech@labcare.edu',
      specialtyCategory: 'Mechanical',
      primaryZone: 'BI',
      isAvailable: true,
      maxCapacity: 4,
      currentLoad: 2,
      phoneExt: '4108',
    },
  ];

  const sampleRules: RoutingRule[] = [
    {
      id: 1,
      category: 'Electrical',
      zone: 'CH',
      primaryHandlerId: 1,
      backupHandlerId: 2,
      isActive: true,
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 2,
      category: 'Mechanical',
      zone: '*',
      primaryHandlerId: 2,
      backupHandlerId: 1,
      isActive: true,
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  return [
    runCase('T01', 'DFA accepts valid standard Equipment ID (LAB-CH-SPK-042)', 'DFA & Regex', () => {
      const r = validateEquipmentId('LAB-CH-SPK-042');
      return {
        expected: 'valid=true, finalState=q14, agreement=true',
        actual: `valid=${r.valid}, finalState=${r.dfa.finalState}, agreement=${r.agreement}`,
        passed: r.valid && r.dfa.finalState === 'q14' && r.agreement,
      };
    }),

    runCase('T02', 'DFA accepts boundary Equipment ID (LAB-CR-CRY-999)', 'DFA & Regex', () => {
      const r = validateEquipmentId('LAB-CR-CRY-999');
      return {
        expected: 'valid=true, finalState=q14',
        actual: `valid=${r.valid}, finalState=${r.dfa.finalState}`,
        passed: r.valid && r.dfa.finalState === 'q14' && r.agreement,
      };
    }),

    runCase('T03', 'DFA rejects lowercase zone letters (LAB-ch-SPK-042)', 'DFA & Regex', () => {
      const r = validateEquipmentId('LAB-ch-SPK-042');
      return {
        expected: 'valid=false, finalState=q_dead, rejectedAtIndex=4',
        actual: `valid=${r.valid}, finalState=${r.dfa.finalState}, rejectedAtIndex=${r.dfa.rejectedAtIndex}`,
        passed: !r.valid && r.dfa.finalState === 'q_dead' && r.dfa.rejectedAtIndex === 4 && r.agreement,
      };
    }),

    runCase('T04', 'DFA rejects invalid prefix (EQP-CH-SPK-042)', 'DFA & Regex', () => {
      const r = validateEquipmentId('EQP-CH-SPK-042');
      return {
        expected: 'valid=false, rejectedAtIndex=0',
        actual: `valid=${r.valid}, rejectedAtIndex=${r.dfa.rejectedAtIndex}`,
        passed: !r.valid && r.dfa.rejectedAtIndex === 0 && r.agreement,
      };
    }),

    runCase('T05', 'DFA rejects premature termination (LAB-CH-SPK-42)', 'DFA & Regex', () => {
      const r = validateEquipmentId('LAB-CH-SPK-42');
      return {
        expected: 'valid=false, finalState=q13 (non-accepting)',
        actual: `valid=${r.valid}, finalState=${r.dfa.finalState}`,
        passed: !r.valid && r.dfa.finalState === 'q13' && r.agreement,
      };
    }),

    runCase('T06', 'DFA rejects trailing extra digit (LAB-CH-SPK-0421)', 'DFA & Regex', () => {
      const r = validateEquipmentId('LAB-CH-SPK-0421');
      return {
        expected: 'valid=false, finalState=q_dead, rejectedAtIndex=14',
        actual: `valid=${r.valid}, finalState=${r.dfa.finalState}, rejectedAtIndex=${r.dfa.rejectedAtIndex}`,
        passed: !r.valid && r.dfa.finalState === 'q_dead' && r.dfa.rejectedAtIndex === 14 && r.agreement,
      };
    }),

    runCase('T07', 'DFA and Regex maintain 100% parity across 10 mixed inputs', 'DFA & Regex', () => {
      const corpus = [
        'LAB-BI-PCR-001',
        'LAB-PH-LAS-500',
        'LAB-CH-SPK-042',
        '',
        'LAB-12-SPK-042',
        'LAB-CH-123-042',
        'LAB-CH-SPK-ABC',
        'LAB_CH_SPK_042',
        'lab-ch-spk-042',
        'LAB-EL-OSC-000',
      ];
      const allAgree = corpus.every((s) => validateEquipmentId(s).agreement);
      return {
        expected: 'agreement=true on all 10 strings',
        actual: `allAgree=${allAgree}`,
        passed: allAgree,
      };
    }),

    runCase('T08', 'Classifier detects Electrical fault keywords', 'Classification', () => {
      const c = classifyFaultDescription('Main breaker tripped after power supply voltage surge.');
      return {
        expected: 'category=Electrical',
        actual: `category=${c.category} (${c.matchedKeywords.join(', ')})`,
        passed: c.category === 'Electrical' && c.matchedKeywords.includes('voltage'),
      };
    }),

    runCase('T09', 'Classifier detects Mechanical fault keywords', 'Classification', () => {
      const c = classifyFaultDescription('Centrifuge rotor bearing has severe vibration and door latch jam.');
      return {
        expected: 'category=Mechanical',
        actual: `category=${c.category} (${c.matchedKeywords.join(', ')})`,
        passed: c.category === 'Mechanical' && c.matchedKeywords.includes('rotor'),
      };
    }),

    runCase('T10', 'Classifier detects Software fault keywords', 'Classification', () => {
      const c = classifyFaultDescription('Control firmware crash during boot with error code 502.');
      return {
        expected: 'category=Software',
        actual: `category=${c.category} (${c.matchedKeywords.join(', ')})`,
        passed: c.category === 'Software' && c.matchedKeywords.includes('firmware'),
      };
    }),

    runCase('T11', 'Classifier detects Network/Connectivity fault keywords', 'Classification', () => {
      const c = classifyFaultDescription('Instrument ethernet link showing packet loss and DNS disconnect.');
      return {
        expected: 'category=Network/Connectivity',
        actual: `category=${c.category} (${c.matchedKeywords.join(', ')})`,
        passed: c.category === 'Network/Connectivity' && c.matchedKeywords.includes('ethernet'),
      };
    }),

    runCase('T12', 'Classifier defaults to Other when no domain keywords match', 'Classification', () => {
      const c = classifyFaultDescription('Bench surface drawer shelf needs cleaning and label replacement.');
      return {
        expected: 'category=Other',
        actual: `category=${c.category}`,
        passed: c.category === 'Other' && c.matchedKeywords.length === 0,
      };
    }),

    runCase('T13', 'Classifier deterministic conflict resolution (Electrical > Mechanical on score tie)', 'Classification', () => {
      // 'voltage' (weight 2) vs 'bearing' (weight 2) => tie broken to Electrical
      const c = classifyFaultDescription('Observed abnormal voltage reading near bearing assembly.');
      return {
        expected: 'category=Electrical, tieBroken=true',
        actual: `category=${c.category}, tieBroken=${c.tieBroken}`,
        passed: c.category === 'Electrical' && c.tieBroken === true,
      };
    }),

    runCase('T14', 'Priority critical hazard override elevates Low urgency on smoke/sparks', 'Priority', () => {
      const p = determinePriority('Low', 'Detected smoke and sparks coming from rear chassis.');
      return {
        expected: 'priority=Critical, hazardDetected=true',
        actual: `priority=${p.priority}, hazardDetected=${p.hazardDetected}`,
        passed: p.priority === 'Critical' && p.hazardDetected,
      };
    }),

    runCase('T15', 'Priority operational impact elevates Low urgency to High on complete failure', 'Priority', () => {
      const p = determinePriority('Low', 'Spectrometer cannot boot after routine overnight cycle.');
      return {
        expected: 'priority=High',
        actual: `priority=${p.priority}`,
        passed: p.priority === 'High' && !p.hazardDetected,
      };
    }),

    runCase('T16', 'Deterministic priority queue orders Critical > High > Medium > Low with timestamp & ID tie-breaks', 'Priority Queue', () => {
      const items = [
        { id: 'RPT-2026-0005', priority: 'Medium' as const, submittedAt: '2026-11-10T10:00:00Z' },
        { id: 'RPT-2026-0002', priority: 'High' as const, submittedAt: '2026-11-10T09:00:00Z' },
        { id: 'RPT-2026-0001', priority: 'High' as const, submittedAt: '2026-11-10T09:00:00Z' },
        { id: 'RPT-2026-0004', priority: 'Critical' as const, submittedAt: '2026-11-10T11:00:00Z' },
        { id: 'RPT-2026-0003', priority: 'Low' as const, submittedAt: '2026-11-10T08:00:00Z' },
      ];
      const sortedIds = [...items].sort(compareQueueReports).map((x) => x.id);
      const expectedOrder = ['RPT-2026-0004', 'RPT-2026-0001', 'RPT-2026-0002', 'RPT-2026-0005', 'RPT-2026-0003'];
      return {
        expected: expectedOrder.join(' -> '),
        actual: sortedIds.join(' -> '),
        passed: JSON.stringify(sortedIds) === JSON.stringify(expectedOrder),
      };
    }),

    runCase('T17', 'Smart routing assigns available Primary handler with capacity', 'Smart Routing', () => {
      const d = evaluateSmartRouting({
        reportId: 'RPT-TEST-101',
        category: 'Electrical',
        zone: 'CH',
        priority: 'High',
        knownZones: ['CH', 'BI'],
        routingRules: sampleRules,
        handlers: sampleHandlers,
      });
      return {
        expected: 'assignedHandlerId=1, assignmentType=primary, status=Assigned',
        actual: `assignedHandlerId=${d.assignedHandlerId}, assignmentType=${d.assignmentType}, status=${d.status}`,
        passed: d.assignedHandlerId === 1 && d.assignmentType === 'primary' && d.status === 'Assigned',
      };
    }),

    runCase('T18', 'Smart routing falls back to Backup handler when Primary is unavailable or full', 'Smart Routing', () => {
      const busyHandlers = sampleHandlers.map((h) => (h.id === 1 ? { ...h, isAvailable: false } : h));
      const d = evaluateSmartRouting({
        reportId: 'RPT-TEST-102',
        category: 'Electrical',
        zone: 'CH',
        priority: 'Medium',
        knownZones: ['CH', 'BI'],
        routingRules: sampleRules,
        handlers: busyHandlers,
      });
      return {
        expected: 'assignedHandlerId=2, assignmentType=backup, status=Assigned',
        actual: `assignedHandlerId=${d.assignedHandlerId}, assignmentType=${d.assignmentType}, status=${d.status}`,
        passed: d.assignedHandlerId === 2 && d.assignmentType === 'backup' && d.status === 'Assigned',
      };
    }),

    runCase('T19', 'Smart routing queues and escalates Critical report when all handlers at capacity', 'Smart Routing', () => {
      const fullHandlers = sampleHandlers.map((h) => ({ ...h, currentLoad: h.maxCapacity }));
      const d = evaluateSmartRouting({
        reportId: 'RPT-TEST-103',
        category: 'Electrical',
        zone: 'CH',
        priority: 'Critical',
        knownZones: ['CH', 'BI'],
        routingRules: sampleRules,
        handlers: fullHandlers,
      });
      return {
        expected: 'status=Queued, assignedHandlerId=null, escalate=true',
        actual: `status=${d.status}, assignedHandlerId=${d.assignedHandlerId}, escalate=${d.escalate}`,
        passed: d.status === 'Queued' && d.assignedHandlerId === null && d.escalate === true,
      };
    }),

    runCase('T20', 'Smart routing handles unknown zone & prevents duplicate assignment', 'Concurrency & Integrity', () => {
      const unknownRes = evaluateSmartRouting({
        reportId: 'RPT-TEST-104',
        category: 'Software',
        zone: 'ZZ',
        priority: 'Medium',
        knownZones: ['CH', 'BI'],
        routingRules: sampleRules,
        handlers: sampleHandlers,
      });
      const dupRes = evaluateSmartRouting({
        reportId: 'RPT-TEST-105',
        category: 'Electrical',
        zone: 'CH',
        priority: 'High',
        knownZones: ['CH', 'BI'],
        routingRules: sampleRules,
        handlers: sampleHandlers,
        existingActiveAssignmentHandlerIds: [{ reportId: 'RPT-TEST-105', handlerId: 1 }],
      });
      return {
        expected: 'unknownZone=true & status=Queued; duplicateBlocked=true',
        actual: `unknownZone=${unknownRes.unknownZone}, status=${unknownRes.status}; duplicateBlocked=${dupRes.duplicateBlocked}`,
        passed: unknownRes.unknownZone && unknownRes.status === 'Queued' && dupRes.duplicateBlocked,
      };
    }),
  ];
}
