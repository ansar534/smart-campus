/**
 * Thin fetch wrapper that talks to our Express API.
 * Auto-handles JSON, session cookies, and common error cases.
 */
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null && body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(endpoint, options);
  } catch (e) {
    throw new Error('Network error — is the backend running?');
  }

  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { message: text };
  }

  if (!res.ok) {
    if (res.status === 401 && !endpoint.endsWith('/api/auth/login')) {
      window.location.href = '/pages/login.html';
      return Promise.reject(new Error('Not authenticated'));
    }
    throw new Error(data.message || `API Error (${res.status})`);
  }
  return data;
}

window.apiCall = apiCall;
