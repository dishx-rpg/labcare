# LABCARE — Intelligent Laboratory Equipment Fault Reporter & Smart Dispatch System

LABCARE is a full-stack academic engineering platform for reporting laboratory equipment faults, validating structured asset identifiers with a Deterministic Finite Automaton (DFA) and equivalent Regular Expression, classifying faults deterministically, enforcing safety-critical priority overrides, and routing tickets atomically to available specialists.

---

## Architecture Overview

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, React Router, Framer Motion (`motion/react`), Recharts, Lucide React.
- **Live Preview Runtime**: Node.js + Express (`server.ts`) with persistent SQLite (`better-sqlite3`), bcrypt password hashing (`bcryptjs`), and signed JWT authentication (`jsonwebtoken`).
- **Academic Submission Backend**: Standalone Python Flask + SQLite backend in `backend-flask/` implementing identical REST API contracts, database schema, and deterministic algorithms.

---

## Core Algorithms Explained

### 1. Deterministic Finite Automaton (DFA) & Regular Expression Validation
- **Format**: `LAB-<ZONE>-<CAT>-<NNN>` (14 characters, e.g., `LAB-CH-SPK-042`)
- **Equivalent Regex**: `^LAB-[A-Z]{2}-[A-Z]{3}-[0-9]{3}$`
- **Formal 5-Tuple** $M = (Q, \Sigma, \delta, q_0, F)$:
  - $Q = \{q_0, q_1, \dots, q_{14}, q_{\text{dead}}\}$
  - $q_0$: Start state
  - $F = \{q_{14}\}$: Single accepting state after 14 valid transitions
  - $q_{\text{dead}}$: Trap state for any invalid symbol or trailing character beyond length 14
- Every input is validated by **both** the DFA transition table and the Regular Expression, verifying 100% parity and explaining the exact transition index on rejection.

### 2. Deterministic Fault Classification
- **Categories**: `Electrical`, `Mechanical`, `Software`, `Network/Connectivity`, `Other`
- Weighted keyword dictionaries score multi-word safety/diagnostic phrases higher than generic single terms.
- **Conflict Resolution**: When multiple categories tie at the highest positive score, ties are broken deterministically via safety-first precedence:
  `Electrical > Mechanical > Network/Connectivity > Software > Other`.
- Authorized Handlers and Administrators can manually override the predicted category with an audited explanation.

### 3. Priority Determination & Hazard Override
- **Levels**: `Critical`, `High`, `Medium`, `Low`
- **Safety Override**: Hazardous keywords (`fire`, `smoke`, `spark`, `gas leak`, `toxic`, `chemical spill`, `radiation`, `cryogenic leak`, `arc flash`, etc.) immediately force `Critical` priority regardless of reporter-selected urgency.
- **Operational Impact**: Severe outage keywords (`complete failure`, `cannot boot`, `sample loss`, `system down`) elevate `Low`/`Medium` urgency to `High`.

### 4. Smart Routing & Concurrency-Safe Assignment
- Evaluates:
  1. **Duplicate Prevention Guard**: Blocks re-assigning a report with an active assignment.
  2. **Zone Verification**: Detects unknown laboratory zones and falls back to wildcard (`*`) rules or queues/escalates.
  3. **Primary Handler Check**: Requires `isAvailable == true` and `currentLoad < maxCapacity`.
  4. **Backup Handler Fallback**: Automatically selects the backup handler when primary is offline, full, or rejected.
  5. **Queueing & Critical Escalation**: Queues reports when no handler has capacity and opens an SLA Escalation for unassigned `Critical` incidents.
- **Simultaneous Submission Safety**: Wrapped inside an immediate SQLite write transaction (`db.transaction(...)` in Node.js / `BEGIN IMMEDIATE` in Flask) so concurrent submissions cannot oversubscribe a handler beyond `maxCapacity`.

### 5. Deterministic Priority Queue
- Strictly ordered by:
  1. Priority tier (`Critical = 1`, `High = 2`, `Medium = 3`, `Low = 4`)
  2. Submission timestamp (FIFO ascending)
  3. Report ID (lexicographical ascending tie-breaker)

---

## Running the Live Application (Node.js)

```bash
npm install
npm run dev       # Starts Express + Vite on port 3000
npm run lint      # TypeScript type-check
npm run build     # Production Vite bundle
```

## Running the Academic Python Flask Backend

See [`backend-flask/README.md`](backend-flask/README.md) for virtual environment setup, `python app.py`, and `pytest tests_suite.py -v`.

---

## Demo Accounts (Password: `LabCare2026!`)

| Role | Email | Capabilities |
| :--- | :--- | :--- |
| **Reporter** | `reporter@labcare.edu` | Submit faults, live DFA validation, track report timeline & notes |
| **Handler** | `handler@labcare.edu` | Availability/capacity controls, accept/reject (auto-reroute), resolve faults |
| **Administrator** | `admin@labcare.edu` | Command center, routing rules, zones/categories, user roles, CSV export |
