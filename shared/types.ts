export type UserRole = 'Reporter' | 'Handler' | 'Administrator';

export type FaultCategory =
  | 'Electrical'
  | 'Mechanical'
  | 'Software'
  | 'Network/Connectivity'
  | 'Other';

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export type ReportStatus =
  | 'Submitted'
  | 'Queued'
  | 'Assigned'
  | 'Accepted'
  | 'In Progress'
  | 'Resolved'
  | 'Rejected';

export type AssignmentType = 'primary' | 'backup' | 'manual' | 'queued';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  createdAt: string;
}

export interface Zone {
  id: number;
  code: string;
  name: string;
  building: string;
  floor: string;
  description: string;
}

export interface CategoryConfig {
  id: number;
  name: FaultCategory;
  description: string;
  defaultSlaHours: number;
}

export interface HandlerProfile {
  id: number;
  userId: number;
  name: string;
  email: string;
  specialtyCategory: FaultCategory;
  primaryZone: string;
  isAvailable: boolean;
  maxCapacity: number;
  currentLoad: number;
  phoneExt: string;
}

export interface RoutingRule {
  id: number;
  category: FaultCategory;
  zone: string;
  primaryHandlerId: number;
  primaryHandlerName?: string;
  backupHandlerId: number | null;
  backupHandlerName?: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface RoutingTraceStep {
  step: number;
  stage: string;
  outcome: 'pass' | 'fallback' | 'blocked' | 'escalate' | 'info';
  detail: string;
}

export interface StatusHistoryEntry {
  id: number;
  reportId: string;
  status: ReportStatus;
  changedBy: string;
  note: string;
  createdAt: string;
}

export interface ResolutionNote {
  id: number;
  reportId: string;
  authorId: number;
  authorName: string;
  note: string;
  createdAt: string;
}

export interface EscalationRecord {
  id: number;
  reportId: string;
  reason: string;
  severity: PriorityLevel;
  status: 'Open' | 'Acknowledged' | 'Resolved';
  createdAt: string;
  resolvedAt: string | null;
  equipmentName?: string;
  zone?: string;
  reportStatus?: ReportStatus;
}

export interface FaultReport {
  id: string;
  reporterId: number;
  reporterName: string;
  reporterEmail: string;
  department: string;
  equipmentName: string;
  equipmentId: string;
  equipmentCode: string;
  zone: string;
  description: string;
  urgency: PriorityLevel;
  predictedCategory: FaultCategory;
  finalCategory: FaultCategory;
  matchedKeywords: string[];
  classificationExplanation: string;
  priority: PriorityLevel;
  priorityReason: string;
  status: ReportStatus;
  assignedHandlerId: number | null;
  assignedHandlerName: string | null;
  assignmentType: AssignmentType;
  routingExplanation: string;
  routingTrace: RoutingTraceStep[];
  dfaValid: boolean;
  submittedAt: string;
  resolvedAt: string | null;
  history?: StatusHistoryEntry[];
  notes?: ResolutionNote[];
  escalations?: EscalationRecord[];
}

export interface QueueReportItem extends FaultReport {
  queueRank: number;
  queueReason: string;
  ageMinutes: number;
}

export interface VerificationTestResult {
  id: string;
  name: string;
  suite: 'DFA & Regex' | 'Classification' | 'Priority' | 'Smart Routing' | 'Priority Queue' | 'Concurrency & Integrity';
  expected: string;
  actual: string;
  passed: boolean;
  durationMs: number;
}
