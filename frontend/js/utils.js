/**
 * Shared UI utilities.
 */

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = String(timeStr).split(':');
  const H = Number(h);
  const period = H >= 12 ? 'PM' : 'AM';
  const hour12 = H % 12 === 0 ? 12 : H % 12;
  return `${hour12}:${m} ${period}`;
}

function formatDateTime(dateStr, timeStr) {
  return `${formatDate(dateStr)} ${formatTime(timeStr)}`.trim();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function escapeHTML(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Show a transient toast message.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} ms
 */
function showMessage(message, type = 'info', ms = 3500) {
  let container = document.getElementById('messages');
  if (!container) {
    container = document.createElement('div');
    container.id = 'messages';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `msg ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  return `<span class="badge ${s}">${escapeHTML(status || '')}</span>`;
}

/**
 * Elegant toast notification (slides in from the right).
 * Stacks multiple toasts above each other.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} ms
 */
function showToast(message, type = 'success', ms = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Stack toasts vertically if multiple are visible
  const existing = document.querySelectorAll('.toast.show').length;
  toast.style.top = `${100 + existing * 72}px`;

  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, ms);
}

/**
 * Full-screen loading overlay helper.
 */
function showLoading(text = 'Loading data...') {
  hideLoading();
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `<div class="spinner"></div><p>${escapeHTML(text)}</p>`;
  document.body.appendChild(overlay);
}
function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.remove();
}

/**
 * Render a friendly empty-state block.
 * @param {string} title
 * @param {string} message
 * @param {string} [icon] emoji
 * @param {string} [actionHTML] raw HTML for an action button
 */
function emptyState(title, message, icon = '📭', actionHTML = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>
      ${actionHTML}
    </div>`;
}

window.formatDate = formatDate;
window.formatTime = formatTime;
window.formatDateTime = formatDateTime;
window.validateEmail = validateEmail;
window.escapeHTML = escapeHTML;
window.showMessage = showMessage;
window.statusBadge = statusBadge;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.emptyState = emptyState;
