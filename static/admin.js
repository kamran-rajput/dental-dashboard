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
    const [clientsRes, staffRes] = await Promise.all([
      fetch('/api/admin/clients'),
      fetch('/api/admin/staff-logins')
    ]);

    if (clientsRes.status === 401 || staffRes.status === 401) {
      window.location.replace('/login?mode=admin');
      return;
    }

    if (clientsRes.ok) {
      const clients = await clientsRes.json();
      renderClientsTable(clients);
    }

    if (staffRes.ok) {
      const staffList = await staffRes.json();
      renderStaffTable(staffList);
    }
  } catch (err) {
    console.error('Error fetching admin data:', err);
  }
}

function renderClientsTable(clients) {
  const kpiEl = document.getElementById('admin-kpi-clients');
  const tbody = document.getElementById('admin-clients-tbody');
  if (kpiEl) kpiEl.textContent = Array.isArray(clients) ? clients.length : 0;
  if (!tbody) return;

  if (!Array.isArray(clients) || clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500">No client database registries found.</td></tr>`;
    return;
  }

  tbody.innerHTML = clients.map(c => {
    const slug = c.client_slug || c.slug;
    const name = c.client_name || c.name;
    const dbName = c.db_name || c.booking_schema || 'client_databases';
    const dbUser = c.db_user || c.login_schema || 'houstunUser';
    const hostPort = `${c.db_host || 'n8n.cubifai.com'}:${c.db_port || 5434}`;

    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3.5 px-4 font-mono font-bold text-indigo-400">${escapeHtml(slug)}</td>
        <td class="py-3.5 px-4 font-semibold text-white">${escapeHtml(name)}</td>
        <td class="py-3.5 px-4 font-mono text-slate-300 font-semibold">${escapeHtml(dbName)}</td>
        <td class="py-3.5 px-4 font-mono text-emerald-400 font-medium">${escapeHtml(dbUser)}</td>
        <td class="py-3.5 px-4 font-mono text-slate-400 text-[11px]">${escapeHtml(hostPort)}</td>
        <td class="py-3.5 px-4">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60">Active</span>
        </td>
        <td class="py-3.5 px-4 text-right">
          <button onclick="handleDeleteClient('${escapeHtml(slug)}')" title="Delete Client Organization" class="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-semibold transition-all">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderStaffTable(staffList) {
  const tbody = document.getElementById('admin-staff-tbody');
  if (!tbody) return;

  if (!Array.isArray(staffList) || staffList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">No staff credentials registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = staffList.map(s => {
    const dt = new Date(s.created_at || Date.now());
    const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const passwordDisplay = s.password || '••••••••';

    return `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-3.5 px-4 font-mono font-bold text-indigo-400">${escapeHtml(s.client_slug)}</td>
        <td class="py-3.5 px-4 font-semibold text-emerald-400 font-mono">${escapeHtml(s.username)}</td>
        <td class="py-3.5 px-4 font-mono text-amber-300 font-semibold text-xs">${escapeHtml(passwordDisplay)}</td>
        <td class="py-3.5 px-4 text-slate-400 text-[11px] font-mono">${dateStr}</td>
        <td class="py-3.5 px-4 text-right">
          <button onclick="handleDeleteStaff('${escapeHtml(s.client_slug)}', '${escapeHtml(s.username)}')" title="Delete Staff Credential" class="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-semibold transition-all">
            <i class="fa-solid fa-trash mr-1"></i> Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleDeleteClient(slug) {
  if (!confirm(`Are you sure you want to delete client organization '${slug}'?\n\nThis will remove its Control Plane database registry.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/clients/${encodeURIComponent(slug)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (res.ok) {
      fetchAdminData();
    } else {
      alert(data.detail || "Failed to delete client organization.");
    }
  } catch (err) {
    alert("Network error deleting client organization.");
  }
}

async function handleDeleteStaff(client_slug, username) {
  if (!confirm(`Are you sure you want to delete staff credential '${username}' for organization '${client_slug}'?`)) {
    return;
  }

  try {
    const res = await fetch('/api/admin/staff-logins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_slug, username })
    });
    const data = await res.json();
    if (res.ok) {
      fetchAdminData();
    } else {
      alert(data.detail || "Failed to delete staff credential.");
    }
  } catch (err) {
    alert("Network error deleting staff credential.");
  }
}

async function handleCreateClient(e) {
  e.preventDefault();
  const client_slug = document.getElementById('new-client-slug').value.trim();
  const client_name = document.getElementById('new-client-name').value.trim();
  const db_name = document.getElementById('new-db-name').value.trim();
  const db_user = document.getElementById('new-db-user').value.trim();
  const db_host = document.getElementById('new-db-host').value.trim() || 'n8n.cubifai.com';
  const db_port = document.getElementById('new-db-port').value.trim() || 5434;
  const db_pass = document.getElementById('new-db-pass').value.trim() || '9876@Houstun';
  
  const msgEl = document.getElementById('add-client-msg');
  const btn = document.getElementById('btn-submit-client');

  btn.disabled = true;
  msgEl.classList.add('hidden');

  if (!/^[a-z0-9_-]{2,32}$/.test(client_slug)) {
    msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
    msgEl.textContent = "Organization slug must be 2-32 characters (lowercase letters, numbers, hyphens, or underscores).";
    msgEl.classList.remove('hidden');
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_slug, client_name, db_name, db_user, db_host, db_port, db_pass })
    });
    const data = await res.json();

    if (res.ok) {
      closeModal('modal-add-client');
      fetchAdminData();
    } else {
      msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
      msgEl.textContent = data.detail || "Failed to register client database";
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

  if (!/^[a-z0-9_-]{2,32}$/.test(client_slug)) {
    msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
    msgEl.textContent = "Invalid organization slug format.";
    msgEl.classList.remove('hidden');
    btn.disabled = false;
    return;
  }
  if (!/^[a-zA-Z0-9_.@-]{2,64}$/.test(username)) {
    msgEl.className = "p-3 rounded-xl border text-xs font-medium bg-rose-950 text-rose-300 border-rose-800";
    msgEl.textContent = "Username must be 2-64 characters (alphanumeric, dots, hyphens, underscores).";
    msgEl.classList.remove('hidden');
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch('/api/admin/client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_slug, username, password })
    });
    const data = await res.json();

    if (res.ok) {
      closeModal('modal-add-staff');
      fetchAdminData();
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
