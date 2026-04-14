# 📚 RIT Library Seat Booking System

## Files
```
index.html          — Homepage
login.html          — Student login
register.html       — Student registration
booking.html        — Seat booking interface
aboutUs.html        — About page
admin-login.html    — Admin login
admin.html          — Admin dashboard
app.py              — Flask backend (Python)
booking.js          — Booking page logic
nav-profile.js      — Shared navbar/footer logic
booking.css         — Booking page styles
nav-profile.css     — Shared navbar/footer styles
requirements.txt    — Python dependencies
```

## Setup & Run

### 1. Start the Backend
```bash
pip install -r requirements.txt
python app.py
```
Server runs at: http://localhost:5000

### 2. Open the Frontend
Open `index.html` with VS Code Live Server (right-click → Open with Live Server)
OR open directly in your browser.

## Demo Credentials

| Role     | Username/PRN | Password     |
|----------|-------------|--------------|
| Student  | 1234567     | pass123      |
| Student  | 2345678     | pass123      |
| Admin    | librarian   | lib@RIT2026  |
| Admin    | faculty1    | fac@RIT2026  |

## Bug Fixes Applied
1. **nav-profile.js** — Renamed from `nav-profilr.js` (typo). Renamed `API` constant to `NAV_API` to avoid conflict with booking.js
2. **booking.js** — Renamed `API` constant to `BOOKING_API` to avoid conflict with nav-profile.js
3. **All HTML files** — Fixed nav links from `pr8.html` → `index.html` (homepage renamed)
4. **login.html / register.html** — Fixed redirect after login to go to `index.html`
5. **admin-login.html** — Fixed: now saves `adminToken` to localStorage (was missing)
6. **admin.html** — Fixed `API` constant renamed to `ADMIN_API`; reads `adminToken` correctly
7. **admin-login.html** — Renamed `API` → `ADMIN_LOGIN_API`
8. **register.html** — Renamed `API` → `REG_API`
9. **login.html** — Renamed `API` → `LOGIN_API`
10. **index.html slider** — Fixed: slider counter div was being counted as a slide
11. **aboutUs.html** — Added `onerror` fallback for missing library image
12. **app.py** — Cleaned up (was valid, preserved as-is with minor formatting)
13. **booking.html** — Fixed script load order (booking.js before nav-profile.js)
