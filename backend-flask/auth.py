"""
LABCARE Flask Authentication & Role-Based Access Control (RBAC)
"""

from datetime import datetime, timedelta, timezone
from functools import wraps
import os
from flask import g, jsonify, request
import jwt

JWT_SECRET = os.environ.get("JWT_SECRET", "labcare-flask-academic-secret-2026")


def issue_token(user_row) -> str:
    payload = {
        "userId": user_row["id"],
        "email": user_row["email"],
        "name": user_row["name"],
        "role": user_row["role"],
        "department": user_row["department"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication required."}), 401
        token = auth_header[7:]
        try:
            g.user = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError:
            return jsonify({"error": "Invalid or expired token."}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_roles(*roles):
    def decorator(fn):
        @wraps(fn)
        @require_auth
        def wrapper(*args, **kwargs):
            if g.user.get("role") not in roles:
                return jsonify({"error": f"Access denied. Required role: {' or '.join(roles)}"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
