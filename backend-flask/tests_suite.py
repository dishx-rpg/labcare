"""
LABCARE Python Verification Suite (Pytest)
Run with: pytest tests_suite.py -v
"""

from algorithms import (
    classify_fault_description,
    determine_priority,
    evaluate_smart_routing,
    sort_priority_queue,
    validate_equipment_id,
)

HANDLERS = [
    {"id": 1, "name": "Marcus Chen", "isAvailable": True, "maxCapacity": 4, "currentLoad": 1},
    {"id": 2, "name": "Priya Nair", "isAvailable": True, "maxCapacity": 4, "currentLoad": 2},
]

RULES = [
    {"id": 1, "category": "Electrical", "zone": "CH", "primaryHandlerId": 1, "backupHandlerId": 2, "isActive": True},
    {"id": 2, "category": "Mechanical", "zone": "*", "primaryHandlerId": 2, "backupHandlerId": 1, "isActive": True},
]


def test_dfa_accepts_valid_id():
    res = validate_equipment_id("LAB-CH-SPK-042")
    assert res["valid"] is True
    assert res["dfa"]["finalState"] == "q14"
    assert res["agreement"] is True


def test_dfa_rejects_lowercase_zone():
    res = validate_equipment_id("LAB-ch-SPK-042")
    assert res["valid"] is False
    assert res["dfa"]["finalState"] == "q_dead"
    assert res["agreement"] is True


def test_dfa_rejects_extra_digit():
    res = validate_equipment_id("LAB-CH-SPK-0421")
    assert res["valid"] is False
    assert res["dfa"]["rejectedAtIndex"] == 14


def test_classifier_electrical():
    res = classify_fault_description("Voltage surge tripped breaker and damaged power supply.")
    assert res["category"] == "Electrical"


def test_classifier_tie_break_precedence():
    res = classify_fault_description("Abnormal voltage near rotor bearing.")
    assert res["category"] == "Electrical"
    assert res["tieBroken"] is True


def test_priority_hazard_override():
    res = determine_priority("Low", "Visible smoke and sparks inside cabinet.")
    assert res["priority"] == "Critical"
    assert res["hazardDetected"] is True


def test_deterministic_queue_ordering():
    items = [
        {"id": "RPT-003", "priority": "High", "submittedAt": "2026-11-10T09:00:00Z", "status": "Queued"},
        {"id": "RPT-001", "priority": "High", "submittedAt": "2026-11-10T09:00:00Z", "status": "Queued"},
        {"id": "RPT-002", "priority": "Critical", "submittedAt": "2026-11-10T11:00:00Z", "status": "Queued"},
    ]
    ordered = [x["id"] for x in sort_priority_queue(items)]
    assert ordered == ["RPT-002", "RPT-001", "RPT-003"]


def test_routing_primary_assignment():
    d = evaluate_smart_routing("RPT-1", "Electrical", "CH", "High", ["CH", "BI"], RULES, HANDLERS)
    assert d["assignedHandlerId"] == 1
    assert d["assignmentType"] == "primary"


def test_routing_backup_fallback():
    busy = [{**HANDLERS[0], "isAvailable": False}, HANDLERS[1]]
    d = evaluate_smart_routing("RPT-2", "Electrical", "CH", "Medium", ["CH", "BI"], RULES, busy)
    assert d["assignedHandlerId"] == 2
    assert d["assignmentType"] == "backup"


def test_routing_critical_escalation_when_full():
    full = [{**h, "currentLoad": h["maxCapacity"]} for h in HANDLERS]
    d = evaluate_smart_routing("RPT-3", "Electrical", "CH", "Critical", ["CH", "BI"], RULES, full)
    assert d["status"] == "Queued"
    assert d["escalate"] is True


def test_routing_duplicate_prevention():
    d = evaluate_smart_routing(
        "RPT-4", "Electrical", "CH", "High", ["CH", "BI"], RULES, HANDLERS,
        existing_active_assignments=[{"reportId": "RPT-4", "handlerId": 1}],
    )
    assert d["duplicateBlocked"] is True
