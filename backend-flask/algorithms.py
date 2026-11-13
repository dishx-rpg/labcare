"""
LABCARE Core Deterministic Algorithms (Python Academic Reference Implementation)
Mirrors shared/dfa.ts, shared/classifier.ts, shared/priority.ts, shared/queue.ts, and shared/routing.ts.
"""

from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import datetime
import re
from typing import Any, Dict, List, Optional, Tuple

EQUIPMENT_ID_REGEX_SOURCE = r"^LAB-[A-Z]{2}-[A-Z]{3}-[0-9]{3}$"
EQUIPMENT_ID_REGEX = re.compile(EQUIPMENT_ID_REGEX_SOURCE)

FAULT_CATEGORIES = [
    "Electrical",
    "Mechanical",
    "Software",
    "Network/Connectivity",
    "Other",
]

TIE_BREAK_ORDER = [
    "Electrical",
    "Mechanical",
    "Network/Connectivity",
    "Software",
    "Other",
]

PRIORITY_RANK = {
    "Critical": 1,
    "High": 2,
    "Medium": 3,
    "Low": 4,
}


def dfa_transition(state: str, ch: str) -> Tuple[str, str, bool]:
    """Deterministic transition function δ(state, char) -> (next_state, rule, valid)."""
    is_upper = len(ch) == 1 and "A" <= ch <= "Z"
    is_digit = len(ch) == 1 and "0" <= ch <= "9"

    if state == "q0":
        return ("q1", "δ(q0, 'L') -> q1", True) if ch == "L" else ("q_dead", f"δ(q0, '{ch}') -> q_dead (expected 'L')", False)
    if state == "q1":
        return ("q2", "δ(q1, 'A') -> q2", True) if ch == "A" else ("q_dead", f"δ(q1, '{ch}') -> q_dead (expected 'A')", False)
    if state == "q2":
        return ("q3", "δ(q2, 'B') -> q3", True) if ch == "B" else ("q_dead", f"δ(q2, '{ch}') -> q_dead (expected 'B')", False)
    if state in ("q3", "q6", "q10"):
        return (f"q{int(state[1:]) + 1}", f"δ({state}, '-') -> q{int(state[1:]) + 1}", True) if ch == "-" else ("q_dead", f"δ({state}, '{ch}') -> q_dead (expected '-')", False)
    if state in ("q4", "q5"):
        nxt = f"q{int(state[1:]) + 1}"
        return (nxt, f"δ({state}, '{ch}' in [A-Z]) -> {nxt}", True) if is_upper else ("q_dead", f"δ({state}, '{ch}') -> q_dead (expected Zone [A-Z])", False)
    if state in ("q7", "q8", "q9"):
        nxt = f"q{int(state[1:]) + 1}"
        return (nxt, f"δ({state}, '{ch}' in [A-Z]) -> {nxt}", True) if is_upper else ("q_dead", f"δ({state}, '{ch}') -> q_dead (expected Category [A-Z])", False)
    if state in ("q11", "q12", "q13"):
        nxt = f"q{int(state[1:]) + 1}"
        return (nxt, f"δ({state}, '{ch}' in [0-9]) -> {nxt}", True) if is_digit else ("q_dead", f"δ({state}, '{ch}') -> q_dead (expected Digit [0-9])", False)
    if state == "q14":
        return ("q_dead", f"δ(q14, '{ch}') -> q_dead (unexpected trailing character)", False)
    return ("q_dead", f"δ(q_dead, '{ch}') -> q_dead (trap loop)", False)


def validate_equipment_id(raw_input: str) -> Dict[str, Any]:
    text = raw_input or ""
    state = "q0"
    steps = []
    rejected_at = None

    for idx, ch in enumerate(text):
        next_state, rule, valid = dfa_transition(state, ch)
        steps.append({
            "index": idx,
            "char": ch,
            "fromState": state,
            "toState": next_state,
            "rule": rule,
            "validTransition": valid,
        })
        if not valid and rejected_at is None:
            rejected_at = idx
        state = next_state

    dfa_valid = state == "q14"
    regex_valid = bool(EQUIPMENT_ID_REGEX.match(text))

    if dfa_valid:
        reason = "Accepted: DFA traversed q0 -> q14 across 14 characters matching LAB-<ZONE>-<CAT>-<NNN>."
    elif len(text) == 0:
        reason = "Rejected: empty string ended in start state q0 (expected 'L')."
    elif state == "q_dead" and rejected_at is not None:
        reason = f"Rejected at index {rejected_at} ('{steps[rejected_at]['char']}'): {steps[rejected_at]['rule']}."
    else:
        reason = f"Rejected: input ended prematurely in non-accepting state {state}."

    return {
        "input": text,
        "valid": dfa_valid and regex_valid,
        "agreement": dfa_valid == regex_valid,
        "dfa": {
            "input": text,
            "valid": dfa_valid,
            "finalState": state,
            "isAcceptingState": dfa_valid,
            "steps": steps,
            "rejectedAtIndex": rejected_at,
            "reason": reason,
        },
        "regex": {
            "input": text,
            "valid": regex_valid,
            "pattern": EQUIPMENT_ID_REGEX_SOURCE,
            "reason": f"Matched regex {EQUIPMENT_ID_REGEX_SOURCE}." if regex_valid else f"Did not match regex {EQUIPMENT_ID_REGEX_SOURCE}.",
        },
        "explanation": f'Both DFA (final state q14) and Regex accepted "{text}".' if dfa_valid else f"{reason} Regex agrees: {'match' if regex_valid else 'rejected'}.",
    }


CATEGORY_KEYWORDS = {
    "Electrical": [
        ("short circuit", 3), ("arc flash", 3), ("electric shock", 3), ("ground fault", 3),
        ("power supply", 3), ("voltage", 2), ("breaker", 2), ("fuse", 2), ("spark", 2),
        ("sparks", 2), ("smoke", 2), ("burning", 2), ("wiring", 2), ("surge", 2),
        ("battery", 2), ("psu", 2), ("electrode", 2), ("overheating", 1), ("power", 1), ("current", 1),
    ],
    "Mechanical": [
        ("door latch", 3), ("vacuum seal", 3), ("bearing", 2), ("motor", 2), ("rotor", 2),
        ("vibration", 2), ("centrifuge", 2), ("jam", 2), ("jammed", 2), ("valve", 2),
        ("pump", 2), ("leak", 2), ("leaking", 2), ("belt", 2), ("shaft", 2),
        ("alignment", 2), ("seal", 2), ("hinge", 2), ("pressure", 1), ("noise", 1),
    ],
    "Software": [
        ("error code", 3), ("calibration software", 3), ("blue screen", 3), ("firmware", 2),
        ("crash", 2), ("crashed", 2), ("freeze", 2), ("frozen", 2), ("driver", 2),
        ("exception", 2), ("license", 2), ("software", 2), ("boot", 2), ("update", 1),
        ("bug", 2), ("ui", 1), ("hang", 1), ("os", 1),
    ],
    "Network/Connectivity": [
        ("packet loss", 3), ("cannot connect", 3), ("ethernet", 2), ("wifi", 2), ("wi-fi", 2),
        ("network", 2), ("disconnect", 2), ("disconnected", 2), ("dns", 2), ("dhcp", 2),
        ("ssh", 2), ("mqtt", 2), ("router", 2), ("switch", 2), ("latency", 2),
        ("offline", 2), ("telemetry", 2), ("lan", 2), ("ip", 2), ("port", 1),
    ],
}


def classify_fault_description(description: str, equipment_name: str = "") -> Dict[str, Any]:
    haystack = f"{equipment_name} {description}".lower()
    scores = {cat: 0 for cat in FAULT_CATEGORIES}
    matched = {cat: [] for cat in FAULT_CATEGORIES}

    for cat, terms in CATEGORY_KEYWORDS.items():
        for term, weight in terms:
            if re.search(rf"\b{re.escape(term)}\b", haystack, re.IGNORECASE):
                scores[cat] += weight
                matched[cat].append(term)

    max_score = max(scores[c] for c in FAULT_CATEGORIES if c != "Other")
    if max_score == 0:
        return {
            "category": "Other",
            "matchedKeywords": [],
            "scores": scores,
            "tieBroken": False,
            "explanation": "No specialized keywords matched; classified as Other.",
        }

    tied = [c for c in TIE_BREAK_ORDER if c != "Other" and scores[c] == max_score]
    selected = tied[0]
    tie_broken = len(tied) > 1
    explanation = (
        f"Tie at score {max_score} between {tied}. Safety-first precedence selected {selected}."
        if tie_broken
        else f"Classified as {selected} with score {max_score} (matched: {', '.join(matched[selected])})."
    )
    return {
        "category": selected,
        "matchedKeywords": matched[selected],
        "scores": scores,
        "tieBroken": tie_broken,
        "explanation": explanation,
    }


CRITICAL_HAZARD_TRIGGERS = [
    "fire", "smoke", "spark", "sparks", "arc flash", "gas leak", "toxic",
    "chemical spill", "radiation", "explosion", "electric shock", "biohazard",
    "cryogenic leak", "burning", "uncontrolled pressure", "bio-containment",
]

HIGH_IMPACT_TRIGGERS = [
    "complete failure", "cannot boot", "sample loss", "production halt",
    "system down", "leaking", "total outage", "unresponsive",
]


def determine_priority(urgency: str, description: str) -> Dict[str, Any]:
    lower_desc = (description or "").lower()
    hazards = [kw for kw in CRITICAL_HAZARD_TRIGGERS if re.search(rf"\b{re.escape(kw)}\b", lower_desc)]
    if hazards:
        return {
            "priority": "Critical",
            "hazardDetected": True,
            "triggerKeywords": hazards,
            "reason": f"Hazardous safety override triggered by {hazards}: escalated to Critical priority overriding {urgency}.",
        }
    if urgency == "Critical":
        return {
            "priority": "Critical",
            "hazardDetected": False,
            "triggerKeywords": [],
            "reason": "Assigned Critical based on reporter-declared Critical urgency.",
        }
    highs = [kw for kw in HIGH_IMPACT_TRIGGERS if re.search(rf"\b{re.escape(kw)}\b", lower_desc)]
    if highs and urgency in ("Medium", "Low"):
        return {
            "priority": "High",
            "hazardDetected": False,
            "triggerKeywords": highs,
            "reason": f"Elevated from {urgency} to High due to operational impact indicator {highs}.",
        }
    return {
        "priority": urgency,
        "hazardDetected": False,
        "triggerKeywords": [],
        "reason": f"Assigned {urgency} priority matching reporter urgency.",
    }


def sort_priority_queue(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    active = [r for r in reports if r.get("status") not in ("Resolved", "Rejected")]
    ordered = sorted(
        active,
        key=lambda r: (
            PRIORITY_RANK.get(r.get("priority", "Low"), 4),
            r.get("submittedAt", ""),
            r.get("id", ""),
        ),
    )
    result = []
    for idx, r in enumerate(ordered, start=1):
        copy = dict(r)
        copy["queueRank"] = idx
        copy["queueReason"] = (
            f"Position #{idx}: Priority {r['priority']} (tier {PRIORITY_RANK[r['priority']]}), "
            f"submitted {r['submittedAt']}, ID tie-break {r['id']}."
        )
        result.append(copy)
    return result


def evaluate_smart_routing(
    report_id: str,
    category: str,
    zone: str,
    priority: str,
    known_zones: List[str],
    routing_rules: List[Dict[str, Any]],
    handlers: List[Dict[str, Any]],
    existing_active_assignments: Optional[List[Dict[str, Any]]] = None,
    excluded_handler_ids: Optional[List[int]] = None,
) -> Dict[str, Any]:
    trace = []
    step = 1
    excluded = set(excluded_handler_ids or [])
    existing_active_assignments = existing_active_assignments or []

    existing = next((a for a in existing_active_assignments if a["reportId"] == report_id), None)
    if existing:
        trace.append({
            "step": step,
            "stage": "Duplicate Prevention Guard",
            "outcome": "blocked",
            "detail": f"Report {report_id} already has active assignment to Handler #{existing['handlerId']}.",
        })
        return {
            "assignedHandlerId": existing["handlerId"],
            "assignedHandlerName": next((h["name"] for h in handlers if h["id"] == existing["handlerId"]), None),
            "assignmentType": "manual",
            "status": "Assigned",
            "unknownZone": False,
            "duplicateBlocked": True,
            "escalate": False,
            "escalationReason": None,
            "explanation": f"Duplicate assignment prevented for {report_id}.",
            "trace": trace,
        }

    trace.append({
        "step": step,
        "stage": "Duplicate Prevention Guard",
        "outcome": "pass",
        "detail": f"No active assignment exists for {report_id}.",
    })
    step += 1

    norm_zone = (zone or "").strip().upper()
    is_known = norm_zone in [z.upper() for z in known_zones]
    trace.append({
        "step": step,
        "stage": "Laboratory Zone Lookup",
        "outcome": "pass" if is_known else "fallback",
        "detail": f"Verified zone {norm_zone}." if is_known else f"Unknown zone {zone}; checking wildcard rules.",
    })
    step += 1

    active_rules = [r for r in routing_rules if r.get("isActive")]
    exact = next((r for r in active_rules if r["category"] == category and r["zone"].upper() == norm_zone), None)
    wildcard = None if exact else next((r for r in active_rules if r["category"] == category and r["zone"] == "*"), None)
    matched = exact or wildcard

    if not matched:
        escalate = priority == "Critical" or not is_known
        esc_reason = f"Unassigned Critical/Unknown-zone report ({category} in {norm_zone})." if escalate else None
        trace.append({
            "step": step,
            "stage": "Routing Table Lookup",
            "outcome": "blocked",
            "detail": f"No active rule matched ({category}, {norm_zone}) or wildcard.",
        })
        return {
            "assignedHandlerId": None,
            "assignedHandlerName": None,
            "assignmentType": "queued",
            "status": "Queued",
            "unknownZone": not is_known,
            "duplicateBlocked": False,
            "escalate": escalate,
            "escalationReason": esc_reason,
            "explanation": esc_reason or f"No rule matched ({category}, {norm_zone}); placed in queue.",
            "trace": trace,
        }

    trace.append({
        "step": step,
        "stage": "Routing Table Lookup",
        "outcome": "pass" if exact else "fallback",
        "detail": f"Matched rule #{matched['id']} ({matched['category']}, {matched['zone']}).",
    })
    step += 1

    primary = next((h for h in handlers if h["id"] == matched["primaryHandlerId"]), None)
    if primary and primary["id"] not in excluded and primary["isAvailable"] and primary["currentLoad"] < primary["maxCapacity"]:
        trace.append({
            "step": step,
            "stage": "Primary Handler Evaluation",
            "outcome": "pass",
            "detail": f"Assigned primary handler {primary['name']} (load {primary['currentLoad']}/{primary['maxCapacity']}).",
        })
        return {
            "assignedHandlerId": primary["id"],
            "assignedHandlerName": primary["name"],
            "assignmentType": "primary",
            "status": "Assigned",
            "unknownZone": not is_known,
            "duplicateBlocked": False,
            "escalate": False,
            "escalationReason": None,
            "explanation": f"Assigned to primary handler {primary['name']}.",
            "trace": trace,
        }

    trace.append({
        "step": step,
        "stage": "Primary Handler Evaluation",
        "outcome": "fallback",
        "detail": "Primary handler unavailable, excluded, or at capacity. Checking backup.",
    })
    step += 1

    backup = next((h for h in handlers if h["id"] == matched.get("backupHandlerId")), None)
    if backup and backup["id"] not in excluded and backup["isAvailable"] and backup["currentLoad"] < backup["maxCapacity"]:
        trace.append({
            "step": step,
            "stage": "Backup Handler Fallback",
            "outcome": "pass",
            "detail": f"Assigned backup handler {backup['name']} (load {backup['currentLoad']}/{backup['maxCapacity']}).",
        })
        return {
            "assignedHandlerId": backup["id"],
            "assignedHandlerName": backup["name"],
            "assignmentType": "backup",
            "status": "Assigned",
            "unknownZone": not is_known,
            "duplicateBlocked": False,
            "escalate": False,
            "escalationReason": None,
            "explanation": f"Primary unavailable/full; assigned backup handler {backup['name']}.",
            "trace": trace,
        }

    escalate = priority == "Critical"
    esc_reason = f"Unassigned Critical report ({category} in {zone}): no available handler." if escalate else None
    trace.append({
        "step": step,
        "stage": "Queue & Escalation",
        "outcome": "escalate" if escalate else "fallback",
        "detail": esc_reason or "All handlers unavailable or at capacity; queued.",
    })
    return {
        "assignedHandlerId": None,
        "assignedHandlerName": None,
        "assignmentType": "queued",
        "status": "Queued",
        "unknownZone": not is_known,
        "duplicateBlocked": False,
        "escalate": escalate,
        "escalationReason": esc_reason,
        "explanation": esc_reason or "All handlers unavailable or at capacity; placed in queue.",
        "trace": trace,
    }
