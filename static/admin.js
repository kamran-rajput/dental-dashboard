// Cubifai Admin CRM - JavaScript Engine

document.addEventListener('DOMContentLoaded', () => {
  checkAdminSession();
});

async function checkAdminSession() {
  try {
    const res = await fetch('/api/admin/session');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        document.getElementById('admin-username-label').textContent = data.username || 'admin';
        fetchAdminData();
        return;
      }
    }
  } catch (err) {
    console.error('Admin session check error:', err);
  }
  window.location.replace('/login?mode=admin');
}

async function fetchAdminData() {
  try {
    const [clientsRes, linksRes] = await Promise.all([
      fetch('/api/admin/clients'),
      fetch('/api/admin/links')
    ]);

    if (clientsRes.status === 401 || linksRes.status === 401) {
      window.location.replace('/login?mode=admin');
      return;
    }

    if (clientsRes.ok) {
      const clients = await clientsRes.json();
      renderClientsTable(clients);
    }

    if (linksRes.ok) {
      const links = await linksRes.json();
      renderLinksTable(links);
    }
  } catch (err) {
    console.error('Error fetching admin data:', err);
  }
}

function renderClientsTable(clients) {
  const kpiEl = document.getElementById('admin-kpi-clients');
  const tbody = document.getElementById('admin-clients-tbody');
  if (kpiEl) kpiEl.textContent = clients.length;
  if (!tbody) return;

  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">No client organizations registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = clients.map(c => {
    const slug = c.client_slug || c.slug;
    const name = c.client_name || c.name;
    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3.5 px-4 font-mono font-bold text-indigo-400">${escapeHtml(slug)}</td>
        <td class="py-3.5 px-4 font-semibold text-white">${escapeHtml(name)}</td>
        <td class="py-3.5 px-4 font-mono text-slate-400">${escapeHtml(c.booking_schema)}</td>
        <td class="py-3.5 px-4 font-mono text-slate-400">${escapeHtml(c.login_schema)}</td>
        <td class="py-3.5 px-4">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60">Active</span>
        </td>
      </tr>
    `;
  }).join('');
}

function renderLinksTable(links) {
  const kpiEl = document.getElementById('admin-kpi-links');
  const tbody = document.getElementById('admin-links-tbody');
  if (kpiEl) kpiEl.textContent = links.length;
  if (!tbody) return;

  if (links.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">No account links found.</td></tr>`;
    return;
  }

  tbody.innerHTML = links.map(l => {
    const dt = new Date(l.created_at || Date.now());
    const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    const username = l.client_username || l.username || '';
    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3.5 px-4 font-mono text-slate-300 font-semibold">${escapeHtml(l.hostinger_user_id)}</td>
        <td class="py-3.5 px-4 font-mono text-indigo-400 font-bold">${escapeHtml(l.client_slug)}</td>
        <td class="py-3.5 px-4 text-slate-300 font-medium">${escapeHtml(username)}</td>
        <td class="py-3.5 px-4 text-slate-500 font-mono text-[11px]">${dateStr}</td>
        <td class="py-3.5 px-4 text-right">
          <button onclick="handleRevokeTokens('${escapeHtml(l.hostinger_user_id)}', '${escapeHtml(l.client_slug)}')" class="px-3 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-[11px] font-bold transition-all shadow-xs">
            <i class="fa-solid fa-ban mr-1"></i> Revoke Tokens
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleCreateClient(e) {
  e.preventDefault();
  const client_slug = document.getElementById('new-client-slug').value.trim();
  const client_name = document.getElementById('new-client-name').value.trim();
  const booking_schema = document.getElementById('new-booking-schema').value.trim();
  const login_schema = document.getElementById('new-login-schema').value.trim();
  const msgEl = document.getElementById('add-client-msg');
  const btn = document.getElementById('btn-submit-client');

  btn.disabled = true;
  msgEl.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_slug, client_name, booking_schema, login_schema })
    });
    const data = await res.json();

    if (res.ok) {
      closeModal('modal-add-client');
      fetchAdminData();
    } else {
      msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
      msgEl.textContent = data.detail || "Failed to create client";
      msgEl.classList.remove('hidden');
    }
  } catch (err) {
    msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
    msgEl.textContent = "Network error";
    msgEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

async function handleCreateStaffLogin(e) {
  e.preventDefault();
  const client_slug = document.getElementById('staff-client-slug').value.trim();
  const username = document.getElementById('staff-username').value.trim();
  const password = document.getElementById('staff-password').value;
  const msgEl = document.getElementById('add-staff-msg');
  const btn = document.getElementById('btn-submit-staff');

  btn.disabled = true;
  msgEl.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_slug, username, password })
    });
    const data = await res.json();

    if (res.ok) {
      closeModal('modal-add-staff');
      alert(`Staff credentials created successfully for '${username}' under org '${client_slug}'.`);
    } else {
      msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
      msgEl.textContent = data.detail || "Failed to create staff login";
      msgEl.classList.remove('hidden');
    }
  } catch (err) {
    msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
    msgEl.textContent = "Network error";
    msgEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

async function handleAdminLinkUser(e) {
  e.preventDefault();
  const hostinger_user_id = document.getElementById('link-hostinger-id').value.trim();
  const client_slug = document.getElementById('admin-link-slug').value.trim();
  const username = document.getElementById('admin-link-username').value.trim();
  const msgEl = document.getElementById('admin-link-msg');
  const btn = document.getElementById('btn-submit-link-user');

  btn.disabled = true;
  msgEl.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/link-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostinger_user_id, client_slug, username })
    });
    const data = await res.json();

    if (res.ok) {
      closeModal('modal-link-user');
      fetchAdminData();
    } else {
      msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
      msgEl.textContent = data.detail || "Failed to link user";
      msgEl.classList.remove('hidden');
    }
  } catch (err) {
    msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
    msgEl.textContent = "Network error";
    msgEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

async function handleRevokeTokens(hostinger_user_id, client_slug) {
  if (!confirm(`Are you sure you want to revoke all access & refresh tokens for user '${hostinger_user_id}' on org '${client_slug}'?`)) return;

  try {
    const res = await fetch('/api/admin/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostinger_user_id, client_slug })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Tokens revoked for ${hostinger_user_id}. Active sessions ended.`);
      fetchAdminData();
    } else {
      alert(data.detail || "Failed to revoke tokens");
    }
  } catch (err) {
    alert("Network error revoking tokens");
  }
}

async function handleAdminLogout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST' });
  } catch (err) {}
  window.location.replace('/login?mode=admin');
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('hidden');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
