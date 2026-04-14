/* ═══════════════════════════════════════════════════
   nav-profile.js  —  include at bottom of every page
   ═══════════════════════════════════════════════════ */

const NAV_API = "https://library-seats-management-system.onrender.com";

// ── User helpers ──
function getUser()  { try { return JSON.parse(localStorage.getItem("libraryUser")); } catch { return null; } }
function getToken() { return localStorage.getItem("authToken") || ""; }
function clearUser() {
  localStorage.removeItem("libraryUser");
  localStorage.removeItem("authToken");
}

// ── Build initials ──
function initials(name) {
  return (name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ── Inject nav profile chip + mobile drawer ──
function buildNav() {
  const nav = document.querySelector("nav");
  if (!nav) return;

  const user = getUser();

  // Remove any existing profile/login element
  nav.querySelector(".nav-profile, .nav-login-link")?.remove();

  if (user) {
    const isAdmin = user.role === "admin";
    const chip = document.createElement("div");
    chip.className = "nav-profile";
    chip.innerHTML = `
      <div class="nav-avatar">${initials(user.name)}</div>
      <span class="nav-profile-name">${user.name.split(" ")[0]}</span>
      <div class="nav-dropdown">
        <div class="nav-dropdown-name">${user.name}</div>
        <div class="nav-dropdown-email">${user.email || (user.prn + "@rit.edu")}</div>
        ${isAdmin
          ? `<a class="nav-dropdown-item" href="admin.html">🛡️ Admin Dashboard</a>`
          : ``
        }
        <a class="nav-dropdown-item" href="admin-login.html">🔑 Admin Portal</a>
        <button class="nav-dropdown-item logout" onclick="logoutUser()">Sign out</button>
      </div>`;

    chip.addEventListener("click", e => { e.stopPropagation(); chip.classList.toggle("open"); });
    document.addEventListener("click", () => chip.classList.remove("open"));
    nav.appendChild(chip);

  } else {
    const link = document.createElement("a");
    link.className  = "nav-login-link";
    link.href       = "login.html";
    link.style.cssText = "color:#48cae4;font-size:13px;font-weight:500;text-decoration:none;margin-left:12px;white-space:nowrap;";
    link.textContent = "Sign in";
    nav.appendChild(link);
  }

  // ─ Hamburger ─
  let hamburger = nav.querySelector(".hamburger");
  if (!hamburger) {
    hamburger = document.createElement("button");
    hamburger.className = "hamburger";
    hamburger.setAttribute("aria-label", "Menu");
    hamburger.innerHTML = "<span></span><span></span><span></span>";
    nav.appendChild(hamburger);
  }

  // ─ Mobile drawer ─
  let drawer = document.getElementById("mobile-nav");
  if (!drawer) {
    drawer = document.createElement("div");
    drawer.className = "mobile-nav";
    drawer.id = "mobile-nav";
    document.body.insertBefore(drawer, document.body.children[1]);
  }

  drawer.innerHTML = "";

  if (user) {
    drawer.innerHTML += `
      <div class="mobile-profile-strip">
        <div class="nav-avatar" style="width:36px;height:36px;font-size:14px;">${initials(user.name)}</div>
        <div>
          <div class="mobile-profile-name">${user.name}</div>
          <div class="mobile-profile-email">${user.email || (user.prn + "@rit.edu")}</div>
        </div>
      </div>
      <div class="mobile-divider"></div>`;
  }

  [
    { href: "index.html",    label: "Home" },
    { href: "aboutUs.html",  label: "About Us" },
    { href: "booking.html",  label: "Book a Seat", cta: true },
  ].forEach(l => {
    drawer.innerHTML += `<a href="${l.href}" class="${l.cta ? "cta" : ""}">${l.label}</a>`;
  });

  drawer.innerHTML += `<div class="mobile-divider"></div>`;

  if (user) {
    if (user.role === "admin") {
      drawer.innerHTML += `<a href="admin.html">🛡️ Admin Dashboard</a>`;
    }
    drawer.innerHTML += `<a href="admin-login.html">🔑 Admin Portal</a>`;
    drawer.innerHTML += `<a href="#" onclick="logoutUser()" style="color:#e63946;">Sign out</a>`;
  } else {
    drawer.innerHTML += `<a href="login.html">Sign in</a>`;
    drawer.innerHTML += `<a href="register.html">Create Account</a>`;
  }

  // ─ Hamburger toggle ─
  hamburger.addEventListener("click", e => {
    e.stopPropagation();
    hamburger.classList.toggle("open");
    drawer.classList.toggle("open");
  });

  document.addEventListener("click", e => {
    if (!drawer.contains(e.target) && !hamburger.contains(e.target)) {
      hamburger.classList.remove("open");
      drawer.classList.remove("open");
    }
  });
}

// ── Logout ──
async function logoutUser() {
  try {
    await fetch(`${NAV_API}/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
  } catch (_) {}
  clearUser();
  window.location.href = "login.html";
}

// ── Footer profile ──
function buildFooter() {
  const el = document.getElementById("footer-user");
  if (!el) return;
  const user = getUser();
  if (user) {
    el.innerHTML = `
      <div class="footer-profile">
        <div class="profile-avatar">${initials(user.name)}</div>
        <div>
          <div class="profile-name">${user.name}</div>
          <div class="profile-role">${user.email || (user.prn + "@rit.edu")}</div>
        </div>
      </div>`;
  } else {
    el.innerHTML = `<div class="login-prompt">Not signed in — <a href="login.html">Sign in</a></div>`;
  }
}

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  buildNav();
  buildFooter();
});
