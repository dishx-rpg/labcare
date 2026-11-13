# LABCARE Python Flask + SQLite Backend (Academic Submission)

This directory contains the standalone Python **Flask + SQLite** implementation of the LABCARE backend, mirroring the exact REST API contracts, database schema, password hashing, RBAC, and deterministic algorithms used in the live Node.js runtime.

## Local Setup & Execution

1. Navigate to the Flask backend directory:
   ```bash
   cd backend-flask
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the Flask development server (port `5000`):
   ```bash
   python app.py
   ```
   On startup, `init_db()` creates `labcare_flask.db` and seeds the demo accounts (`reporter@labcare.edu`, `handler@labcare.edu`, `admin@labcare.edu`, password `LabCare2026!`), laboratory zones, categories, routing rules, and sample fault report.

## Running Automated Tests

```bash
pytest tests_suite.py -v
```
