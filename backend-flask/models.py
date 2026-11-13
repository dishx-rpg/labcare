"""
LABCARE SQLite Database Models & Seed Helper (Python Flask Academic Backend)
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sqlite3
from werkzeug.security import generate_password_hash
from algorithms import (
    classify_fault_description,
    determine_priority,
    evaluate_smart_routing,
    validate_equipment_id,
)

DB_PATH = os.environ.get("LABCARE_DB_PATH", os.path.join(os.path.dirname(__file__), "labcare_flask.db"))


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(
            """
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
            """
        )

        cnt = conn.execute("SELECT COUNT(*) as cnt FROM users").fetchone()["cnt"]
        if cnt == 0:
            seed_db(conn)
    finally:
        conn.close()


def get_handlers_with_load(conn: sqlite3.Connection):
    rows = conn.execute(
        """
        SELECT h.id, h.user_id as userId, u.name, u.email,
               h.specialty_category as specialtyCategory, h.primary_zone as primaryZone,
               h.is_available as isAvailable, h.max_capacity as maxCapacity,
               (SELECT COUNT(*) FROM reports r WHERE r.assigned_handler_id = h.id AND r.status IN ('Assigned', 'Accepted', 'In Progress')) as currentLoad,
               h.phone_ext as phoneExt
        FROM handlers h
        JOIN users u ON u.id = h.user_id
        ORDER BY h.id ASC
        """
    ).fetchall()
    return [
        {**dict(row), "isAvailable": bool(row["isAvailable"])}
        for row in rows
    ]


def get_routing_rules(conn: sqlite3.Connection):
    rows = conn.execute(
        """
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
        """
    ).fetchall()
    return [{**dict(row), "isActive": bool(row["isActive"])} for row in rows]


def generate_report_id(conn: sqlite3.Connection) -> str:
    year = datetime.now(timezone.utc).year
    rows = conn.execute("SELECT id FROM reports WHERE id LIKE ?", (f"RPT-{year}-%",)).fetchall()
    max_seq = 0
    for row in rows:
        try:
            seq = int(row["id"].split("-")[2])
            if seq > max_seq:
                max_seq = seq
        except (IndexError, ValueError):
            pass
    return f"RPT-{year}-{max_seq + 1:04d}"


def seed_db(conn: sqlite3.Connection) -> None:
    now = datetime.now(timezone.utc)
    iso = lambda days=0: (now - timedelta(days=days)).isoformat()
    pw_hash = generate_password_hash("LabCare2026!")

    cur = conn.cursor()
    cur.execute("INSERT INTO users (name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("Dr. Elena Vance", "reporter@labcare.edu", pw_hash, "Reporter", "Molecular Biology", iso(90)))
    r1 = cur.lastrowid

    cur.execute("INSERT INTO users (name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("Marcus Chen", "handler@labcare.edu", pw_hash, "Handler", "Facilities & Instrumentation", iso(90)))
    hu1 = cur.lastrowid

    cur.execute("INSERT INTO users (name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("Priya Nair", "handler.mech@labcare.edu", pw_hash, "Handler", "Mechanical & Cryo Engineering", iso(90)))
    hu2 = cur.lastrowid

    cur.execute("INSERT INTO users (name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("Sarah Lindholm", "admin@labcare.edu", pw_hash, "Administrator", "Laboratory Operations", iso(90)))

    zones = [
        ("CH", "Chemistry Wing", "Science Hall A", "Floor 2", "Spectrometry and fume hoods"),
        ("BI", "Molecular Biology", "Bioscience Pavilion", "Floor 3", "PCR and biosafety suites"),
        ("PH", "Applied Physics", "Photonics Center", "Floor 1", "Laser optics and microscopy"),
        ("EL", "Electronics & Controls", "Engineering Annex", "Floor 2", "Power electronics and telemetry"),
        ("CR", "Cryogenics Vault", "Sub-Level Vault", "Basement B1", "Cryo manifolds and freezers"),
    ]
    cur.executemany("INSERT INTO zones (code, name, building, floor, description) VALUES (?, ?, ?, ?, ?)", zones)

    cats = [
        ("Electrical", "Power supplies, breakers, and voltage faults", 4),
        ("Mechanical", "Motors, rotors, vacuum seals, and valves", 8),
        ("Software", "Firmware, control UI, and OS lockups", 12),
        ("Network/Connectivity", "Ethernet, DNS, and telemetry links", 8),
        ("Other", "General bench and enclosure hardware", 24),
    ]
    cur.executemany("INSERT INTO categories (name, description, default_sla_hours) VALUES (?, ?, ?)", cats)

    cur.execute("INSERT INTO handlers (user_id, specialty_category, primary_zone, is_available, max_capacity, current_load, phone_ext) VALUES (?, ?, ?, 1, 4, 0, ?)",
                (hu1, "Electrical", "CH", "4102"))
    h1 = cur.lastrowid
    cur.execute("INSERT INTO handlers (user_id, specialty_category, primary_zone, is_available, max_capacity, current_load, phone_ext) VALUES (?, ?, ?, 1, 4, 0, ?)",
                (hu2, "Mechanical", "BI", "4108"))
    h2 = cur.lastrowid

    for cat in ("Electrical", "Mechanical", "Software", "Network/Connectivity", "Other"):
        prim, bak = (h1, h2) if cat == "Electrical" else (h2, h1)
        cur.execute(
            "INSERT INTO routing_rules (category, zone, primary_handler_id, backup_handler_id, is_active, updated_at) VALUES (?, '*', ?, ?, 1, ?)",
            (cat, prim, bak, iso(30)),
        )

    sample_desc = "Power supply voltage fluctuation tripped main breaker."
    id_res = validate_equipment_id("LAB-CH-SPK-042")
    cls_res = classify_fault_description(sample_desc, "Mass Spectrometer MS-9000")
    prio_res = determine_priority("High", sample_desc)
    route_res = evaluate_smart_routing(
        "RPT-2026-0001", cls_res["category"], "CH", prio_res["priority"],
        ["CH", "BI", "PH", "EL", "CR"], get_routing_rules(conn), get_handlers_with_load(conn)
    )
    cur.execute(
        """
        INSERT INTO reports (
            id, reporter_id, reporter_name, reporter_email, department,
            equipment_name, equipment_id, equipment_code, zone, description, urgency,
            predicted_category, final_category, matched_keywords, classification_explanation,
            priority, priority_reason, status, assigned_handler_id, assignment_type,
            routing_explanation, routing_trace_json, dfa_valid, submitted_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            "RPT-2026-0001", r1, "Dr. Elena Vance", "reporter@labcare.edu", "Molecular Biology",
            "Mass Spectrometer MS-9000", "LAB-CH-SPK-042", "MS9-42", "CH", sample_desc, "High",
            cls_res["category"], cls_res["category"], json.dumps(cls_res["matchedKeywords"]),
            cls_res["explanation"], prio_res["priority"], prio_res["reason"],
            route_res["status"], route_res["assignedHandlerId"], route_res["assignmentType"],
            route_res["explanation"], json.dumps(route_res["trace"]), 1 if id_res["valid"] else 0, iso(1),
        ),
    )
    conn.commit()
