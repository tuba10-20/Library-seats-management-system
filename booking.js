// ── CONFIG ──
const BOOKING_API = "https://library-seats-management-system.onrender.com";

// ── AUTH HELPERS ──
function getUser()  { try { return JSON.parse(localStorage.getItem("libraryUser")); } catch { return null; } }
function getToken() { return localStorage.getItem("authToken") || ""; }
function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getToken()}`
  };
}

// ── STATE ──
const state = {
  floor: 1,
  selected: null,
  bookings: {},   // { seatId: { active, endTime, totalMs, mine, bookingId } }
  timers:   {},
  pendingCancel: null,
  animating: false,
  myBooking: null   // the ONE seat this user has booked (seat_id or null)
};

// ── SEAT LAYOUT (matches reference image) ──
// Left:   row of 6, row of 6, gap, row of 3, row of 3, row of 3, row of 3, row of 3
// Centre: 9-wide rows x4
// Right:  row of 6, row of 6, gap, row of 3, row of 3, row of 3, row of 3, row of 3
// Numbering matches reference: Left 1-27, Centre 31-69, Right 71-100

let seatCounter = 0;

function seatId(floor, label) {
  return `F${floor}-S${label}`;
}

// ── SYNC FROM SERVER (called on load + every 30s) ──
async function syncSeatsFromServer() {
  try {
    const res  = await fetch(`${BOOKING_API}/seats?floor=${state.floor}`, {
      credentials: "include",
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!data.ok) return;

    const now  = Date.now();
    const user = getUser();

    // Reset bookings for this floor before repopulating
    Object.keys(state.bookings).forEach(k => {
      if (k.startsWith(`F${state.floor}-`)) delete state.bookings[k];
    });

    state.myBooking = null;

    data.bookings.forEach(b => {
      if (b.end_time <= now) return;
      const mine = user && b.prn === user.prn;
      state.bookings[b.seat_id] = {
        active:    true,
        endTime:   b.end_time,
        totalMs:   b.end_time - b.start_time,
        bookingId: b.id,
        mine
      };
      if (mine) {
        state.myBooking = b.seat_id;
        if (!state.timers[b.seat_id]) startTimer(b.seat_id);
      }
    });

    // Also restore myBooking from ALL floors (not just current)
    if (!state.myBooking && user) {
      try {
        const r2   = await fetch(`${BOOKING_API}/api/my-bookings`, {
          credentials: "include",
          headers: { "Authorization": `Bearer ${getToken()}` }
        });
        const d2   = await r2.json();
        if (d2.ok && d2.bookings.length > 0) {
          const b = d2.bookings[0];   // only 1 allowed
          state.myBooking = b.seat_id;
          // Add to state.bookings if on current floor
          if (b.floor === state.floor) {
            state.bookings[b.seat_id] = {
              active:  true,
              endTime: b.end_time,
              totalMs: b.end_time - b.start_time,
              mine:    true,
              bookingId: b.id
            };
            if (!state.timers[b.seat_id]) startTimer(b.seat_id);
          }
        }
      } catch (_) {}
    }

    renderHall();
    updatePanel();
    renderActivePanel();

  } catch (e) {
    console.warn("Seat sync failed (backend may be offline):", e.message);
    // Load from localStorage cache so other users can still see booked seats
    loadOfflineBookings();
    renderHall();
    updatePanel();
    renderActivePanel();
  }
}

// ── OFFLINE BOOKING CACHE (localStorage) ──
function saveOfflineBookings() {
  const active = {};
  const now = Date.now();
  Object.entries(state.bookings).forEach(([id, b]) => {
    if (b.endTime > now) active[id] = { endTime: b.endTime, totalMs: b.totalMs, prn: b.prn || null };
  });
  localStorage.setItem("offlineBookings", JSON.stringify(active));
}

function loadOfflineBookings() {
  try {
    const raw = localStorage.getItem("offlineBookings");
    if (!raw) return;
    const saved = JSON.parse(raw);
    const now   = Date.now();
    const user  = getUser();
    Object.entries(saved).forEach(([id, b]) => {
      if (b.endTime <= now) return;           // expired, skip
      if (state.bookings[id]) return;         // server data takes priority
      const mine = user && b.prn === user.prn;
      state.bookings[id] = { active: true, endTime: b.endTime, totalMs: b.totalMs, mine, prn: b.prn };
      if (mine && !state.myBooking) {
        state.myBooking = id;
        startTimer(id);
      }
    });
  } catch (_) {}
}

// ── RENDER HALL ──
function makeSeat(num, floor) {
  const id   = seatId(floor, num);
  const seat = document.createElement("div");
  seat.className   = "seat";
  seat.dataset.id  = id;
  seat.title       = `Seat ${num}`;
  seat.textContent = num;
  const booking = state.bookings[id];
  if (booking) {
    if (booking.mine) { seat.classList.add("active-timer"); seat.title += " — your booking"; }
    else              { seat.classList.add("booked"); }
  } else if (state.selected === id) {
    seat.classList.add("selected");
  }
  seat.onclick = () => selectSeat(id);
  return seat;
}

function makeRow(nums, floor) {
  const row = document.createElement("div");
  row.className = "row";
  nums.forEach(n => row.appendChild(makeSeat(n, floor)));
  return row;
}

function makeSofa() {
  const wrap = document.createElement("div");
  wrap.className = "sofa-wrap";
  wrap.innerHTML = `
    <div class="sofa">
      <div class="sofa-back"></div>
      <div class="sofa-seat-row">
        <div class="sofa-cushion"></div>
        <div class="sofa-cushion"></div>
      </div>
      <div class="sofa-arm sofa-arm-left"></div>
      <div class="sofa-arm sofa-arm-right"></div>
    </div>
    <span class="sofa-label">sofa</span>`;
  return wrap;
}

function renderHall() {
  const hall = document.getElementById("hall");
  hall.innerHTML = "";
  const f = state.floor;

  // ── LEFT SECTION ──
  const left = document.createElement("div");
  left.className = "section";
  left.innerHTML = '<div class="section-label">LEFT</div>';
  // top cluster: 1-6, 7-12
  const lcTop = document.createElement("div"); lcTop.className = "cluster";
  lcTop.appendChild(makeRow([1,2,3,4,5,6], f));
  lcTop.appendChild(makeRow([7,8,9,10,11,12], f));
  left.appendChild(lcTop);
  // sofa + bottom cluster side by side
  const lMid = document.createElement("div"); lMid.className = "section-mid";
  const lcBot = document.createElement("div"); lcBot.className = "cluster";
  lcBot.appendChild(makeRow([13,14,15], f));
  lcBot.appendChild(makeRow([16,17,18], f));
  lcBot.appendChild(makeRow([19,20,21], f));
  lcBot.appendChild(makeRow([25,26,27], f));
  lMid.appendChild(lcBot);
  lMid.appendChild(makeSofa());
  left.appendChild(lMid);
  hall.appendChild(left);

  // ── CENTRE SECTION ──
  const centre = document.createElement("div");
  centre.className = "section";
  centre.innerHTML = '<div class="section-label">CENTRE</div>';
  const pillTop = document.createElement("div"); pillTop.className = "pillars-row";
  pillTop.innerHTML = '<div class="pillar"></div><div class="pillar"></div><div class="pillar"></div>';
  centre.appendChild(pillTop);
  const cc = document.createElement("div"); cc.className = "cluster";
  cc.appendChild(makeRow([31,32,33,34,35,36,37,38,39], f));
  cc.appendChild(makeRow([41,42,43,44,45,46,47,48,49], f));
  cc.appendChild(makeRow([51,52,53,54,55,56,57,58,59], f));
  cc.appendChild(makeRow([61,62,63,64,65,66,67,68,69], f));
  centre.appendChild(cc);
  const pillBot = document.createElement("div"); pillBot.className = "pillars-row";
  pillBot.innerHTML = '<div class="pillar"></div><div class="pillar"></div>';
  centre.appendChild(pillBot);
  hall.appendChild(centre);

  // ── RIGHT SECTION ──
  const right = document.createElement("div");
  right.className = "section";
  right.innerHTML = '<div class="section-label">RIGHT</div>';
  const rcTop = document.createElement("div"); rcTop.className = "cluster";
  rcTop.appendChild(makeRow([71,72,73,74,75,76], f));
  rcTop.appendChild(makeRow([77,78,79,80,81,82], f));
  right.appendChild(rcTop);
  const rMid = document.createElement("div"); rMid.className = "section-mid";
  rMid.appendChild(makeSofa());
  const rcBot = document.createElement("div"); rcBot.className = "cluster";
  rcBot.appendChild(makeRow([83,84,85], f));
  rcBot.appendChild(makeRow([86,87,88], f));
  rcBot.appendChild(makeRow([92,93,94], f));
  rcBot.appendChild(makeRow([98,99,100], f));
  rMid.appendChild(rcBot);
  right.appendChild(rMid);
  hall.appendChild(right);
}

// ── SELECT SEAT ──
function selectSeat(id) {
  if (state.bookings[id]) return;
  if (!getUser()) {
    window.location.href = "login.html";
    return;
  }
  // Block selection if user already has a booking
  if (state.myBooking) {
    showToast("You already have an active booking. Cancel it first.", "error");
    return;
  }
  state.selected = state.selected === id ? null : id;
  renderHall();
  updatePanel();
}

// ── UPDATE BOOKING PANEL ──
function updatePanel() {
  const info = document.getElementById("sel-info");
  const btn  = document.getElementById("book-btn");

  // If user already has a booking, disable the panel
  if (state.myBooking) {
    const onThisFloor = state.bookings[state.myBooking];
    if (onThisFloor) {
      info.innerHTML = `your booking: <span>${state.myBooking}</span> — cancel below to rebook`;
    } else {
      info.innerHTML = `you have an active booking on another floor`;
    }
    btn.disabled = true;
    return;
  }

  if (state.selected) {
    const el  = document.querySelector(`.seat[data-id="${state.selected}"]`);
    const num = el ? el.textContent : "";
    info.innerHTML = `seat <span>#${num} — ${state.selected}</span> selected`;
    btn.disabled = false;
  } else {
    info.innerHTML = "no seat selected — click one above";
    btn.disabled = true;
  }
}

// ── CUSTOM DURATION ──
function handleDurChange() {
  const sel  = document.getElementById("dur-select");
  const wrap = document.getElementById("custom-dur-wrap");
  sel.value === "custom" ? wrap.classList.add("visible") : wrap.classList.remove("visible");
  if (sel.value === "custom") document.getElementById("custom-minutes").focus();
}

function getSelectedDuration() {
  const sel = document.getElementById("dur-select");
  if (sel.value === "custom") {
    const mins = parseInt(document.getElementById("custom-minutes").value);
    return (!mins || mins < 1) ? null : mins;
  }
  return parseInt(sel.value);
}

// ── BOOK SEAT ──
async function bookSeat() {
  const id = state.selected;
  if (!id) return;

  if (state.myBooking) {
    showToast("Cancel your current booking first.", "error");
    return;
  }

  const dur = getSelectedDuration();
  if (!dur) {
    document.getElementById("custom-minutes").style.borderColor = "#e63946";
    document.getElementById("custom-minutes").focus();
    return;
  }

  document.getElementById("custom-minutes").style.borderColor = "";

  const btn = document.getElementById("book-btn");
  btn.disabled    = true;
  btn.textContent = "booking...";

  try {
    const res  = await fetch(`${BOOKING_API}/book`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify({ seat_id: id, floor: state.floor, duration_minutes: dur }),
      signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();

    if (!data.ok) {
      showToast(data.error || "Booking failed.", "error");
      btn.disabled    = false;
      btn.textContent = "confirm booking";
      return;
    }

    // Success
    const now     = Date.now();
    const endTime = data.end_time || (now + dur * 60000);
    state.bookings[id] = {
      active:  true,
      endTime, mine: true,
      totalMs: endTime - now
    };
    state.myBooking = id;
    state.selected  = null;
    startTimer(id);
    renderHall();
    updatePanel();
    renderActivePanel();
    showToast("Seat booked! It stays booked even if you close this page.", "success");

  } catch (_) {
    // Offline fallback — book locally and persist to localStorage
    const now     = Date.now();
    const endTime = now + dur * 60000;
    const user    = getUser();
    state.bookings[id] = { active: true, endTime, mine: true, totalMs: dur * 60000, prn: user ? user.prn : null };
    state.myBooking    = id;
    state.selected     = null;
    saveOfflineBookings();
    startTimer(id);
    renderHall();
    updatePanel();
    renderActivePanel();
    showToast("Booked locally (backend offline). Start the server to persist.", "info");
  }

  btn.disabled    = false;
  btn.textContent = "confirm booking";
}

// ── TIMER ──
function startTimer(id) {
  if (state.timers[id]) clearInterval(state.timers[id]);
  state.timers[id] = setInterval(() => {
    if (!state.bookings[id]) { clearInterval(state.timers[id]); return; }
    if (Date.now() >= state.bookings[id].endTime) {
      delete state.bookings[id];
      clearInterval(state.timers[id]);
      delete state.timers[id];
      if (state.myBooking === id) state.myBooking = null;
      renderHall();
      updatePanel();
    }
    renderActivePanel();
  }, 1000);
}

// ── ACTIVE PANEL ──
function renderActivePanel() {
  const panel = document.getElementById("active-panel");
  const list  = document.getElementById("booking-list");

  const mine = Object.entries(state.bookings).filter(([, b]) => b.mine);
  if (!mine.length) { panel.classList.remove("visible"); return; }

  panel.classList.add("visible");
  list.innerHTML = "";

  mine.forEach(([id, b]) => {
    const remaining = Math.max(0, b.endTime - Date.now());
    const pct      = (remaining / b.totalMs) * 100;
    const mins     = Math.floor(remaining / 60000);
    const secs     = Math.floor((remaining % 60000) / 1000);
    const barClass = pct > 40 ? "" : pct > 15 ? "warning" : "urgent";

    const item = document.createElement("div");
    item.className = "booking-item";
    item.innerHTML = `
      <div class="b-seat">${id}</div>
      <div class="b-bar-wrap">
        <div class="b-bar ${barClass}" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="b-time">${mins}:${secs.toString().padStart(2, "0")}</div>
      <button class="cancel-btn" onclick="requestCancel('${id}')">cancel</button>`;
    list.appendChild(item);
  });
}

// ── CANCEL FLOW ──
function requestCancel(id) {
  state.pendingCancel = id;
  document.getElementById("modal-seat-id").textContent = id;
  document.getElementById("modal").classList.add("visible");
}

function closeModal() {
  state.pendingCancel = null;
  document.getElementById("modal").classList.remove("visible");
}

async function confirmCancel() {
  const id = state.pendingCancel;
  if (!id) return;

  try {
    const res  = await fetch(`${BOOKING_API}/cancel`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: JSON.stringify({ seat_id: id }),
      signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || "Cancel failed.", "error"); closeModal(); return; }
  } catch (_) {
    // Offline — cancel locally
  }

  delete state.bookings[id];
  if (state.timers[id]) { clearInterval(state.timers[id]); delete state.timers[id]; }
  if (state.myBooking === id) state.myBooking = null;
  saveOfflineBookings(); // update cache after cancel
  closeModal();
  renderHall();
  updatePanel();
  renderActivePanel();
  showToast("Booking cancelled.", "info");
}

// ── FLOOR SWITCH ──
function switchFloor(f) {
  if (f === state.floor || state.animating) return;
  state.animating = true;

  const dir    = f > state.floor ? "left" : "right";
  const wrap   = document.getElementById("hall-wrap");
  const badge  = document.getElementById("floor-badge");
  const toggle = document.querySelector(".floor-toggle");

  toggle.classList.toggle("floor-2", f === 2);
  document.querySelectorAll(".floor-btn").forEach((b, i) => b.classList.toggle("active", i + 1 === f));

  wrap.classList.add(`slide-out-${dir}`);

  setTimeout(() => {
    state.floor    = f;
    state.selected = null;
    Object.keys(state.bookings).forEach(k => {
      if (!k.startsWith(`F${f}-`)) delete state.bookings[k];
    });

    renderHall();
    updatePanel();
    badge.textContent = `Floor ${f}`;

    const inDir = dir === "left" ? "right" : "left";
    wrap.classList.remove(`slide-out-${dir}`);
    wrap.classList.add(`slide-in-${inDir}`);
    void wrap.offsetWidth;
    wrap.classList.add("active");

    setTimeout(() => {
      wrap.classList.remove(`slide-in-${inDir}`, "active");
      state.animating = false;
      syncSeatsFromServer();
    }, 350);
  }, 300);
}

// ── TOAST ──
function showToast(msg, type = "info") {
  const existing = document.getElementById("lib-toast");
  if (existing) existing.remove();

  const colors = {
    success: { bg: "#0077b6", icon: "✓" },
    error:   { bg: "#e63946", icon: "✕" },
    info:    { bg: "#03045e", icon: "ℹ" }
  };
  const c = colors[type] || colors.info;

  const toast = document.createElement("div");
  toast.id = "lib-toast";
  toast.style.cssText = `
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
    background:${c.bg}; color:#fff;
    padding:12px 24px; border-radius:30px;
    font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500;
    box-shadow:0 8px 28px rgba(3,4,94,0.35);
    z-index:9999; display:flex; align-items:center; gap:8px;
    white-space:nowrap; max-width:90vw;
    animation:toastIn 0.25s ease;
  `;
  toast.innerHTML = `<span>${c.icon}</span><span>${msg}</span>`;

  if (!document.getElementById("toast-style")) {
    const s = document.createElement("style");
    s.id = "toast-style";
    s.textContent = `@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`;
    document.head.appendChild(s);
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity    = "0";
    toast.style.transition = "opacity 0.4s";
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ── MODAL CLICK OUTSIDE ──
document.getElementById("modal").addEventListener("click", function(e) {
  if (e.target === this) closeModal();
});

// ── INIT ──
renderHall();
updatePanel();
syncSeatsFromServer();                         // load persistent bookings from server
setInterval(syncSeatsFromServer, 30000);       // refresh every 30s
