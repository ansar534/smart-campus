/**
 * Authentication helpers used on every protected page.
 *   requireAuth(roles?) — redirects to /pages/login.html unless the session
 *                         is valid and, optionally, the role is allowed.
 *   logout()            — posts to /api/auth/logout and redirects to login.
 *   renderNavbar(user, page?) — populates a <div id="navbar"> with a role-
 *                                appropriate nav.
 */

async function requireAuth(allowedRoles = null) {
  try {
    const data = await apiCall('/api/auth/me');
    const user = data.user;
    if (allowedRoles) {
      const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      if (!allowed.includes(user.role)) {
        showMessage(`Access denied: this page is for ${allowed.join(' / ')}`, 'error');
        setTimeout(() => {
          window.location.href = `/pages/${user.role}/dashboard.html`;
        }, 800);
        return null;
      }
    }
    return user;
  } catch (e) {
    window.location.href = '/pages/login.html';
    return null;
  }
}

async function logout() {
  try {
    await apiCall('/api/auth/logout', 'POST');
  } catch (_) {}
  window.location.href = '/pages/login.html';
}

function renderNavbar(user, activePage = '') {
  const nav = document.getElementById('navbar');
  if (!nav || !user) return;

  const links = {
    student: [
      ['dashboard',  '/pages/student/dashboard.html',  'Dashboard'],
      ['events',     '/pages/student/events.html',     'Browse Events'],
      ['my-events',  '/pages/student/my-events.html',  'My Events'],
      ['profile',    '/pages/student/profile.html',    'Profile'],
    ],
    faculty: [
      ['dashboard',     '/pages/faculty/dashboard.html',    'Dashboard'],
      ['create-event',  '/pages/events/event-form.html?mode=create', 'Create Event'],
    ],
    admin: [
      ['dashboard',  '/pages/admin/dashboard.html',  'Dashboard'],
      ['events',     '/pages/admin/events.html',     'Events'],
      ['reports',    '/pages/admin/reports.html',    'Reports'],
      ['venues',     '/pages/admin/venues.html',     'Venues'],
      ['users',      '/pages/admin/users.html',      'Users'],
    ],
  };

  const items = (links[user.role] || [])
    .map(([key, href, label]) => {
      const cls = key === activePage ? 'active' : '';
      return `<a class="${cls}" href="${href}">${label}</a>`;
    })
    .join('');

  nav.innerHTML = `
    <a class="brand" href="/pages/${user.role}/dashboard.html">SCEMS</a>
    <div class="nav-links">
      ${items}
      <span class="user-info">${escapeHTML(user.name || user.email)} · ${user.role}</span>
      <a href="#" id="logoutLink">Logout</a>
    </div>
  `;

  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
}

window.requireAuth = requireAuth;
window.logout = logout;
window.renderNavbar = renderNavbar;
