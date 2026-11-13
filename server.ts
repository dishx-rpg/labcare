import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import {
  db,
  initDatabase,
  getHandlersWithLoad,
  getRoutingRulesList,
  generateNextReportId,
} from './server/db.ts';
import { validateEquipmentId } from './shared/dfa.ts';
import { classifyFaultDescription, FAULT_CATEGORIES } from './shared/classifier.ts';
import { determinePriority } from './shared/priority.ts';
import { buildDeterministicQueue } from './shared/queue.ts';
import { evaluateSmartRouting } from './shared/routing.ts';
import { runVerificationSuite } from './shared/testSuite.ts';
import type {
  FaultCategory,
  FaultReport,
  HandlerProfile,
  PriorityLevel,
  ReportStatus,
  RoutingRule,
  UserRole,
} from './shared/types.ts';

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'labcare-academic-dev-jwt-secret-key-2026';

initDatabase();

const app = express();
app.use(express.json({ limit: '1mb' }));

interface AuthPayload {
  userId: number;
  email: string;
  name: string;
  role: UserRole;
  department: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

function mapReportRow(row: any): FaultReport {
  let matchedKeywords: string[] = [];
  let routingTrace: any[] = [];
  try {
    matchedKeywords = JSON.parse(row.matched_keywords || '[]');
  } catch {
    matchedKeywords = [];
  }
  try {
    routingTrace = JSON.parse(row.routing_trace_json || '[]');
  } catch {
    routingTrace = [];
  }

  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    reporterEmail: row.reporter_email,
    department: row.department,
    equipmentName: row.equipment_name,
    equipmentId: row.equipment_id,
    equipmentCode: row.equipment_code,
    zone: row.zone,
    description: row.description,
    urgency: row.urgency as PriorityLevel,
    predictedCategory: row.predicted_category as FaultCategory,
    finalCategory: row.final_category as FaultCategory,
    matchedKeywords,
    classificationExplanation: row.classification_explanation,
    priority: row.priority as PriorityLevel,
    priorityReason: row.priority_reason,
    status: row.status as ReportStatus,
    assignedHandlerId: row.assigned_handler_id ?? null,
    assignedHandlerName: row.assigned_handler_name ?? null,
    assignmentType: row.assignment_type,
    routingExplanation: row.routing_explanation,
    routingTrace,
    dfaValid: Boolean(row.dfa_valid),
    submittedAt: row.submitted_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

function fetchReportsWithDetails(whereSql = '', params: any[] = []): FaultReport[] {
  const rows = db
    .prepare(
      `
    SELECT r.*, u.name as assigned_handler_name
    FROM reports r
    LEFT JOIN handlers h ON h.id = r.assigned_handler_id
    LEFT JOIN users u ON u.id = h.user_id
    ${whereSql}
    ORDER BY r.submitted_at DESC
  `
    )
    .all(...params);

  return rows.map(mapReportRow);
}

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

app.post('/api/auth/register', (req: Request, res: Response) => {
  const { name, email, password, role, department } = req.body ?? {};
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  const allowedRole: UserRole =
    role === 'Handler' || role === 'Administrator' ? role : 'Reporter';
  const dept = typeof department === 'string' && department.trim() ? department.trim() : 'General Research';

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  const createAccountTx = db.transaction(() => {
    const info = db
      .prepare(
        'INSERT INTO users (name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(name.trim(), normalizedEmail, hash, allowedRole, dept, now);

    const userId = Number(info.lastInsertRowid);
    if (allowedRole === 'Handler') {
      db.prepare(
        'INSERT INTO handlers (user_id, specialty_category, primary_zone, is_available, max_capacity, current_load, phone_ext) VALUES (?, ?, ?, 1, 4, 0, ?)'
      ).run(userId, 'Other', 'CH', '4199');
    }
    return userId;
  });

  const userId = createAccountTx();
  const payload: AuthPayload = {
    userId,
    email: normalizedEmail,
    name: name.trim(),
    role: allowedRole,
    department: dept,
  };
  const token = signToken(payload);

  res.status(201).json({
    token,
    user: {
      id: userId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      department: payload.department,
      createdAt: now,
    },
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db
    .prepare('SELECT id, name, email, password_hash, role, department, created_at FROM users WHERE email = ?')
    .get(String(email).trim().toLowerCase()) as any;

  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const payload: AuthPayload = {
    userId: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    department: row.department,
  };
  const token = signToken(payload);

  res.json({
    token,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department,
      createdAt: row.created_at,
    },
  });
});

app.get('/api/auth/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const row = db
    .prepare('SELECT id, name, email, role, department, created_at as createdAt FROM users WHERE id = ?')
    .get(req.user!.userId);
  if (!row) {
    res.status(404).json({ error: 'User account no longer exists.' });
    return;
  }
  res.json({ user: row });
});

// ============================================================================
// ALGORITHM PREVIEW ENDPOINTS (DFA + CLASSIFICATION + PRIORITY)
// ============================================================================

app.post('/api/validate-id', (req: Request, res: Response) => {
  const { equipmentId } = req.body ?? {};
  const result = validateEquipmentId(typeof equipmentId === 'string' ? equipmentId : '');
  res.json(result);
});

app.post('/api/classify-preview', (req: Request, res: Response) => {
  const { description, equipmentName, urgency } = req.body ?? {};
  const classification = classifyFaultDescription(
    typeof description === 'string' ? description : '',
    typeof equipmentName === 'string' ? equipmentName : ''
  );
  const validUrgency: PriorityLevel =
    urgency === 'Critical' || urgency === 'High' || urgency === 'Medium' || urgency === 'Low'
      ? urgency
      : 'Medium';
  const priority = determinePriority(
    validUrgency,
    typeof description === 'string' ? description : ''
  );
  res.json({ classification, priority });
});

// ============================================================================
// REPORTS & SMART DISPATCH ROUTES
// ============================================================================

app.get('/api/reports', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  let reports: FaultReport[] = [];

  if (user.role === 'Reporter') {
    reports = fetchReportsWithDetails('WHERE r.reporter_id = ?', [user.userId]);
  } else if (user.role === 'Handler') {
    const handler = db.prepare('SELECT id FROM handlers WHERE user_id = ?').get(user.userId) as
      | { id: number }
      | undefined;
    if (handler) {
      reports = fetchReportsWithDetails(
        'WHERE r.assigned_handler_id = ? OR r.status = ?',
        [handler.id, 'Queued']
      );
    } else {
      reports = [];
    }
  } else {
    reports = fetchReportsWithDetails();
  }

  res.json({ reports });
});

app.get('/api/reports/export/csv', authenticate, requireRoles('Administrator', 'Handler'), (req: AuthenticatedRequest, res: Response) => {
  const reports = fetchReportsWithDetails();
  const headers = [
    'Report ID',
    'Submitted At',
    'Reporter Name',
    'Reporter Email',
    'Department',
    'Equipment Name',
    'Equipment ID',
    'Equipment Code',
    'Zone',
    'Predicted Category',
    'Final Category',
    'Priority',
    'Status',
    'Assigned Handler',
    'Assignment Type',
    'Resolved At',
  ];

  const escapeCsv = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...reports.map((r) =>
      [
        r.id,
        r.submittedAt,
        r.reporterName,
        r.reporterEmail,
        r.department,
        r.equipmentName,
        r.equipmentId,
        r.equipmentCode,
        r.zone,
        r.predictedCategory,
        r.finalCategory,
        r.priority,
        r.status,
        r.assignedHandlerName ?? 'Unassigned',
        r.assignmentType,
        r.resolvedAt ?? '',
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="labcare_fault_reports.csv"');
  res.send(lines.join('\n'));
});

app.get('/api/reports/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const reportId = req.params.id;
  const list = fetchReportsWithDetails('WHERE r.id = ?', [reportId]);
  if (list.length === 0) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  const report = list[0];

  if (req.user!.role === 'Reporter' && report.reporterId !== req.user!.userId) {
    res.status(403).json({ error: 'You do not have permission to view another reporter’s ticket.' });
    return;
  }

  const history = db
    .prepare(
      'SELECT id, report_id as reportId, status, changed_by as changedBy, note, created_at as createdAt FROM status_history WHERE report_id = ? ORDER BY id ASC'
    )
    .all(reportId);

  const notes = db
    .prepare(
      'SELECT id, report_id as reportId, author_id as authorId, author_name as authorName, note, created_at as createdAt FROM resolution_notes WHERE report_id = ? ORDER BY id ASC'
    )
    .all(reportId);

  const escalations = db
    .prepare(
      'SELECT id, report_id as reportId, reason, severity, status, created_at as createdAt, resolved_at as resolvedAt FROM escalations WHERE report_id = ? ORDER BY id ASC'
    )
    .all(reportId);

  res.json({
    report: {
      ...report,
      history,
      notes,
      escalations,
    },
  });
});

app.post('/api/reports', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const {
    reporterName,
    reporterEmail,
    department,
    equipmentName,
    equipmentId,
    equipmentCode,
    zone,
    description,
    urgency,
    submittedAt,
  } = req.body ?? {};

  if (!reporterName || !reporterEmail || !department || !equipmentName || !equipmentId || !equipmentCode || !zone || !description) {
    res.status(400).json({ error: 'All fault report fields are required.' });
    return;
  }

  const idValidation = validateEquipmentId(String(equipmentId).trim());
  if (!idValidation.valid) {
    res.status(400).json({
      error: `Invalid Equipment ID: ${idValidation.explanation}`,
      validation: idValidation,
    });
    return;
  }

  const validUrgency: PriorityLevel =
    urgency === 'Critical' || urgency === 'High' || urgency === 'Medium' || urgency === 'Low'
      ? urgency
      : 'Medium';

  const timestamp =
    typeof submittedAt === 'string' && !Number.isNaN(Date.parse(submittedAt))
      ? new Date(submittedAt).toISOString()
      : new Date().toISOString();

  const classification = classifyFaultDescription(String(description), String(equipmentName));
  const priorityRes = determinePriority(validUrgency, String(description));

  // Transactional atomic dispatch prevents oversubscribing handlers or double-assigning under concurrent submissions
  const submitTransaction = db.transaction(() => {
    const reportId = generateNextReportId();
    const knownZones = (db.prepare('SELECT code FROM zones').all() as Array<{ code: string }>).map(
      (z) => z.code
    );
    const rules = getRoutingRulesList();
    const handlers = getHandlersWithLoad();
    const activeAssignments = db
      .prepare("SELECT report_id as reportId, handler_id as handlerId FROM assignments WHERE status IN ('Pending', 'Accepted')")
      .all() as Array<{ reportId: string; handlerId: number }>;

    const decision = evaluateSmartRouting({
      reportId,
      category: classification.category,
      zone: String(zone).trim().toUpperCase(),
      priority: priorityRes.priority,
      knownZones,
      routingRules: rules,
      handlers,
      existingActiveAssignmentHandlerIds: activeAssignments,
    });

    db.prepare(
      `
      INSERT INTO reports (
        id, reporter_id, reporter_name, reporter_email, department,
        equipment_name, equipment_id, equipment_code, zone, description, urgency,
        predicted_category, final_category, matched_keywords, classification_explanation,
        priority, priority_reason, status, assigned_handler_id, assignment_type,
        routing_explanation, routing_trace_json, dfa_valid, submitted_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)
    `
    ).run(
      reportId,
      req.user!.userId,
      String(reporterName).trim(),
      String(reporterEmail).trim(),
      String(department).trim(),
      String(equipmentName).trim(),
      idValidation.input,
      String(equipmentCode).trim(),
      String(zone).trim().toUpperCase(),
      String(description).trim(),
      validUrgency,
      classification.category,
      classification.category,
      JSON.stringify(classification.matchedKeywords),
      classification.explanation,
      priorityRes.priority,
      priorityRes.reason,
      decision.status,
      decision.assignedHandlerId,
      decision.assignmentType,
      decision.explanation,
      JSON.stringify(decision.trace),
      timestamp
    );

    db.prepare(
      'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(
      reportId,
      'Submitted',
      String(reporterName).trim(),
      `Submitted with validated Equipment ID ${idValidation.input}.`,
      timestamp
    );

    if (decision.assignedHandlerId) {
      db.prepare(
        'INSERT INTO assignments (report_id, handler_id, assignment_type, status, assigned_at) VALUES (?, ?, ?, ?, ?)'
      ).run(reportId, decision.assignedHandlerId, decision.assignmentType, 'Pending', timestamp);

      db.prepare('UPDATE handlers SET current_load = current_load + 1 WHERE id = ?').run(
        decision.assignedHandlerId
      );

      db.prepare(
        'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        reportId,
        'Assigned',
        'Smart Dispatch Engine',
        decision.explanation,
        timestamp
      );
    } else {
      db.prepare(
        'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(
        reportId,
        'Queued',
        'Smart Dispatch Engine',
        decision.explanation,
        timestamp
      );
    }

    if (decision.escalate && decision.escalationReason) {
      db.prepare(
        'INSERT INTO escalations (report_id, reason, severity, status, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(reportId, decision.escalationReason, priorityRes.priority, 'Open', timestamp);
    }

    return { reportId, decision };
  });

  const { reportId, decision } = submitTransaction();
  const created = fetchReportsWithDetails('WHERE r.id = ?', [reportId])[0];

  res.status(201).json({
    report: created,
    validation: idValidation,
    classification,
    priority: priorityRes,
    routingDecision: decision,
  });
});

app.patch(
  '/api/reports/:id/category',
  authenticate,
  requireRoles('Handler', 'Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const reportId = req.params.id;
    const { category, reason } = req.body ?? {};
    if (!FAULT_CATEGORIES.includes(category)) {
      res.status(400).json({ error: 'Invalid fault category.' });
      return;
    }

    const existing = db.prepare('SELECT id, final_category FROM reports WHERE id = ?').get(reportId) as any;
    if (!existing) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    const now = new Date().toISOString();
    const note =
      typeof reason === 'string' && reason.trim()
        ? `Category manually corrected from ${existing.final_category} to ${category}: ${reason.trim()}`
        : `Category manually corrected from ${existing.final_category} to ${category} by ${req.user!.name}.`;

    db.prepare('UPDATE reports SET final_category = ? WHERE id = ?').run(category, reportId);
    db.prepare(
      'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(reportId, 'Category Updated', req.user!.name, note, now);

    const updated = fetchReportsWithDetails('WHERE r.id = ?', [reportId])[0];
    res.json({ report: updated });
  }
);

app.post(
  '/api/reports/:id/respond',
  authenticate,
  requireRoles('Handler', 'Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const reportId = req.params.id;
    const { action, reason } = req.body ?? {};
    if (action !== 'accept' && action !== 'reject') {
      res.status(400).json({ error: "Action must be 'accept' or 'reject'." });
      return;
    }

    const now = new Date().toISOString();

    const respondTx = db.transaction(() => {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as any;
      if (!report) {
        return { error: 'Report not found.', status: 404 };
      }

      if (action === 'accept') {
        // If report was Queued and a handler claims it, assign them
        let handlerId = report.assigned_handler_id;
        if (!handlerId && req.user!.role === 'Handler') {
          const h = db.prepare('SELECT id FROM handlers WHERE user_id = ?').get(req.user!.userId) as
            | { id: number }
            | undefined;
          if (h) handlerId = h.id;
        }
        if (!handlerId) {
          return { error: 'No handler assigned to accept.', status: 400 };
        }

        db.prepare("UPDATE reports SET status = 'Accepted', assigned_handler_id = ? WHERE id = ?").run(
          handlerId,
          reportId
        );
        db.prepare(
          "UPDATE assignments SET status = 'Accepted', responded_at = ? WHERE report_id = ? AND handler_id = ? AND status = 'Pending'"
        ).run(now, reportId, handlerId);
        db.prepare(
          'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(reportId, 'Accepted', req.user!.name, 'Handler accepted fault assignment.', now);

        return { ok: true };
      }

      // Reject action requires a reason and triggers automatic reroute excluding rejecting handler
      const rejectReason =
        typeof reason === 'string' && reason.trim()
          ? reason.trim()
          : 'Handler declined assignment.';

      const currentHandlerId = report.assigned_handler_id;
      if (currentHandlerId) {
        db.prepare(
          "UPDATE assignments SET status = 'Rejected', rejection_reason = ?, responded_at = ? WHERE report_id = ? AND handler_id = ? AND status IN ('Pending', 'Accepted')"
        ).run(rejectReason, now, reportId, currentHandlerId);
        db.prepare('UPDATE handlers SET current_load = MAX(0, current_load - 1) WHERE id = ?').run(
          currentHandlerId
        );
      }

      db.prepare(
        'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(reportId, 'Rejected', req.user!.name, `Assignment rejected: ${rejectReason}`, now);

      const previouslyRejected = (
        db
          .prepare("SELECT handler_id FROM assignments WHERE report_id = ? AND status = 'Rejected'")
          .all(reportId) as Array<{ handler_id: number }>
      ).map((r) => r.handler_id);

      const knownZones = (db.prepare('SELECT code FROM zones').all() as Array<{ code: string }>).map(
        (z) => z.code
      );
      const rules = getRoutingRulesList();
      const handlers = getHandlersWithLoad();

      const reroute = evaluateSmartRouting({
        reportId,
        category: report.final_category as FaultCategory,
        zone: report.zone,
        priority: report.priority as PriorityLevel,
        knownZones,
        routingRules: rules,
        handlers,
        excludedHandlerIds: previouslyRejected,
      });

      db.prepare(
        'UPDATE reports SET status = ?, assigned_handler_id = ?, assignment_type = ?, routing_explanation = ?, routing_trace_json = ? WHERE id = ?'
      ).run(
        reroute.status,
        reroute.assignedHandlerId,
        reroute.assignmentType,
        reroute.explanation,
        JSON.stringify(reroute.trace),
        reportId
      );

      if (reroute.assignedHandlerId) {
        db.prepare(
          'INSERT INTO assignments (report_id, handler_id, assignment_type, status, assigned_at) VALUES (?, ?, ?, ?, ?)'
        ).run(reportId, reroute.assignedHandlerId, reroute.assignmentType, 'Pending', now);
        db.prepare('UPDATE handlers SET current_load = current_load + 1 WHERE id = ?').run(
          reroute.assignedHandlerId
        );
        db.prepare(
          'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(reportId, 'Assigned', 'Smart Dispatch Engine', `Auto-rerouted: ${reroute.explanation}`, now);
      } else {
        db.prepare(
          'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(reportId, 'Queued', 'Smart Dispatch Engine', reroute.explanation, now);

        if (reroute.escalate && reroute.escalationReason) {
          db.prepare(
            'INSERT INTO escalations (report_id, reason, severity, status, created_at) VALUES (?, ?, ?, ?, ?)'
          ).run(reportId, reroute.escalationReason, report.priority, 'Open', now);
        }
      }

      return { ok: true };
    });

    const outcome = respondTx();
    if ('error' in outcome) {
      res.status(outcome.status!).json({ error: outcome.error });
      return;
    }

    const updated = fetchReportsWithDetails('WHERE r.id = ?', [reportId])[0];
    res.json({ report: updated });
  }
);

app.patch(
  '/api/reports/:id/status',
  authenticate,
  requireRoles('Handler', 'Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const reportId = req.params.id;
    const { status, note } = req.body ?? {};
    const allowed: ReportStatus[] = ['Accepted', 'In Progress', 'Resolved', 'Queued', 'Assigned'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid status transition.' });
      return;
    }

    const now = new Date().toISOString();

    const updateTx = db.transaction(() => {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as any;
      if (!report) return null;

      const resolvedAt = status === 'Resolved' ? now : report.resolved_at;
      db.prepare('UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?').run(
        status,
        resolvedAt,
        reportId
      );

      if (status === 'Resolved') {
        if (report.assigned_handler_id) {
          db.prepare(
            "UPDATE assignments SET status = 'Completed', responded_at = COALESCE(responded_at, ?) WHERE report_id = ? AND handler_id = ?"
          ).run(now, reportId, report.assigned_handler_id);
          db.prepare('UPDATE handlers SET current_load = MAX(0, current_load - 1) WHERE id = ?').run(
            report.assigned_handler_id
          );
        }
        db.prepare(
          "UPDATE escalations SET status = 'Resolved', resolved_at = ? WHERE report_id = ? AND status != 'Resolved'"
        ).run(now, reportId);
      }

      const historyNote =
        typeof note === 'string' && note.trim()
          ? note.trim()
          : `Status updated to ${status} by ${req.user!.name}.`;

      db.prepare(
        'INSERT INTO status_history (report_id, status, changed_by, note, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(reportId, status, req.user!.name, historyNote, now);

      if (typeof note === 'string' && note.trim()) {
        db.prepare(
          'INSERT INTO resolution_notes (report_id, author_id, author_name, note, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(reportId, req.user!.userId, req.user!.name, note.trim(), now);
      }

      return true;
    });

    const ok = updateTx();
    if (!ok) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    const updated = fetchReportsWithDetails('WHERE r.id = ?', [reportId])[0];
    res.json({ report: updated });
  }
);

app.post(
  '/api/reports/:id/notes',
  authenticate,
  requireRoles('Handler', 'Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const reportId = req.params.id;
    const { note } = req.body ?? {};
    if (!note || typeof note !== 'string' || !note.trim()) {
      res.status(400).json({ error: 'Resolution note cannot be empty.' });
      return;
    }
    const existing = db.prepare('SELECT id FROM reports WHERE id = ?').get(reportId);
    if (!existing) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    const now = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO resolution_notes (report_id, author_id, author_name, note, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(reportId, req.user!.userId, req.user!.name, note.trim(), now);

    res.status(201).json({
      note: {
        id: Number(info.lastInsertRowid),
        reportId,
        authorId: req.user!.userId,
        authorName: req.user!.name,
        note: note.trim(),
        createdAt: now,
      },
    });
  }
);

// ============================================================================
// PRIORITY QUEUE & SLA ESCALATION MONITOR
// ============================================================================

app.get('/api/queue', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const reports = fetchReportsWithDetails();
  const queue = buildDeterministicQueue(reports);
  res.json({ queue });
});

app.get(
  '/api/escalations',
  authenticate,
  requireRoles('Administrator', 'Handler'),
  (_req: AuthenticatedRequest, res: Response) => {
    const escalations = db
      .prepare(
        `
      SELECT e.id, e.report_id as reportId, e.reason, e.severity, e.status,
             e.created_at as createdAt, e.resolved_at as resolvedAt,
             r.equipment_name as equipmentName, r.zone, r.status as reportStatus
      FROM escalations e
      JOIN reports r ON r.id = e.report_id
      ORDER BY CASE e.status WHEN 'Open' THEN 1 WHEN 'Acknowledged' THEN 2 ELSE 3 END, e.created_at DESC
    `
      )
      .all();

    res.json({ escalations });
  }
);

app.patch(
  '/api/escalations/:id',
  authenticate,
  requireRoles('Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { status } = req.body ?? {};
    if (status !== 'Acknowledged' && status !== 'Resolved') {
      res.status(400).json({ error: 'Invalid escalation status.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE escalations SET status = ?, resolved_at = ? WHERE id = ?').run(
      status,
      status === 'Resolved' ? now : null,
      id
    );
    res.json({ ok: true });
  }
);

// ============================================================================
// HANDLERS, ROUTING RULES, ZONES, CATEGORIES, USERS
// ============================================================================

app.get('/api/handlers', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ handlers: getHandlersWithLoad() });
});

app.patch(
  '/api/handlers/:id',
  authenticate,
  requireRoles('Handler', 'Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const handlerId = Number(req.params.id);
    const { isAvailable, maxCapacity, specialtyCategory, primaryZone } = req.body ?? {};

    const target = db.prepare('SELECT * FROM handlers WHERE id = ?').get(handlerId) as any;
    if (!target) {
      res.status(404).json({ error: 'Handler not found.' });
      return;
    }

    if (req.user!.role === 'Handler' && target.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Handlers can only modify their own availability and capacity.' });
      return;
    }

    const nextAvail = typeof isAvailable === 'boolean' ? (isAvailable ? 1 : 0) : target.is_available;
    const nextCap =
      typeof maxCapacity === 'number' && maxCapacity >= 1 && maxCapacity <= 25
        ? Math.floor(maxCapacity)
        : target.max_capacity;
    const nextSpec = FAULT_CATEGORIES.includes(specialtyCategory)
      ? specialtyCategory
      : target.specialty_category;
    const nextZone =
      typeof primaryZone === 'string' && primaryZone.trim()
        ? primaryZone.trim().toUpperCase()
        : target.primary_zone;

    db.prepare(
      'UPDATE handlers SET is_available = ?, max_capacity = ?, specialty_category = ?, primary_zone = ? WHERE id = ?'
    ).run(nextAvail, nextCap, nextSpec, nextZone, handlerId);

    const updated = getHandlersWithLoad().find((h) => h.id === handlerId);
    res.json({ handler: updated });
  }
);

app.get(
  '/api/routing-rules',
  authenticate,
  requireRoles('Administrator', 'Handler'),
  (_req: AuthenticatedRequest, res: Response) => {
    res.json({ rules: getRoutingRulesList() });
  }
);

app.post(
  '/api/routing-rules',
  authenticate,
  requireRoles('Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const { category, zone, primaryHandlerId, backupHandlerId } = req.body ?? {};
    if (!FAULT_CATEGORIES.includes(category) || !zone || !primaryHandlerId) {
      res.status(400).json({ error: 'Category, zone, and primary handler are required.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO routing_rules (category, zone, primary_handler_id, backup_handler_id, is_active, updated_at) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(
      category,
      String(zone).trim().toUpperCase(),
      Number(primaryHandlerId),
      backupHandlerId ? Number(backupHandlerId) : null,
      now
    );

    res.status(201).json({ rules: getRoutingRulesList() });
  }
);

app.put(
  '/api/routing-rules/:id',
  authenticate,
  requireRoles('Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { category, zone, primaryHandlerId, backupHandlerId, isActive } = req.body ?? {};
    const existing = db.prepare('SELECT * FROM routing_rules WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Routing rule not found.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      'UPDATE routing_rules SET category = ?, zone = ?, primary_handler_id = ?, backup_handler_id = ?, is_active = ?, updated_at = ? WHERE id = ?'
    ).run(
      FAULT_CATEGORIES.includes(category) ? category : existing.category,
      typeof zone === 'string' && zone.trim() ? zone.trim().toUpperCase() : existing.zone,
      primaryHandlerId ? Number(primaryHandlerId) : existing.primary_handler_id,
      backupHandlerId !== undefined ? (backupHandlerId ? Number(backupHandlerId) : null) : existing.backup_handler_id,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active,
      now,
      id
    );

    res.json({ rules: getRoutingRulesList() });
  }
);

app.delete(
  '/api/routing-rules/:id',
  authenticate,
  requireRoles('Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM routing_rules WHERE id = ?').run(id);
    res.json({ rules: getRoutingRulesList() });
  }
);

app.get('/api/zones', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  const zones = db.prepare('SELECT id, code, name, building, floor, description FROM zones ORDER BY code ASC').all();
  res.json({ zones });
});

app.post(
  '/api/zones',
  authenticate,
  requireRoles('Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const { code, name, building, floor, description } = req.body ?? {};
    if (!code || !/^[A-Z]{2}$/.test(String(code).trim().toUpperCase())) {
      res.status(400).json({ error: 'Zone code must be exactly 2 uppercase letters (e.g., RO).' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'Zone name is required.' });
      return;
    }
    const cleanCode = String(code).trim().toUpperCase();
    const exists = db.prepare('SELECT id FROM zones WHERE code = ?').get(cleanCode);
    if (exists) {
      res.status(409).json({ error: `Zone code ${cleanCode} already exists.` });
      return;
    }
    db.prepare('INSERT INTO zones (code, name, building, floor, description) VALUES (?, ?, ?, ?, ?)').run(
      cleanCode,
      String(name).trim(),
      String(building || 'Research Annex').trim(),
      String(floor || 'Floor 1').trim(),
      String(description || '').trim()
    );
    const zones = db.prepare('SELECT id, code, name, building, floor, description FROM zones ORDER BY code ASC').all();
    res.status(201).json({ zones });
  }
);

app.get('/api/categories', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  const categories = db
    .prepare('SELECT id, name, description, default_sla_hours as defaultSlaHours FROM categories ORDER BY id ASC')
    .all();
  res.json({ categories });
});

app.patch(
  '/api/categories/:id',
  authenticate,
  requireRoles('Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    const { description, defaultSlaHours } = req.body ?? {};
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }
    db.prepare('UPDATE categories SET description = ?, default_sla_hours = ? WHERE id = ?').run(
      typeof description === 'string' && description.trim() ? description.trim() : existing.description,
      typeof defaultSlaHours === 'number' && defaultSlaHours > 0 ? Math.floor(defaultSlaHours) : existing.default_sla_hours,
      id
    );
    const categories = db
      .prepare('SELECT id, name, description, default_sla_hours as defaultSlaHours FROM categories ORDER BY id ASC')
      .all();
    res.json({ categories });
  }
);

app.get(
  '/api/users',
  authenticate,
  requireRoles('Administrator'),
  (_req: AuthenticatedRequest, res: Response) => {
    const users = db
      .prepare('SELECT id, name, email, role, department, created_at as createdAt FROM users ORDER BY id ASC')
      .all();
    res.json({ users });
  }
);

app.patch(
  '/api/users/:id/role',
  authenticate,
  requireRoles('Administrator'),
  (req: AuthenticatedRequest, res: Response) => {
    const targetId = Number(req.params.id);
    const { role } = req.body ?? {};
    if (role !== 'Reporter' && role !== 'Handler' && role !== 'Administrator') {
      res.status(400).json({ error: 'Invalid role.' });
      return;
    }

    db.transaction(() => {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
      if (role === 'Handler') {
        const existingHandler = db.prepare('SELECT id FROM handlers WHERE user_id = ?').get(targetId);
        if (!existingHandler) {
          db.prepare(
            'INSERT INTO handlers (user_id, specialty_category, primary_zone, is_available, max_capacity, current_load, phone_ext) VALUES (?, ?, ?, 1, 4, 0, ?)'
          ).run(targetId, 'Other', 'CH', '4190');
        }
      }
    })();

    const users = db
      .prepare('SELECT id, name, email, role, department, created_at as createdAt FROM users ORDER BY id ASC')
      .all();
    res.json({ users });
  }
);

// ============================================================================
// ANALYTICS, SIMULATION LAB & VERIFICATION TEST SUITE
// ============================================================================

app.get('/api/analytics', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  const reports = fetchReportsWithDetails();
  const handlers = getHandlersWithLoad();
  const zones = db.prepare('SELECT code, name FROM zones ORDER BY code ASC').all() as Array<{
    code: string;
    name: string;
  }>;
  const openEscalations = (
    db.prepare("SELECT COUNT(*) as cnt FROM escalations WHERE status != 'Resolved'").get() as {
      cnt: number;
    }
  ).cnt;

  const totalReports = reports.length;
  const resolvedReports = reports.filter((r) => r.status === 'Resolved').length;
  const openReports = reports.filter((r) => r.status !== 'Resolved' && r.status !== 'Rejected').length;
  const criticalIncidents = reports.filter(
    (r) => r.priority === 'Critical' && r.status !== 'Resolved'
  ).length;
  const unassignedReports = reports.filter(
    (r) => !r.assignedHandlerId && r.status !== 'Resolved' && r.status !== 'Rejected'
  ).length;

  // 1. By Category
  const byCategory = FAULT_CATEGORIES.map((cat) => ({
    name: cat,
    count: reports.filter((r) => r.finalCategory === cat).length,
  }));

  // 2. By Priority
  const priorities: PriorityLevel[] = ['Critical', 'High', 'Medium', 'Low'];
  const byPriority = priorities.map((p) => ({
    name: p,
    count: reports.filter((r) => r.priority === p).length,
  }));

  // 3. By Laboratory Zone
  const zoneCodes = Array.from(new Set([...zones.map((z) => z.code), ...reports.map((r) => r.zone)]));
  const byZone = zoneCodes.map((code) => ({
    zone: code,
    name: zones.find((z) => z.code === code)?.name ?? `Unknown (${code})`,
    count: reports.filter((r) => r.zone === code).length,
    critical: reports.filter((r) => r.zone === code && r.priority === 'Critical').length,
  }));

  // 4. Resolved vs Pending
  const resolvedVsPending = [
    { name: 'Resolved', count: resolvedReports },
    { name: 'Pending / Active', count: openReports },
  ];

  // 5. Handler Workload
  const handlerWorkload = handlers.map((h) => ({
    name: h.name,
    activeLoad: h.currentLoad,
    capacity: h.maxCapacity,
    available: h.isAvailable,
  }));

  // 6. Monthly Fault Trends (last 6 months computed from submitted_at)
  const monthBuckets = new Map<string, { month: string; total: number; resolved: number; critical: number }>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthBuckets.set(key, { month: label, total: 0, resolved: 0, critical: 0 });
  }
  for (const r of reports) {
    const d = new Date(r.submittedAt);
    if (!Number.isNaN(d.getTime())) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = monthBuckets.get(key);
      if (bucket) {
        bucket.total += 1;
        if (r.status === 'Resolved') bucket.resolved += 1;
        if (r.priority === 'Critical') bucket.critical += 1;
      }
    }
  }
  const monthlyTrends = Array.from(monthBuckets.values());

  res.json({
    kpis: {
      totalReports,
      openReports,
      criticalIncidents,
      resolvedReports,
      unassignedReports,
      availableHandlers: handlers.filter((h) => h.isAvailable && h.currentLoad < h.maxCapacity).length,
      totalHandlers: handlers.length,
      openEscalations,
    },
    charts: {
      byCategory,
      byPriority,
      byZone,
      resolvedVsPending,
      handlerWorkload,
      monthlyTrends,
    },
  });
});

app.post(
  '/api/simulate',
  authenticate,
  requireRoles('Administrator', 'Handler'),
  (req: AuthenticatedRequest, res: Response) => {
    const { scenarioId } = req.body ?? {};
    const rules = getRoutingRulesList();
    const baseHandlers = getHandlersWithLoad();
    const knownZones = (db.prepare('SELECT code FROM zones').all() as Array<{ code: string }>).map(
      (z) => z.code
    );

    if (scenarioId === 'unavailable_primary') {
      const simulatedHandlers: HandlerProfile[] = baseHandlers.map((h, idx) =>
        idx === 0 ? { ...h, isAvailable: false } : { ...h, isAvailable: true, currentLoad: 0 }
      );
      const decision = evaluateSmartRouting({
        reportId: 'SIM-001',
        category: 'Electrical',
        zone: 'CH',
        priority: 'High',
        knownZones,
        routingRules: rules,
        handlers: simulatedHandlers,
      });
      res.json({
        scenario: 'Unavailable Primary Handler',
        expectedOutcome: 'Fallback to Backup Handler (assignmentType = backup, status = Assigned)',
        actualOutcome: `Assigned to ${decision.assignedHandlerName ?? 'None'} (${decision.assignmentType}, status = ${decision.status})`,
        passed: decision.assignmentType === 'backup' && decision.status === 'Assigned',
        decision,
      });
      return;
    }

    if (scenarioId === 'full_capacity') {
      const simulatedHandlers: HandlerProfile[] = baseHandlers.map((h) => ({
        ...h,
        isAvailable: true,
        currentLoad: h.maxCapacity,
      }));
      const decision = evaluateSmartRouting({
        reportId: 'SIM-002',
        category: 'Mechanical',
        zone: 'BI',
        priority: 'Medium',
        knownZones,
        routingRules: rules,
        handlers: simulatedHandlers,
      });
      res.json({
        scenario: 'Full Handler Capacity',
        expectedOutcome: 'Placed in deterministic priority queue (status = Queued, assignedHandlerId = null)',
        actualOutcome: `Status = ${decision.status}, Handler = ${decision.assignedHandlerName ?? 'Unassigned (Queued)'}`,
        passed: decision.status === 'Queued' && decision.assignedHandlerId === null,
        decision,
      });
      return;
    }

    if (scenarioId === 'unknown_zone') {
      const simulatedHandlers: HandlerProfile[] = baseHandlers.map((h) => ({
        ...h,
        isAvailable: true,
        currentLoad: 0,
      }));
      const decision = evaluateSmartRouting({
        reportId: 'SIM-003',
        category: 'Software',
        zone: 'XQ',
        priority: 'Medium',
        knownZones,
        routingRules: rules,
        handlers: simulatedHandlers,
      });
      res.json({
        scenario: 'Unknown Laboratory Zone',
        expectedOutcome: 'Flag unknownZone = true and fall back to wildcard category rule',
        actualOutcome: `unknownZone = ${decision.unknownZone}, Handler = ${decision.assignedHandlerName ?? 'Queued'} (${decision.assignmentType})`,
        passed: decision.unknownZone === true,
        decision,
      });
      return;
    }

    if (scenarioId === 'critical_hazard') {
      const simulatedHandlers: HandlerProfile[] = baseHandlers.map((h) => ({
        ...h,
        isAvailable: false,
      }));
      const prio = determinePriority('Low', 'Detected burning electrical smoke and sparks inside fume hood.');
      const decision = evaluateSmartRouting({
        reportId: 'SIM-004',
        category: 'Electrical',
        zone: 'CH',
        priority: prio.priority,
        knownZones,
        routingRules: rules,
        handlers: simulatedHandlers,
      });
      res.json({
        scenario: 'Critical Hazard Override & Unassigned Escalation',
        expectedOutcome: 'Low urgency overridden to Critical; Queued + Escalated (escalate = true)',
        actualOutcome: `Priority = ${prio.priority}, Status = ${decision.status}, Escalated = ${decision.escalate}`,
        passed: prio.priority === 'Critical' && decision.escalate === true,
        priority: prio,
        decision,
      });
      return;
    }

    if (scenarioId === 'queue_conflict') {
      const synthetic: FaultReport[] = [
        {
          id: 'SIM-RPT-003',
          priority: 'High',
          submittedAt: '2026-11-12T10:00:00Z',
          status: 'Queued',
        } as FaultReport,
        {
          id: 'SIM-RPT-001',
          priority: 'High',
          submittedAt: '2026-11-12T10:00:00Z',
          status: 'Queued',
        } as FaultReport,
        {
          id: 'SIM-RPT-002',
          priority: 'Critical',
          submittedAt: '2026-11-12T12:00:00Z',
          status: 'Queued',
        } as FaultReport,
        {
          id: 'SIM-RPT-004',
          priority: 'Medium',
          submittedAt: '2026-11-12T08:00:00Z',
          status: 'Queued',
        } as FaultReport,
      ];
      const ordered = buildDeterministicQueue(synthetic);
      const orderIds = ordered.map((o) => o.id);
      const expected = ['SIM-RPT-002', 'SIM-RPT-001', 'SIM-RPT-003', 'SIM-RPT-004'];
      res.json({
        scenario: 'Priority Queue Tie-Break Conflict',
        expectedOutcome: `Deterministic order: ${expected.join(' → ')}`,
        actualOutcome: `Computed order: ${orderIds.join(' → ')}`,
        passed: JSON.stringify(orderIds) === JSON.stringify(expected),
        queuePreview: ordered,
      });
      return;
    }

    res.status(400).json({ error: 'Unknown simulation scenario ID.' });
  }
);

app.get('/api/tests/run', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  const results = runVerificationSuite();
  const passedCount = results.filter((t) => t.passed).length;
  res.json({
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results,
  });
});

// ============================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LABCARE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
