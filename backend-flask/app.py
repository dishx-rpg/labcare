"""
LABCARE Flask + SQLite Academic Backend Server
Provides identical REST API contracts to the live Node.js Express runtime.
"""

import csv
from datetime import datetime, timezone
import io
import json
import re
from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

from algorithms import (
    FAULT_CATEGORIES,
    classify_fault_description,
    determine_priority,
    evaluate_smart_routing,
    sort_priority_queue,
    validate_equipment_id,
)
from auth import issue_token, require_auth, require_roles
from models import (
    generate_report_id,
    get_connection,
    get_handlers_with_load,
    get_routing_rules,
    init_db,
)

app = Flask(__name__)
CORS(app)
init_db()


def map_report(row):
    d = dict(row)
    return {
        "id": d["id"],
        "reporterId": d["reporter_id"],
        "reporterName": d["reporter_name"],
        "reporterEmail": d["reporter_email"],
        "department": d["department"],
        "equipmentName": d["equipment_name"],
        "equipmentId": d["equipment_id"],
        "equipmentCode": d["equipment_code"],
        "zone": d["zone"],
        "description": d["description"],
        "urgency": d["urgency"],
        "predictedCategory": d["predicted_category"],
        "finalCategory": d["final_category"],
        "matchedKeywords": json.loads(d.get("matched_keywords") or "[]"),
        "classificationExplanation": d["classification_explanation"],
        "priority": d["priority"],
        "priorityReason": d["priority_reason"],
        "status": d["status"],
        "assignedHandlerId": d["assigned_handler_id"],
        "assignedHandlerName": d.get("assigned_handler_name"),
        "assignmentType": d["assignment_type"],
        "routingExplanation": d["routing_explanation"],
        "routingTrace": json.loads(d.get("routing_trace_json") or "[]"),
        "dfaValid": bool(d["dfa_valid"]),
        "submittedAt": d["submitted_at"],
        "resolvedAt": d["resolved_at"],
    }


def fetch_reports(conn, where_sql="", params=()):
    rows = conn.execute(
        f"""
        SELECT r.*, u.name as assigned_handler_name
        FROM reports r
        LEFT JOIN handlers h ON h.id = r.assigned_handler_id
        LEFT JOIN users u ON u.id = h.user_id
        {where_sql}
        ORDER BY r.submitted_at DESC
        """,
        params,
    ).fetchall()
    return [map_report(r) for r in rows]


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    role = body.get("role") if body.get("role") in ("Reporter", "Handler", "Administrator") else "Reporter"
    department = (body.get("department") or "General Research").strip()

    if len(name) < 2:
        return jsonify({"error": "Name must be at least 2 characters."}), 400
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        return jsonify({"error": "Invalid email address."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    conn = get_connection()
    try:
        if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
            return jsonify({"error": "Email already registered."}), 409

        now = datetime.now(timezone.utc).isoformat()
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.execute(
            "INSERT INTO users (name, email, password_hash, role, department, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (name, email, generate_password_hash(password), role, department, now),
        )
        uid = cur.lastrowid
        if role == "Handler":
            conn.execute(
                "INSERT INTO handlers (user_id, specialty_category, primary_zone, is_available, max_capacity, current_load, phone_ext) VALUES (?, 'Other', 'CH', 1, 4, 0, '4199')",
                (uid,),
            )
        conn.commit()
        user_row = conn.execute("SELECT id, name, email, role, department, created_at as createdAt FROM users WHERE id = ?", (uid,)).fetchone()
        return jsonify({"token": issue_token(user_row), "user": dict(user_row)}), 201
    finally:
        conn.close()


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not row or not check_password_hash(row["password_hash"], password):
            return jsonify({"error": "Invalid email or password."}), 401
        user_dict = {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "department": row["department"],
            "createdAt": row["created_at"],
        }
        return jsonify({"token": issue_token(row), "user": user_dict})
    finally:
        conn.close()


@app.get("/api/auth/me")
@require_auth
def me():
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, name, email, role, department, created_at as createdAt FROM users WHERE id = ?",
            (g.user["userId"],),
        ).fetchone()
        if not row:
            return jsonify({"error": "User not found."}), 404
        return jsonify({"user": dict(row)})
    finally:
        conn.close()


@app.post("/api/validate-id")
def api_validate_id():
    body = request.get_json(silent=True) or {}
    return jsonify(validate_equipment_id(body.get("equipmentId", "")))


@app.post("/api/classify-preview")
def api_classify_preview():
    body = request.get_json(silent=True) or {}
    cls_res = classify_fault_description(body.get("description", ""), body.get("equipmentName", ""))
    urgency = body.get("urgency") if body.get("urgency") in ("Critical", "High", "Medium", "Low") else "Medium"
    prio_res = determine_priority(urgency, body.get("description", ""))
    return jsonify({"classification": cls_res, "priority": prio_res})


@app.get("/api/reports")
@require_auth
def list_reports():
    conn = get_connection()
    try:
        role = g.user["role"]
        if role == "Reporter":
            reports = fetch_reports(conn, "WHERE r.reporter_id = ?", (g.user["userId"],))
        elif role == "Handler":
            h = conn.execute("SELECT id FROM handlers WHERE user_id = ?", (g.user["userId"],)).fetchone()
            reports = fetch_reports(conn, "WHERE r.assigned_handler_id = ? OR r.status = 'Queued'", (h["id"],)) if h else []
        else:
            reports = fetch_reports(conn)
        return jsonify({"reports": reports})
    finally:
        conn.close()


@app.post("/api/reports")
@require_auth
def create_report():
    body = request.get_json(silent=True) or {}
    required = ("reporterName", "reporterEmail", "department", "equipmentName", "equipmentId", "equipmentCode", "zone", "description")
    if any(not str(body.get(k, "")).strip() for k in required):
        return jsonify({"error": "All fault report fields are required."}), 400

    id_check = validate_equipment_id(str(body["equipmentId"]).strip())
    if not id_check["valid"]:
        return jsonify({"error": f"Invalid Equipment ID: {id_check['explanation']}", "validation": id_check}), 400

    urgency = body.get("urgency") if body.get("urgency") in ("Critical", "High", "Medium", "Low") else "Medium"
    submitted_at = body.get("submittedAt") or datetime.now(timezone.utc).isoformat()
    classification = classify_fault_description(body["description"], body["equipmentName"])
    prio = determine_priority(urgency, body["description"])

    conn = get_connection()
    try:
        # BEGIN IMMEDIATE acquires write lock to prevent oversubscribing handlers under concurrent requests
        conn.execute("BEGIN IMMEDIATE")
        report_id = generate_report_id(conn)
        known_zones = [r["code"] for r in conn.execute("SELECT code FROM zones").fetchall()]
        rules = get_routing_rules(conn)
        handlers = get_handlers_with_load(conn)
        active_assigns = [
            dict(r) for r in conn.execute("SELECT report_id as reportId, handler_id as handlerId FROM assignments WHERE status IN ('Pending', 'Accepted')").fetchall()
        ]

        decision = evaluate_smart_routing(
            report_id=report_id,
            category=classification["category"],
            zone=str(body["zone"]).strip().upper(),
            priority=prio["priority"],
            known_zones=known_zones,
            routing_rules=rules,
            handlers=handlers,
            existing_active_assignments=active_assigns,
        )

        conn.execute(
            """
            INSERT INTO reports (
                id, reporter_id, reporter_name, reporter_email, department,
                equipment_name, equipment_id, equipment_code, zone, description, urgency,
                predicted_category, final_category, matched_keywords, classification_explanation,
                priority, priority_reason, status, assigned_handler_id, assignment_type,
                routing_explanation, routing_trace_json, dfa_valid, submitted_at, resolved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)
            """,
            (
                report_id, g.user["userId"], body["reporterName"].strip(), body["reporterEmail"].strip(),
                body["department"].strip(), body["equipmentName"].strip(), id_check["input"],
                body["equipmentCode"].strip(), str(body["zone"]).strip().upper(), body["description"].strip(),
                urgency, classification["category"], classification["category"],
                json.dumps(classification["matchedKeywords"]), classification["explanation"],
                prio["priority"], prio["reason"], decision["status"], decision["assignedHandlerId"],
                decision["assignmentType"], decision["explanation"], json.dumps(decision["trace"]), submitted_at,
            ),
        )

        if decision["assignedHandlerId"]:
            conn.execute(
                "INSERT INTO assignments (report_id, handler_id, assignment_type, status, assigned_at) VALUES (?, ?, ?, 'Pending', ?)",
                (report_id, decision["assignedHandlerId"], decision["assignmentType"], submitted_at),
            )
            conn.execute("UPDATE handlers SET current_load = current_load + 1 WHERE id = ?", (decision["assignedHandlerId"],))
        if decision["escalate"] and decision["escalationReason"]:
            conn.execute(
                "INSERT INTO escalations (report_id, reason, severity, status, created_at) VALUES (?, ?, ?, 'Open', ?)",
                (report_id, decision["escalationReason"], prio["priority"], submitted_at),
            )
        conn.commit()
        created = fetch_reports(conn, "WHERE r.id = ?", (report_id,))[0]
        return jsonify({
            "report": created,
            "validation": id_check,
            "classification": classification,
            "priority": prio,
            "routingDecision": decision,
        }), 201
    finally:
        conn.close()


@app.get("/api/queue")
@require_auth
def get_queue():
    conn = get_connection()
    try:
        reports = fetch_reports(conn)
        return jsonify({"queue": sort_priority_queue(reports)})
    finally:
        conn.close()


@app.get("/api/reports/export/csv")
@require_roles("Administrator", "Handler")
def export_csv():
    conn = get_connection()
    try:
        reports = fetch_reports(conn)
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Report ID", "Submitted At", "Equipment", "Equipment ID", "Zone", "Category", "Priority", "Status", "Handler"])
        for r in reports:
            writer.writerow([
                r["id"], r["submittedAt"], r["equipmentName"], r["equipmentId"],
                r["zone"], r["finalCategory"], r["priority"], r["status"], r["assignedHandlerName"] or "Unassigned",
            ])
        return Response(
            buf.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=labcare_fault_reports.csv"},
        )
    finally:
        conn.close()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
