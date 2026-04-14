"""
Library Seat Booking System - Flask Backend
==========================================
Run:  python app.py
API base: http://localhost:5000/api
"""

from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3, hashlib, os, time, secrets

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))

# Allow all localhost origins (handles any Live Server port)
# Read allowed origins from environment (comma-separated list)
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
_prod_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
_dev_origins = [
    "http://localhost:5500", "http://127.0.0.1:5500",
    "http://localhost:5501", "http://127.0.0.1:5501",
    "http://localhost:5502", "http://127.0.0.1:5502",
    "http://localhost:3000", "http://127.0.0.1:3000",
    "null"
]
CORS(app, supports_credentials=True, origins=_prod_origins + _dev_origins)

DB = os.path.join(os.path.dirname(__file__), "library.db")

# -----------------------------------------
# DB HELPERS
# -----------------------------------------
def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def now_ms():
    return int(time.time() * 1000)

# -----------------------------------------
# INIT DB
# -----------------------------------------
def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                prn      TEXT UNIQUE NOT NULL,
                name     TEXT NOT NULL,
                email    TEXT,
                password TEXT NOT NULL,
                role     TEXT DEFAULT 'student'
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token    TEXT PRIMARY KEY,
                user_id  INTEGER NOT NULL,
                created  INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS bookings (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                prn        TEXT NOT NULL,
                seat_id    TEXT NOT NULL,
                floor      INTEGER NOT NULL,
                start_time INTEGER NOT NULL,
                end_time   INTEGER NOT NULL,
                cancelled  INTEGER DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS admins (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name     TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS admin_tokens (
                token    TEXT PRIMARY KEY,
                admin_id INTEGER NOT NULL,
                created  INTEGER NOT NULL,
                FOREIGN KEY(admin_id) REFERENCES admins(id)
            );
        """)

        # Seed demo students
        existing = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if existing == 0:
            demo_users = [
                ("1234567", "Aarav Sharma",  "aarav@rit.edu",  hash_pw("pass123"), "student"),
                ("2345678", "Priya Mehta",   "priya@rit.edu",  hash_pw("pass123"), "student"),
                ("3456789", "Rohit Patil",   "rohit@rit.edu",  hash_pw("pass123"), "student"),
            ]
            conn.executemany(
                "INSERT INTO users (prn, name, email, password, role) VALUES (?,?,?,?,?)",
                demo_users
            )

        # Seed admin accounts
        existing_admins = conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0]
        if existing_admins == 0:
            conn.executemany(
                "INSERT INTO admins (username, password, name) VALUES (?,?,?)",
                [
                    ("librarian", hash_pw("lib@RIT2026"), "Library Admin"),
                    ("faculty1",  hash_pw("fac@RIT2026"), "Faculty Member"),
                ]
            )
        conn.commit()

    print("✅  Database ready:", DB)
    print("👨‍🎓 Student  → PRN: 1234567  Password: pass123")
    print("🔑  Admin    → Username: librarian  Password: lib@RIT2026")

# -----------------------------------------
# TOKEN AUTH HELPERS
# -----------------------------------------
def make_token(user_id):
    token = secrets.token_hex(32)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO tokens (token, user_id, created) VALUES (?,?,?)",
            (token, user_id, now_ms())
        )
        conn.commit()
    return token

def make_admin_token(admin_id):
    token = secrets.token_hex(32)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO admin_tokens (token, admin_id, created) VALUES (?,?,?)",
            (token, admin_id, now_ms())
        )
        conn.commit()
    return token

def get_current_user():
    """Try session first, then Authorization header token."""
    uid = session.get("user_id")
    if uid:
        with get_db() as conn:
            return conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        with get_db() as conn:
            row = conn.execute(
                "SELECT u.* FROM tokens t JOIN users u ON t.user_id=u.id WHERE t.token=?",
                (token,)
            ).fetchone()
        return row
    return None

def get_current_admin():
    """Try session first, then Authorization header token."""
    aid = session.get("admin_id")
    if aid:
        with get_db() as conn:
            return conn.execute("SELECT * FROM admins WHERE id=?", (aid,)).fetchone()
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        with get_db() as conn:
            row = conn.execute(
                "SELECT a.* FROM admin_tokens t JOIN admins a ON t.admin_id=a.id WHERE t.token=?",
                (token,)
            ).fetchone()
        return row
    return None

# -----------------------------------------
# STUDENT AUTH
# -----------------------------------------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    prn  = (data.get("prn") or "").strip()
    pw   = data.get("password") or ""
    if not prn or not pw:
        return jsonify({"ok": False, "error": "PRN and password are required."}), 400
    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE prn=? AND password=?",
            (prn, hash_pw(pw))
        ).fetchone()
    if not user:
        with get_db() as conn:
            exists = conn.execute("SELECT id FROM users WHERE prn=?", (prn,)).fetchone()
        if exists:
            return jsonify({"ok": False, "error": "Incorrect password."}), 401
        else:
            return jsonify({"ok": False, "error": "No account found. Please register first."}), 401
    session["user_id"] = user["id"]
    token = make_token(user["id"])
    return jsonify({
        "ok": True,
        "token": token,
        "user": {
            "id":    user["id"],
            "prn":   user["prn"],
            "name":  user["name"],
            "email": user["email"],
            "role":  user["role"]
        }
    })

@app.route("/api/register", methods=["POST"])
def register():
    data  = request.get_json()
    prn   = (data.get("prn") or "").strip()
    name  = (data.get("name") or "").strip()
    pw    = data.get("password") or ""
    email = (data.get("email") or f"{prn}@rit.edu").strip()
    if not prn or not name or not pw:
        return jsonify({"ok": False, "error": "PRN, name, and password are required."}), 400
    if len(prn) != 7 or not prn.isdigit():
        return jsonify({"ok": False, "error": "PRN must be exactly 7 digits."}), 400
    if len(pw) < 6:
        return jsonify({"ok": False, "error": "Password must be at least 6 characters."}), 400
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (prn, name, email, password, role) VALUES (?,?,?,?,?)",
                (prn, name, email, hash_pw(pw), "student")
            )
            conn.commit()
            user = conn.execute("SELECT * FROM users WHERE prn=?", (prn,)).fetchone()
    except sqlite3.IntegrityError:
        return jsonify({"ok": False, "error": "This PRN is already registered."}), 409
    session["user_id"] = user["id"]
    token = make_token(user["id"])
    return jsonify({
        "ok": True,
        "token": token,
        "user": {
            "id":    user["id"],
            "prn":   user["prn"],
            "name":  user["name"],
            "email": user["email"],
            "role":  user["role"]
        }
    })

@app.route("/api/logout", methods=["POST"])
def logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        with get_db() as conn:
            conn.execute("DELETE FROM tokens WHERE token=?", (token,))
            conn.commit()
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me", methods=["GET"])
def me():
    user = get_current_user()
    if not user:
        return jsonify({"ok": False, "error": "Not logged in"}), 401
    return jsonify({"ok": True, "user": dict(user)})

# -----------------------------------------
# ADMIN AUTH
# -----------------------------------------
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data     = request.get_json()
    username = (data.get("username") or "").strip()
    pw       = data.get("password") or ""
    if not username or not pw:
        return jsonify({"ok": False, "error": "Username and password required."}), 400
    with get_db() as conn:
        admin = conn.execute(
            "SELECT * FROM admins WHERE username=? AND password=?",
            (username, hash_pw(pw))
        ).fetchone()
    if not admin:
        return jsonify({"ok": False, "error": "Invalid credentials."}), 401
    session["admin_id"] = admin["id"]
    token = make_admin_token(admin["id"])
    return jsonify({
        "ok":    True,
        "token": token,
        "admin": {"id": admin["id"], "username": admin["username"], "name": admin["name"]}
    })

@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        with get_db() as conn:
            conn.execute("DELETE FROM admin_tokens WHERE token=?", (token,))
            conn.commit()
    session.clear()
    return jsonify({"ok": True})

# -----------------------------------------
# SEAT / BOOKING ROUTES
# -----------------------------------------
@app.route("/api/seats", methods=["GET"])
def seats():
    floor = request.args.get("floor", type=int)
    n = now_ms()
    with get_db() as conn:
        query = """
            SELECT b.id, b.seat_id, b.floor, b.start_time, b.end_time, b.prn, u.name
            FROM bookings b JOIN users u ON b.user_id = u.id
            WHERE b.cancelled=0 AND b.end_time > ?
        """
        params = [n]
        if floor:
            query += " AND b.floor=?"
            params.append(floor)
        rows = conn.execute(query, params).fetchall()
    return jsonify({"ok": True, "bookings": [dict(r) for r in rows]})

@app.route("/api/book", methods=["POST"])
def book():
    user = get_current_user()
    if not user:
        return jsonify({"ok": False, "error": "Login required"}), 401
    data     = request.get_json()
    seat_id  = data.get("seat_id")
    floor    = data.get("floor")
    duration = data.get("duration_minutes")
    if not seat_id or not floor or not duration:
        return jsonify({"ok": False, "error": "Missing seat_id, floor, or duration_minutes."}), 400
    n        = now_ms()
    end_time = n + int(duration) * 60000
    with get_db() as conn:
        # Max 1 active booking per student
        user_active = conn.execute(
            "SELECT COUNT(*) FROM bookings WHERE user_id=? AND cancelled=0 AND end_time>?",
            (user["id"], n)
        ).fetchone()[0]
        if user_active >= 1:
            return jsonify({"ok": False, "error": "You already have an active booking. Cancel it first."}), 409
        # Seat must be free
        conflict = conn.execute(
            "SELECT id FROM bookings WHERE seat_id=? AND cancelled=0 AND end_time>?",
            (seat_id, n)
        ).fetchone()
        if conflict:
            return jsonify({"ok": False, "error": "That seat is already booked."}), 409
        conn.execute(
            "INSERT INTO bookings (user_id, prn, seat_id, floor, start_time, end_time) VALUES (?,?,?,?,?,?)",
            (user["id"], user["prn"], seat_id, floor, n, end_time)
        )
        conn.commit()
    return jsonify({"ok": True, "end_time": end_time, "message": f"Seat {seat_id} booked."})

@app.route("/api/cancel", methods=["POST"])
def cancel():
    user = get_current_user()
    if not user:
        return jsonify({"ok": False, "error": "Login required"}), 401
    seat_id = (request.get_json() or {}).get("seat_id")
    n = now_ms()
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM bookings WHERE seat_id=? AND user_id=? AND cancelled=0 AND end_time>?",
            (seat_id, user["id"], n)
        ).fetchone()
        if not row:
            return jsonify({"ok": False, "error": "Booking not found or not yours."}), 404
        conn.execute("UPDATE bookings SET cancelled=1 WHERE id=?", (row["id"],))
        conn.commit()
    return jsonify({"ok": True, "message": "Booking cancelled."})

@app.route("/api/my-bookings", methods=["GET"])
def my_bookings():
    user = get_current_user()
    if not user:
        return jsonify({"ok": False, "error": "Login required"}), 401
    n = now_ms()
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, seat_id, floor, start_time, end_time FROM bookings WHERE user_id=? AND cancelled=0 AND end_time>? ORDER BY end_time ASC",
            (user["id"], n)
        ).fetchall()
    return jsonify({"ok": True, "bookings": [dict(r) for r in rows]})

# -----------------------------------------
# ADMIN PANEL ROUTES
# -----------------------------------------
@app.route("/api/admin/bookings", methods=["GET"])
def admin_bookings():
    if not get_current_admin():
        return jsonify({"ok": False, "error": "Admin login required."}), 403
    n = now_ms()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT b.id, b.seat_id, b.floor, b.start_time, b.end_time, b.prn, u.name
               FROM bookings b JOIN users u ON b.user_id = u.id
               WHERE b.cancelled=0 AND b.end_time > ?
               ORDER BY b.end_time ASC""", (n,)
        ).fetchall()
    return jsonify({"ok": True, "bookings": [dict(r) for r in rows]})

@app.route("/api/admin/force-cancel", methods=["POST"])
def admin_force_cancel():
    if not get_current_admin():
        return jsonify({"ok": False, "error": "Admin login required."}), 403
    booking_id = (request.get_json() or {}).get("booking_id")
    if not booking_id:
        return jsonify({"ok": False, "error": "booking_id required."}), 400
    with get_db() as conn:
        row = conn.execute("SELECT * FROM bookings WHERE id=?", (booking_id,)).fetchone()
        if not row:
            return jsonify({"ok": False, "error": "Booking not found."}), 404
        conn.execute("UPDATE bookings SET cancelled=1 WHERE id=?", (booking_id,))
        conn.commit()
    return jsonify({"ok": True, "message": "Booking cancelled by admin."})

@app.route("/api/admin/all-students", methods=["GET"])
def admin_all_students():
    if not get_current_admin():
        return jsonify({"ok": False, "error": "Admin login required."}), 403
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, prn, name, email FROM users ORDER BY prn"
        ).fetchall()
    return jsonify({"ok": True, "students": [dict(r) for r in rows]})

from flask import send_from_directory

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)
# -----------------------------------------
# RUN
# -----------------------------------------
if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "production") != "production"
    print(f"🚀  Server → http://localhost:{port}")
    app.run(debug=debug, host="0.0.0.0", port=port)
