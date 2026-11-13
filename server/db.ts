import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { classifyFaultDescription } from '../shared/classifier.ts';
import { validateEquipmentId } from '../shared/dfa.ts';
import { determinePriority } from '../shared/priority.ts';
import { evaluateSmartRouting } from '../shared/routing.ts';
import type {
  FaultCategory,
  HandlerProfile,
  PriorityLevel,
  ReportStatus,
  RoutingRule,
} from '../shared/types.ts';

const DB_PATH = path.resolve(process.cwd(), 'labcare.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Reporter', 'Handler', 'Administrator')),
      department TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      building TEXT NOT NULL,
      floor TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      default_sla_hours INTEGER NOT NULL DEFAULT 24
    );

    CREATE TABLE IF NOT EXISTS handlers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      specialty_category TEXT NOT NULL,
      primary_zone TEXT NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      max_capacity INTEGER NOT NULL DEFAULT 4,
      current_load INTEGER NOT NULL DEFAULT 0,
      phone_ext TEXT NOT NULL DEFAULT '4100',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS routing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      zone TEXT NOT NULL,
      primary_handler_id INTEGER NOT NULL,
      backup_handler_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (primary_handler_id) REFERENCES handlers(id),
      FOREIGN KEY (backup_handler_id) REFERENCES handlers(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id INTEGER NOT NULL,
      reporter_name TEXT NOT NULL,
      reporter_email TEXT NOT NULL,
      department TEXT NOT NULL,
      equipment_name TEXT NOT NULL,
      equipment_id TEXT NOT NULL,
      equipment_code TEXT NOT NULL,
      zone TEXT NOT NULL,
      description TEXT NOT NULL,
      urgency TEXT NOT NULL,
      predicted_category TEXT NOT NULL,
      final_category TEXT NOT NULL,
      matched_keywords TEXT NOT NULL,
      classification_explanation TEXT NOT NULL,
      priority TEXT NOT NULL,
      priority_reason TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_handler_id INTEGER,
      assignment_type TEXT NOT NULL,
      routing_explanation TEXT NOT NULL,
      routing_trace_json TEXT NOT NULL,
      dfa_valid INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (reporter_id) REFERENCES users(id),
      FOREIGN KEY (assigned_handler_id) REFERENCES handlers(id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      handler_id INTEGER NOT NULL,
      assignment_type TEXT NOT NULL,
      status TEXT NOT NULL,
      rejection_reason TEXT,
      assigned_at TEXT NOT NULL,
      responded_at TEXT,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (handler_id) REFERENCES handlers(id)
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      status TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resolution_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS escalations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );
  `);

  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount === 0) {
    seedDatabase();
  }
}

export function getHandlersWithLoad(): HandlerProfile[] {
  const rows = db
    .prepare(
      `
    SELECT h.id, h.user_id as userId, u.name, u.email,
           h.specialty_category as specialtyCategory, h.primary_zone as primaryZone,
           h.is_available as isAvailable, h.max_capacity as maxCapacity,
           (SELECT COUNT(*) FROM reports r WHERE r.assigned_handler_id = h.id AND r.status IN ('Assigned', 'Accepted', 'In Progress')) as currentLoad,
           h.phone_ext as phoneExt
    FROM handlers h
    JOIN users u ON u.id = h.user_id
    ORDER BY h.id ASC
  `
    )
    .all() as Array<Omit<HandlerProfile, 'isAvailable'> & { isAvailable: number }>;

  return rows.map((r) => ({
    ...r,
    isAvailable: Boolean(r.isAvailable),
  }));
}

export function getRoutingRulesList(): RoutingRule[] {
  const rows = db
    .prepare(
      `
    SELECT rr.id, rr.category, rr.zone,
           rr.primary_handler_id as primaryHandlerId,
           pu.name as primaryHandlerName,
           rr.backup_handler_id as backupHandlerId,
           bu.name as backupHandlerName,
           rr.is_active as isActive,
           rr.updated_at as updatedAt
    FROM routing_rules rr
    JOIN handlers ph ON ph.id = rr.primary_handler_id
    JOIN users pu ON pu.id = ph.user_id
    LEFT JOIN handlers bh ON bh.id = rr.backup_handler_id
    LEFT JOIN users bu ON bu.id = bh.user_id
    ORDER BY rr.id ASC
  `
    )
    .all() as Array<Omit<RoutingRule, 'isActive'> & { isActive: number }>;

  return rows.map((r) => ({
    ...r,
    isActive: Boolean(r.isActive),
  }));
}

export function generateNextReportId(): string {
  const year = new Date().getFullYear();
  const rows = db.prepare(`SELECT id FROM reports WHERE id LIKE ?`).all(`RPT-${year}-%`) as Array<{ id: string }>;
  let maxSeq = 0;
  for (const row of rows) {
    const parts = row.id.split('-');
    const num = Number.parseInt(parts[2] ?? '0', 10);
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
  }
  return `RPT-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
}

function seedDatabase(): void {
  const now = new Date();
  const iso = (daysAgo: number, hoursAgo = 0) =>
    new Date(now.getTime() - daysAgo * 86400000 - hoursAgo * 3600000).toISOString();

  const hash = bcrypt.hashSync('LabCare2026!', 10);

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const reporter1 = insertUser.run('Dr. Elena Vance', 'reporter@labcare.edu', hash, 'Reporter', 'Molecular Biology', iso(180)).lastInsertRowid as number;
  const reporter2 = insertUser.run('Dr. Liam Mercer', 'mercer@labcare.edu', hash, 'Reporter', 'Analytical Chemistry', iso(160)).lastInsertRowid as number;
  const handlerUser1 = insertUser.run('Marcus Chen', 'handler@labcare.edu', hash, 'Handler', 'Facilities & Instrumentation', iso(180)).lastInsertRowid as number;
  const handlerUser2 = insertUser.run('Priya Nair', 'handler.mech@labcare.edu', hash, 'Handler', 'Mechanical & Cryo Engineering', iso(180)).lastInsertRowid as number;
  const handlerUser3 = insertUser.run('David Okafor', 'handler.net@labcare.edu', hash, 'Handler', 'Research IT & Controls', iso(180)).lastInsertRowid as number;
  const adminUser = insertUser.run('Sarah Lindholm', 'admin@labcare.edu', hash, 'Administrator', 'Laboratory Operations', iso(180)).lastInsertRowid as number;

  const insertZone = db.prepare(
    'INSERT INTO zones (code, name, building, floor, description) VALUES (?, ?, ?, ?, ?)'
  );
  insertZone.run('CH', 'Chemistry Wing', 'Science Hall A', 'Floor 2', 'Analytical spectrometry, fume hoods, and chromatography suites');
  insertZone.run('BI', 'Molecular Biology', 'Bioscience Pavilion', 'Floor 3', 'PCR thermal cyclers, incubators, and biosafety cabinets');
  insertZone.run('PH', 'Applied Physics', 'Photonics Center', 'Floor 1', 'Laser benches, vacuum chambers, and electron microscopy');
  insertZone.run('EL', 'Electronics & Controls', 'Engineering Annex', 'Floor 2', 'High-voltage test rigs, oscilloscopes, and power electronics');
  insertZone.run('CR', 'Cryogenics Vault', 'Sub-Level Vault', 'Basement B1', 'Liquid nitrogen manifolds, ultra-low freezers, and cryo-pumps');

  const insertCat = db.prepare(
    'INSERT INTO categories (name, description, default_sla_hours) VALUES (?, ?, ?)'
  );
  insertCat.run('Electrical', 'Power supplies, circuit breakers, voltage anomalies, and wiring faults', 4);
  insertCat.run('Mechanical', 'Motors, rotors, vacuum seals, pumps, valves, and physical alignment', 8);
  insertCat.run('Software', 'Instrument firmware, control UI, driver errors, and OS lockups', 12);
  insertCat.run('Network/Connectivity', 'Ethernet links, DNS/DHCP, packet loss, and telemetry gateways', 8);
  insertCat.run('Other', 'General bench infrastructure, enclosure hardware, and miscellaneous issues', 24);

  const insertHandler = db.prepare(
    'INSERT INTO handlers (user_id, specialty_category, primary_zone, is_available, max_capacity, current_load, phone_ext) VALUES (?, ?, ?, ?, ?, 0, ?)'
  );
  const h1 = insertHandler.run(handlerUser1, 'Electrical', 'CH', 1, 4, '4102').lastInsertRowid as number;
  const h2 = insertHandler.run(handlerUser2, 'Mechanical', 'BI', 1, 4, '4108').lastInsertRowid as number;
  const h3 = insertHandler.run(handlerUser3, 'Network/Connectivity', 'EL', 1, 4, '4115').lastInsertRowid as number;

  const insertRule = db.prepare(
    'INSERT INTO routing_rules (category, zone, primary_handler_id, backup_handler_id, is_active, updated_at) VALUES (?, ?, ?, ?, 1, ?)'
  );
  // Specific rules
  insertRule.run('Electrical', 'CH', h1, h2, iso(60));
  insertRule.run('Electrical', 'EL', h1, h3, iso(60));
  insertRule.run('Mechanical', 'BI', h2, h1, iso(60));
  insertRule.run('Mechanical', 'CR', h2, h1, iso(60));
  insertRule.run('Software', 'PH', h3, h1, iso(60));
  insertRule.run('Network/Connectivity', 'EL', h3, h1, iso(60));
  // Wildcard fallback rules for all 5 categories
  insertRule.run('Electrical', '*', h1, h2, iso(60));
  insertRule.run('Mechanical', '*', h2, h1, iso(60));
  insertRule.run('Software', '*', h3, h1, iso(60));
  insertRule.run('Network/Connectivity', '*', h3, h2, iso(60));
  insertRule.run('Other', '*', h2, h3, iso(60));

  interface SeedReport {
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
    status: ReportStatus;
    submittedAt: string;
    resolvedAt?: string | null;
    note?: string;
    escalateForce?: string;
  }

  const seedReports: SeedReport[] = [
    {
      id: 'RPT-2026-0001',
      reporterId: reporter2,
      reporterName: 'Dr. Liam Mercer',
      reporterEmail: 'mercer@labcare.edu',
      department: 'Analytical Chemistry',
      equipmentName: 'Mass Spectrometer MS-9000',
      equipmentId: 'LAB-CH-SPK-042',
      equipmentCode: 'MS9-42',
      zone: 'CH',
      description: 'Power supply voltage fluctuation tripped main breaker twice during calibration.',
      urgency: 'High',
      status: 'Resolved',
      submittedAt: iso(145),
      resolvedAt: iso(144),
      note: 'Replaced degraded PSU capacitor bank and verified steady 24V rail.',
    },
    {
      id: 'RPT-2026-0002',
      reporterId: reporter1,
      reporterName: 'Dr. Elena Vance',
      reporterEmail: 'reporter@labcare.edu',
      department: 'Molecular Biology',
      equipmentName: 'Ultra-Centrifuge Rotor X4',
      equipmentId: 'LAB-BI-CNT-019',
      equipmentCode: 'CNT-19',
      zone: 'BI',
      description: 'Severe rotor bearing vibration and door latch jam above 8,000 RPM.',
      urgency: 'High',
      status: 'Resolved',
      submittedAt: iso(115),
      resolvedAt: iso(114),
      note: 'Rebalanced spindle bearing assembly and adjusted latch micro-switch.',
    },
    {
      id: 'RPT-2026-0003',
      reporterId: reporter1,
      reporterName: 'Dr. Elena Vance',
      reporterEmail: 'reporter@labcare.edu',
      department: 'Molecular Biology',
      equipmentName: 'PCR Thermal Cycler BioPro',
      equipmentId: 'LAB-BI-PCR-108',
      equipmentCode: 'PCR-108',
      zone: 'BI',
      description: 'Control UI firmware crash with error code 407 during thermal ramp.',
      urgency: 'Medium',
      status: 'Resolved',
      submittedAt: iso(88),
      resolvedAt: iso(87),
      note: 'Flashed firmware v3.4.2 and cleared corrupted protocol cache.',
    },
    {
      id: 'RPT-2026-0004',
      reporterId: reporter2,
      reporterName: 'Dr. Liam Mercer',
      reporterEmail: 'mercer@labcare.edu',
      department: 'Analytical Chemistry',
      equipmentName: 'Telemetry Gateway Switch',
      equipmentId: 'LAB-EL-NET-004',
      equipmentCode: 'NET-04',
      zone: 'EL',
      description: 'Instrument ethernet port experiencing 18% packet loss and intermittent DNS disconnect.',
      urgency: 'Medium',
      status: 'Resolved',
      submittedAt: iso(58),
      resolvedAt: iso(57),
      note: 'Replaced damaged Cat6A patch trunk and re-pinned VLAN 24 port.',
    },
    {
      id: 'RPT-2026-0005',
      reporterId: reporter2,
      reporterName: 'Dr. Liam Mercer',
      reporterEmail: 'mercer@labcare.edu',
      department: 'Analytical Chemistry',
      equipmentName: 'Cryo-Pump Manifold Unit',
      equipmentId: 'LAB-CR-CRY-011',
      equipmentCode: 'CRY-11',
      zone: 'CR',
      description: 'Vacuum seal pressure drift detected on secondary valve assembly.',
      urgency: 'High',
      status: 'Resolved',
      submittedAt: iso(31),
      resolvedAt: iso(30),
      note: 'Installed fresh Viton O-ring seal and passed 4-hour helium leak test.',
    },
    {
      id: 'RPT-2026-0006',
      reporterId: reporter1,
      reporterName: 'Dr. Elena Vance',
      reporterEmail: 'reporter@labcare.edu',
      department: 'Molecular Biology',
      equipmentName: 'Laser Confocal Stage',
      equipmentId: 'LAB-PH-LAS-027',
      equipmentCode: 'LAS-27',
      zone: 'PH',
      description: 'Acquisition software freeze on boot with driver exception.',
      urgency: 'Medium',
      status: 'In Progress',
      submittedAt: iso(2, 6),
    },
    {
      id: 'RPT-2026-0007',
      reporterId: reporter1,
      reporterName: 'Dr. Elena Vance',
      reporterEmail: 'reporter@labcare.edu',
      department: 'Molecular Biology',
      equipmentName: 'High-Voltage Electrophoresis Rig',
      equipmentId: 'LAB-CH-ELC-083',
      equipmentCode: 'ELC-83',
      zone: 'CH',
      description: 'Observed smoke and sparks near rear wiring terminal during high-current run.',
      urgency: 'Medium',
      status: 'Assigned',
      submittedAt: iso(0, 14),
    },
    {
      id: 'RPT-2026-0008',
      reporterId: reporter2,
      reporterName: 'Dr. Liam Mercer',
      reporterEmail: 'mercer@labcare.edu',
      department: 'Analytical Chemistry',
      equipmentName: 'Liquid Nitrogen Dewar Valve',
      equipmentId: 'LAB-CR-VAL-009',
      equipmentCode: 'VAL-09',
      zone: 'CR',
      description: 'Cryogenic leak warning near primary manifold pressure valve.',
      urgency: 'High',
      status: 'Queued',
      submittedAt: iso(0, 9),
      escalateForce: 'Unassigned Critical cryogenic leak incident awaiting immediate valve isolation.',
    },
    {
      id: 'RPT-2026-0009',
      reporterId: reporter1,
      reporterName: 'Dr. Elena Vance',
      reporterEmail: 'reporter@labcare.edu',
      department: 'Molecular Biology',
      equipmentName: 'Lab Bench Wi-Fi Bridge',
      equipmentId: 'LAB-EL-WIF-055',
      equipmentCode: 'WIF-55',
      zone: 'EL',
      description: 'Automated plate reader offline; cannot connect to local MQTT broker.',
      urgency: 'Low',
      status: 'Assigned',
      submittedAt: iso(0, 5),
    },
    {
      id: 'RPT-2026-0010',
      reporterId: reporter2,
      reporterName: 'Dr. Liam Mercer',
      reporterEmail: 'mercer@labcare.edu',
      department: 'Analytical Chemistry',
      equipmentName: 'Fume Hood Sash Counterweight',
      equipmentId: 'LAB-CH-HOD-014',
      equipmentCode: 'HOD-14',
      zone: 'CH',
      description: 'Enclosure glass sash cable feels loose and needs inspection.',
      urgency: 'Low',
      status: 'Accepted',
      submittedAt: iso(1, 3),
    },
  ];

  const insertReport = db.prepare(`
    INSERT INTO reports (
      id, reporter_id, reporter_name, reporter_email, department,
      equipment_name, equipment_id, equipment_code, zone, description, urgency,
      predicted_category, final_category, matched_keywords, classification_explanation,
      priority, priority_reason, status, assigned_handler_id, assignment_type,
      routing_explanation, routing_trace_json, dfa_valid, submitted_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAssignment = db.prepare(`
    INSERT INTO assignments (report_id, handler_id, assignment_type, status, assigned_at, responded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertHistory = db.prepare(`
    INSERT INTO status_history (report_id, status, changed_by, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertNote = db.prepare(`
    INSERT INTO resolution_notes (report_id, author_id, author_name, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertEscalation = db.prepare(`
    INSERT INTO escalations (report_id, reason, severity, status, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const knownZones = ['CH', 'BI', 'PH', 'EL', 'CR'];

  for (const sr of seedReports) {
    const idCheck = validateEquipmentId(sr.equipmentId);
    const classification = classifyFaultDescription(sr.description, sr.equipmentName);
    const prio = determinePriority(sr.urgency, sr.description);
    const rules = getRoutingRulesList();
    const handlers = getHandlersWithLoad();

    let decision = evaluateSmartRouting({
      reportId: sr.id,
      category: classification.category as FaultCategory,
      zone: sr.zone,
      priority: prio.priority,
      knownZones,
      routingRules: rules,
      handlers,
    });

    if (sr.status === 'Queued') {
      decision = {
        ...decision,
        assignedHandlerId: null,
        assignedHandlerName: null,
        assignmentType: 'queued',
        status: 'Queued',
        escalate: Boolean(sr.escalateForce),
        escalationReason: sr.escalateForce ?? null,
      };
    }

    const finalHandlerId = sr.status === 'Queued' ? null : decision.assignedHandlerId;
    const finalAssignmentType = sr.status === 'Queued' ? 'queued' : decision.assignmentType;

    insertReport.run(
      sr.id,
      sr.reporterId,
      sr.reporterName,
      sr.reporterEmail,
      sr.department,
      sr.equipmentName,
      sr.equipmentId,
      sr.equipmentCode,
      sr.zone,
      sr.description,
      sr.urgency,
      classification.category,
      classification.category,
      JSON.stringify(classification.matchedKeywords),
      classification.explanation,
      prio.priority,
      prio.reason,
      sr.status,
      finalHandlerId,
      finalAssignmentType,
      decision.explanation,
      JSON.stringify(decision.trace),
      idCheck.valid ? 1 : 0,
      sr.submittedAt,
      sr.resolvedAt ?? null
    );

    insertHistory.run(sr.id, 'Submitted', sr.reporterName, 'Fault report submitted and validated via DFA.', sr.submittedAt);

    if (finalHandlerId) {
      const assignStatus =
        sr.status === 'Resolved'
          ? 'Completed'
          : sr.status === 'Accepted' || sr.status === 'In Progress'
          ? 'Accepted'
          : 'Pending';
      insertAssignment.run(
        sr.id,
        finalHandlerId,
        finalAssignmentType,
        assignStatus,
        sr.submittedAt,
        sr.status === 'Assigned' ? null : sr.submittedAt
      );
      insertHistory.run(
        sr.id,
        'Assigned',
        'Smart Dispatch Engine',
        decision.explanation,
        sr.submittedAt
      );
      if (sr.status === 'Accepted' || sr.status === 'In Progress' || sr.status === 'Resolved') {
        insertHistory.run(sr.id, 'Accepted', decision.assignedHandlerName ?? 'Handler', 'Handler accepted dispatch.', sr.submittedAt);
      }
      if (sr.status === 'In Progress' || sr.status === 'Resolved') {
        insertHistory.run(sr.id, 'In Progress', decision.assignedHandlerName ?? 'Handler', 'Diagnostic work underway.', sr.submittedAt);
      }
      if (sr.status === 'Resolved' && sr.resolvedAt) {
        insertHistory.run(sr.id, 'Resolved', decision.assignedHandlerName ?? 'Handler', sr.note ?? 'Issue resolved.', sr.resolvedAt);
        if (sr.note) {
          insertNote.run(sr.id, adminUser, decision.assignedHandlerName ?? 'Handler', sr.note, sr.resolvedAt);
        }
      }
    } else {
      insertHistory.run(sr.id, 'Queued', 'Smart Dispatch Engine', sr.escalateForce ?? decision.explanation, sr.submittedAt);
    }

    if (sr.escalateForce) {
      insertEscalation.run(sr.id, sr.escalateForce, 'Critical', 'Open', sr.submittedAt, null);
    } else if (sr.id === 'RPT-2026-0007') {
      insertEscalation.run(
        sr.id,
        'Critical electrical smoke/sparks incident — SLA response window 30 minutes.',
        'Critical',
        'Open',
        sr.submittedAt,
        null
      );
    }
  }
}
