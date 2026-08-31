// Smile Dental AI CRM - JavaScript Application Engine (White Theme)
const API_BASE = '/api/bookings';
const STATS_API = '/api/stats';
const SESSION_API = '/api/user/session';
const LINK_API = '/api/auth/link';
const UNLINK_API = '/api/auth/unlink';
const LOGOUT_API = '/api/user/logout';

let allBookings = [];
let statsData = {};
let currentView = 'dashboard';
let currentTab = 'all';
let searchQuery = '';
let currentPeriod = 'all';
let isAuthenticated = false;
let userSession = null;

let servicesChart = null;
let statusChart = null;
let timelineChart = null;
let actionsChart = null;

// Initialize App on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  resetToDisconnectedState();
  switchView('dashboard');

  // Check active user session
  checkSession();
});

// Check Session Authentication Status
async function checkSession() {
  try {
    const res = await fetch(SESSION_API);
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        isAuthenticated = true;
        userSession = data.user;
        updateConnectionStatusUI(true, userSession);

        if (userSession.linked) {
          await fetchData();
        } else {
          // Open settings modal if user hasn't linked VPS database yet
          resetToDisconnectedState();
          openSettingsModal();
        }
        return;
      }
    }
  } catch (err) {
    console.error("Session check error:", err);
  }

  isAuthenticated = false;
  userSession = null;
  updateConnectionStatusUI(false);
  resetToDisconnectedState();
  // Redirect to login page if unauthenticated
  window.location.replace('/login');
}

// Update Header, Sidebar, and Settings UI according to connection state
function updateConnectionStatusUI(connected, user = null) {
  const headerStatus = document.getElementById('header-conn-status');
  const footerStatus = document.getElementById('footer-conn-status');

  if (connected && user && user.linked) {
    const clientName = user.client_name || user.client_slug || 'Client DB';
    if (headerStatus) {
      headerStatus.className = "hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer";
      headerStatus.onclick = openSettingsModal;
      headerStatus.innerHTML = `<i class="fa-solid fa-circle-check mr-1 text-emerald-600"></i>Connected: ${escapeHtml(clientName)}`;
    }
    if (footerStatus) {
      footerStatus.className = "cursor-pointer text-emerald-600 font-semibold font-mono text-[11px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200";
      footerStatus.textContent = escapeHtml(clientName);
    }
    updateSettingsModalUI(true, user);
  } else if (connected && user) {
    if (headerStatus) {
      headerStatus.className = "hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer";
      headerStatus.onclick = openSettingsModal;
      headerStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1 text-amber-600"></i>Connect Database`;
    }
    if (footerStatus) {
      footerStatus.className = "cursor-pointer text-amber-600 font-semibold font-mono text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200";
      footerStatus.textContent = "DB Unlinked";
    }
    updateSettingsModalUI(false, user);
  } else {
    if (headerStatus) {
      headerStatus.className = "hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200";
      headerStatus.onclick = null;
      headerStatus.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1"></i>Not Connected`;
    }
    if (footerStatus) {
      footerStatus.className = "cursor-pointer text-rose-600 font-semibold font-mono text-[11px] bg-rose-50 px-2 py-0.5 rounded border border-rose-200";
      footerStatus.textContent = "Not connected";
    }
    updateSettingsModalUI(false, null);
  }
}


// Reset all values to hardcoded 0s and clear datasets
function resetToDisconnectedState() {
  statsData = {
    total_calls: 0,
    booked: 0,
    cancelled: 0,
    new_leads: 0,
    service_distribution: {},
    action_distribution: {}
  };
  allBookings = [];
  updateKPICards(statsData);
  renderCurrentView();
}

// Switch Between Core Navigation Views
function switchView(viewName) {
  if (viewName === 'settings') viewName = 'dashboard';
  currentView = viewName;

  const titles = {
    dashboard: "Dashboard Overview",
    appointments: "Appointments Management",
    patients: "Patients & Leads Directory",
    calls: "AI Receptionist Activity Log",
    analytics: "Analytics & Performance Insights"
  };

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[viewName] || "Cubifai Solutions CRM";

  // Hide all view sections
  const views = ['dashboard', 'appointments', 'patients', 'calls', 'analytics'];
  views.forEach(v => {
    const sec = document.getElementById(`view-${v}`);
    if (sec) sec.classList.add('hidden');

    const btn = document.getElementById(`nav-${v}`);
    if (btn) {
      btn.classList.remove('bg-indigo-50', 'text-indigo-700', 'font-semibold', 'border', 'border-indigo-100');
      btn.classList.add('text-slate-600');
    }
  });

  // Show active view
  const activeSec = document.getElementById(`view-${viewName}`);
  if (activeSec) activeSec.classList.remove('hidden');

  const activeBtn = document.getElementById(`nav-${viewName}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-600');
    activeBtn.classList.add('bg-indigo-50', 'text-indigo-700', 'font-semibold', 'border', 'border-indigo-100');
  }

  if (viewName === 'analytics') {
    renderAnalyticsCharts();
  }
}

// Fetch Stats and Bookings Data from Express Backend (requires active session)
async function fetchData(period = currentPeriod) {
  if (!isAuthenticated) {
    resetToDisconnectedState();
    return;
  }

  try {
    currentPeriod = period;
    const [statsRes, bookingsRes] = await Promise.all([
      fetch(`${STATS_API}?period=${period}`),
      fetch(`${API_BASE}?limit=500`)
    ]);

    if (statsRes.status === 401 || bookingsRes.status === 401) {
      checkSession();
      return;
    }

    if (statsRes.ok) {
      statsData = await statsRes.json();
      updateKPICards(statsData);
    }

    if (bookingsRes.ok) {
      allBookings = await bookingsRes.json();
    }

    renderCurrentView();
  } catch (err) {
    console.error("Error fetching data from API:", err);
  }
}

// Handle time range filter change
function handlePeriodChange(val) {
  fetchData(val);
}

// Update 5 KPI Stats Cards
function updateKPICards(stats) {
  const totalCallsEl = document.getElementById('kpi-total-calls');
  const bookedEl = document.getElementById('kpi-booked');
  const cancellationsEl = document.getElementById('kpi-cancellations');
  const inquiriesEl = document.getElementById('kpi-inquiries');
  const faqEl = document.getElementById('kpi-faq');

  if (totalCallsEl) totalCallsEl.textContent = stats.total_calls ?? stats.total ?? 0;
  if (bookedEl) bookedEl.textContent = stats.booked ?? 0;
  if (cancellationsEl) cancellationsEl.textContent = stats.cancelled ?? 0;
  if (inquiriesEl) inquiriesEl.textContent = stats.inquiry ?? 0;
  if (faqEl) faqEl.textContent = stats.faq ?? 0;
}

// Safe Date Parser for PostgreSQL timestamp strings (e.g. "2026-07-31 07:00:00+00")
function parseBookingDate(dateStr) {
  if (!dateStr) return null;
  let clean = dateStr.toString().trim().replace(' ', 'T');
  if (clean.match(/\+\d{2}$/)) {
    clean += ':00';
  }
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

// Get maximum date present in allBookings dataset
function getMaxBookingDate() {
  if (!allBookings || allBookings.length === 0) return new Date();
  let maxMs = 0;
  allBookings.forEach(b => {
    const d = parseBookingDate(b.start_time);
    if (d && d.getTime() > maxMs) maxMs = d.getTime();
  });
  return maxMs > 0 ? new Date(maxMs) : new Date();
}

// Check if a date string falls within selected timeline period
function isWithinPeriod(dateStr, period) {
  if (!period || period === 'all') return true;
  const d = parseBookingDate(dateStr);
  if (!d) return true;

  const maxDate = getMaxBookingDate();

  const dStr = d.toISOString().split('T')[0];
  const maxStr = maxDate.toISOString().split('T')[0];
  const nowStr = new Date().toISOString().split('T')[0];

  if (period === 'today') {
    return dStr === maxStr || dStr === nowStr;
  }

  const itemStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const maxStart = Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate());
  const diffDays = Math.round((maxStart - itemStart) / (1000 * 60 * 60 * 24));

  if (period === 'last_week') {
    return diffDays >= 0 && diffDays <= 7;
  }
  if (period === 'last_month') {
    return diffDays >= 0 && diffDays <= 30;
  }

  return true;
}

// Render Current Active View Content
function renderCurrentView() {
  renderTodayTimeline();
  renderAIFeed();
  renderAppointmentsTable();
  renderPatientsView();
  renderCallsTable();

  if (currentView === 'analytics') {
    renderAnalyticsCharts();
  }
}

// Render View 1: Today's Schedule & Upcoming Timeline
function renderTodayTimeline() {
  const container = document.getElementById('timeline-container');
  const countBadge = document.getElementById('timeline-today-count-badge');
  if (!container) return;

  if (!isAuthenticated) {
    if (countBadge) countBadge.classList.add('hidden');
    container.innerHTML = `<div class="text-center py-10 space-y-2">
      <i class="fa-solid fa-lock text-slate-300 text-2xl"></i>
      <p class="text-slate-500 text-xs font-semibold">Not connected to database</p>
      <p class="text-slate-400 text-[11px]">Log in under Settings to connect and view live schedule.</p>
    </div>`;
    return;
  }

  if (allBookings.length === 0) {
    if (countBadge) countBadge.classList.add('hidden');
    container.innerHTML = `<div class="text-center py-10 space-y-2">
      <i class="fa-solid fa-spinner animate-spin text-indigo-500 text-xl"></i>
      <p class="text-slate-500 text-xs font-semibold">Loading live schedule...</p>
    </div>`;
    return;
  }

  const now = new Date();
  const maxBooking = getMaxBookingDate();
  const todayYMD = maxBooking ? maxBooking.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const bookedBookings = [...allBookings]
    .filter(b => (b.status || '').toLowerCase() === 'booked')
    .sort((a, b) => {
      const da = parseBookingDate(a.start_time);
      const db = parseBookingDate(b.start_time);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

  const todayBookedList = bookedBookings.filter(b => {
    const d = parseBookingDate(b.start_time);
    if (!d) return false;
    const isoYMD = d.toISOString().split('T')[0];
    return isoYMD === todayYMD || d.toDateString() === now.toDateString();
  });

  if (countBadge) {
    countBadge.textContent = `${todayBookedList.length} Today`;
    countBadge.classList.remove('hidden');
  }

  const displayList = bookedBookings.slice(0, 8);

  if (displayList.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">No active appointments scheduled.</div>`;
    return;
  }

  container.innerHTML = displayList.map(b => {
    const dt = parseBookingDate(b.start_time) || new Date();
    const isoYMD = dt.toISOString().split('T')[0];
    const isToday = isoYMD === todayYMD || dt.toDateString() === now.toDateString();

    const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = isToday ? 'TODAY' : dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const badgeColor = isToday ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100';

    return `
      <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 hover:bg-white hover:shadow-xs transition-all">
        <div class="flex items-center space-x-3">
          <div class="w-16 py-1.5 rounded-lg ${badgeColor} text-center font-mono border flex flex-col justify-center shadow-2xs">
            <span class="text-[11px] font-extrabold leading-tight">${timeStr}</span>
            <span class="text-[9px] font-bold uppercase tracking-wider mt-0.5">${dateStr}</span>
          </div>
          <div>
            <h4 class="font-bold text-xs text-slate-900">${escapeHtml(b.patient_name)}</h4>
            <p class="text-[11px] text-slate-600">${escapeHtml(b.service)} • <span class="italic text-slate-500">${escapeHtml(b.reason)}</span></p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          ${getStatusBadge(b.status)}
        </div>
      </div>
    `;
  }).join('');
}

// Render View 1: AI Activity Feed
function renderAIFeed() {
  const container = document.getElementById('ai-feed-container');
  if (!container) return;

  if (!isAuthenticated) {
    container.innerHTML = `<div class="text-center py-10 space-y-2">
      <i class="fa-solid fa-headset text-slate-300 text-2xl"></i>
      <p class="text-slate-500 text-xs font-semibold">Feed Disconnected</p>
      <p class="text-slate-400 text-[11px]">Log in to stream live AI voice receptionist logs.</p>
    </div>`;
    return;
  }

  if (allBookings.length === 0) {
    container.innerHTML = `<div class="text-center py-10 space-y-2">
      <i class="fa-solid fa-spinner animate-spin text-indigo-500 text-xl"></i>
      <p class="text-slate-500 text-xs font-semibold">Loading AI receptionist logs...</p>
    </div>`;
    return;
  }

  const recent = [...allBookings].slice(0, 6);
  if (recent.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs">No recent AI call activity.</div>`;
    return;
  }

  container.innerHTML = recent.map(b => {
    const isBook = b.action === 'book_appointment';
    const actionLabel = isBook ? 'Booked Appointment' : 'Cancelled Appointment';
    const actionColor = isBook ? 'amber' : 'rose';
    const dt = new Date(b.start_time);
    const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `
      <div class="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 hover:bg-white transition-all">
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-bold text-slate-900">${escapeHtml(b.patient_name)}</span>
          <span class="px-2 py-0.5 rounded text-[9px] font-mono font-semibold bg-${actionColor}-50 text-${actionColor}-700 border border-${actionColor}-200">
            ${actionLabel}
          </span>
        </div>
        <div class="text-[10px] text-slate-600 flex items-center justify-between">
          <span>${escapeHtml(b.service)}</span>
          <span class="text-slate-400">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

let appointmentPeriod = 'all';

function filterAppointmentPeriod(period) {
  appointmentPeriod = period;
  const periods = ['all', 'today', 'last_week', 'last_month'];
  periods.forEach(p => {
    const btn = document.getElementById(`app-period-${p}`);
    if (btn) {
      if (p === period) {
        btn.className = "px-3 py-1 rounded-md text-xs font-semibold transition-all bg-indigo-600 text-white shadow-xs";
      } else {
        btn.className = "px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all";
      }
    }
  });
  renderAppointmentsTable();
}

// Render View 2: Appointments Data Table
function renderAppointmentsTable() {
  const tbody = document.getElementById('appointments-tbody');
  if (!tbody) return;

  if (!isAuthenticated) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-400 text-xs font-medium">Database connection required to view appointments.</td></tr>`;
    return;
  }

  // Filter ONLY appointments (Booked & Cancelled) - Exclude FAQ and Inquiry
  let filtered = allBookings.filter(b => {
    const st = (b.status || '').toLowerCase();
    return st === 'booked' || st === 'cancelled';
  });

  if (currentTab === 'booked') {
    filtered = filtered.filter(b => (b.status || '').toLowerCase() === 'booked');
  } else if (currentTab === 'cancelled') {
    filtered = filtered.filter(b => (b.status || '').toLowerCase() === 'cancelled');
  }

  if (appointmentPeriod !== 'all') {
    filtered = filtered.filter(b => isWithinPeriod(b.start_time, appointmentPeriod));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(b =>
      b.patient_name.toLowerCase().includes(q) ||
      b.phone.toLowerCase().includes(q) ||
      b.email.toLowerCase().includes(q) ||
      b.service.toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-400 text-xs">No matching appointments found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const dt = parseBookingDate(b.start_time);
    const dateStr = dt ? dt.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (b.start_time || 'N/A');

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-4 font-mono text-[11px] text-slate-500 font-medium">#${b.id}</td>
        <td class="py-3 px-4 font-semibold text-slate-900">
          <div>${escapeHtml(b.patient_name)}</div>
          <div class="text-[10px] text-slate-500 font-normal">${escapeHtml(b.email)}</div>
        </td>
        <td class="py-3 px-4 text-slate-700 font-medium">${escapeHtml(b.service)}</td>
        <td class="py-3 px-4 text-slate-600 font-mono text-[11px]">${dateStr}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            ${escapeHtml(b.action)}
          </span>
        </td>
        <td class="py-3 px-4 font-mono text-[11px] text-slate-600">${escapeHtml(b.phone)}</td>
        <td class="py-3 px-4">${getStatusBadge(b.status)}</td>
      </tr>
    `;
  }).join('');
}

let currentLeadFilter = 'patients';

// Filter Leads Table by Status
function filterLeadsTable(filterType) {
  currentLeadFilter = filterType;

  // Update button active styles
  const buttons = document.querySelectorAll('.lead-filter-btn');
  buttons.forEach(btn => {
    btn.classList.remove('bg-white', 'text-slate-900', 'shadow-xs');
    btn.classList.add('text-slate-600');
  });

  const filterIdMap = {
    'all': 'lead-filter-all',
    'patients': 'lead-filter-patients',
    'leads': 'lead-filter-leads'
  };

  const activeBtn = document.getElementById(filterIdMap[filterType] || 'lead-filter-patients');
  if (activeBtn) {
    activeBtn.classList.add('bg-white', 'text-slate-900', 'shadow-xs');
    activeBtn.classList.remove('text-slate-600');
  }

  renderPatientsView();
}

// Render View 3: Patients & Leads Directory
function renderPatientsView() {
  const patientsKpiEl = document.getElementById('patient-kpi-total-patients');
  const faqKpiEl = document.getElementById('patient-kpi-faq-leads');
  const countBadge = document.getElementById('patient-table-count-badge');
  const tbody = document.getElementById('patients-tbody');

  if (!tbody) return;

  if (!isAuthenticated) {
    if (patientsKpiEl) patientsKpiEl.textContent = '0';
    if (faqKpiEl) faqKpiEl.textContent = '0';
    if (countBadge) countBadge.textContent = '0 records';
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400 text-xs font-medium">Authentication session required to view database records.</td></tr>`;
    return;
  }

  // 1. Patients count = status is Booked or Cancelled
  const patientsCount = allBookings.filter(b => ['booked', 'cancelled'].includes((b.status || '').toLowerCase())).length;
  // 2. FAQ leads count = status is FAQ
  const faqLeadsCount = allBookings.filter(b => (b.status || '').toLowerCase() === 'faq').length;

  if (patientsKpiEl) patientsKpiEl.textContent = patientsCount;
  if (faqKpiEl) faqKpiEl.textContent = faqLeadsCount;

  // Filter bookings for table view
  let filtered = [...allBookings];
  if (currentLeadFilter === 'patients') {
    filtered = filtered.filter(b => ['booked', 'cancelled'].includes((b.status || '').toLowerCase()));
  } else if (currentLeadFilter === 'leads') {
    filtered = filtered.filter(b => (b.status || '').toLowerCase() === 'faq');
  }

  if (countBadge) countBadge.textContent = `${filtered.length} records`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400 text-xs font-medium">No records found for filter: ${escapeHtml(currentLeadFilter)}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const phoneStr = b.phone || 'N/A';
    const emailStr = b.email || 'N/A';
    const serviceStr = b.service || 'General Dentistry';
    const reasonStr = b.reason || 'Practice inquiry';
    const initials = (b.patient_name || 'Patient').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3.5 px-4 font-semibold text-slate-900">
          <div class="flex items-center space-x-2.5">
            <div class="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px] flex items-center justify-center border border-indigo-100 shrink-0">
              ${escapeHtml(initials)}
            </div>
            <span>${escapeHtml(b.patient_name)}</span>
          </div>
        </td>
        <td class="py-3.5 px-4 font-mono text-[11px] text-slate-600">
          <div>${escapeHtml(phoneStr)}</div>
          <div class="text-[10px] text-slate-400 font-sans">${escapeHtml(emailStr)}</div>
        </td>
        <td class="py-3.5 px-4 font-semibold text-indigo-700">${escapeHtml(serviceStr)}</td>
        <td class="py-3.5 px-4 text-slate-600 italic text-[11px] max-w-xs truncate">${escapeHtml(reasonStr)}</td>
        <td class="py-3.5 px-4">${getStatusBadge(b.status)}</td>
        <td class="py-3.5 px-4 text-right">
          <button onclick="alert('Contacting patient: ${escapeHtml(b.patient_name)} (${escapeHtml(phoneStr)})')" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-semibold transition-all shadow-xs">
            <i class="fa-solid fa-paper-plane mr-1"></i> Contact
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

let callsPeriod = 'all';

function filterCallsPeriod(period) {
  callsPeriod = period;
  const periods = ['all', 'today', 'last_week', 'last_month'];
  periods.forEach(p => {
    const btn = document.getElementById(`calls-period-${p}`);
    if (btn) {
      if (p === period) {
        btn.className = "px-3 py-1 rounded-md text-xs font-semibold transition-all bg-indigo-600 text-white shadow-xs";
      } else {
        btn.className = "px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all";
      }
    }
  });
  renderCallsTable();
}

// Render View 4: AI Call Activity Table
function renderCallsTable() {
  const tbody = document.getElementById('calls-tbody');
  if (!tbody) return;

  if (!isAuthenticated) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400 text-xs font-medium">Database connection required. Log in under Settings/Login tab.</td></tr>`;
    return;
  }

  let filtered = [...allBookings];
  if (callsPeriod !== 'all') {
    filtered = filtered.filter(b => isWithinPeriod(b.start_time, callsPeriod));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400 text-xs font-medium">No AI call activity records for selected period.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const dt = parseBookingDate(b.start_time);
    const dateStr = dt ? dt.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (b.start_time || 'N/A');

    return `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-4 font-mono text-[11px] text-amber-700 font-semibold">${escapeHtml(b.event_id || 'evt_' + b.id)}</td>
        <td class="py-3 px-4 font-semibold text-slate-900">${escapeHtml(b.patient_name)}</td>
        <td class="py-3 px-4">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            ${escapeHtml(b.action)}
          </span>
        </td>
        <td class="py-3 px-4 text-slate-700 text-xs">${escapeHtml(b.reason)} (${escapeHtml(b.service)})</td>
        <td class="py-3 px-4 text-slate-500 font-mono text-[11px]">${dateStr}</td>
        <td class="py-3 px-4 text-right">
          <button onclick="openTranscriptModal('${escapeHtml(b.patient_name)}', '${escapeHtml(b.event_id || 'evt_' + b.id)}', '${escapeHtml(b.action)}', '${escapeHtml(b.reason)}')" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-semibold transition-all">
            <i class="fa-solid fa-file-lines mr-1 text-slate-500"></i> Transcript
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Render View 5: Analytics Charts & Executive Dashboard Metrics
function renderAnalyticsCharts() {
  const serviceCtx = document.getElementById('chart-services');
  const statusCtx = document.getElementById('chart-status');
  const timelineCtx = document.getElementById('chart-timeline');
  const actionsCtx = document.getElementById('chart-actions');

  if (!serviceCtx || !statusCtx) return;

  // Destroy existing charts to prevent canvas overlay bugs
  if (servicesChart) servicesChart.destroy();
  if (statusChart) statusChart.destroy();
  if (timelineChart) timelineChart.destroy();
  if (actionsChart) actionsChart.destroy();

  // Sync Period Selector UI if present
  const periodSelect = document.getElementById('analytics-period-select');
  if (periodSelect && periodSelect.value !== currentPeriod) {
    periodSelect.value = currentPeriod;
  }

  if (!isAuthenticated) return;

  const totalCalls = statsData.total_calls || allBookings.length || 0;
  const bookedCount = statsData.booked || 0;
  const cancelledCount = statsData.cancelled || 0;
  const inquiryCount = statsData.inquiry || 0;
  const faqCount = statsData.faq || 0;
  const infoTotal = inquiryCount + faqCount;

  const conversionRate = totalCalls > 0 ? ((bookedCount / totalCalls) * 100).toFixed(1) : '0.0';
  const cancelRate = totalCalls > 0 ? ((cancelledCount / totalCalls) * 100).toFixed(1) : '0.0';

  // 1. Update Metric Cards & Progress Indicators
  const elConversionRate = document.getElementById('analytics-conversion-rate');
  const elConversionSub = document.getElementById('analytics-conversion-sub');
  const elConversionBar = document.getElementById('analytics-conversion-bar');
  if (elConversionRate) elConversionRate.textContent = `${conversionRate}%`;
  if (elConversionSub) elConversionSub.textContent = `${bookedCount} of ${totalCalls} calls converted to bookings`;
  if (elConversionBar) elConversionBar.style.width = `${Math.min(100, Math.max(0, parseFloat(conversionRate)))}%`;

  const elCancelRate = document.getElementById('analytics-cancel-rate');
  const elCancelSub = document.getElementById('analytics-cancel-sub');
  const elCancelBar = document.getElementById('analytics-cancel-bar');
  if (elCancelRate) elCancelRate.textContent = `${cancelRate}%`;
  if (elCancelSub) elCancelSub.textContent = `${cancelledCount} calls cancelled by patient / AI`;
  if (elCancelBar) elCancelBar.style.width = `${Math.min(100, Math.max(0, parseFloat(cancelRate)))}%`;

  const elInquiriesCount = document.getElementById('analytics-inquiries-count');
  const elInquiriesSub = document.getElementById('analytics-inquiries-sub');
  const elInquiriesBar = document.getElementById('analytics-inquiries-bar');
  if (elInquiriesCount) elInquiriesCount.textContent = infoTotal;
  if (elInquiriesSub) elInquiriesSub.textContent = `${inquiryCount} Inquiries • ${faqCount} FAQ Calls`;
  if (elInquiriesBar) elInquiriesBar.style.width = `${totalCalls > 0 ? Math.min(100, (infoTotal / totalCalls) * 100).toFixed(1) : 0}%`;

  const serviceDist = statsData.service_distribution || {};
  const sortedServices = Object.entries(serviceDist).sort((a, b) => b[1] - a[1]);
  const topService = sortedServices.length > 0 ? sortedServices[0] : ['None', 0];
  const topServiceShare = totalCalls > 0 ? ((topService[1] / totalCalls) * 100).toFixed(1) : '0.0';

  const elTopService = document.getElementById('analytics-top-service');
  const elTopServiceSub = document.getElementById('analytics-top-service-sub');
  const elTopServiceBar = document.getElementById('analytics-top-service-bar');
  if (elTopService) elTopService.textContent = topService[0];
  if (elTopServiceSub) elTopServiceSub.textContent = `${topService[1]} bookings (${topServiceShare}% of total volume)`;
  if (elTopServiceBar) elTopServiceBar.style.width = `${topServiceShare}%`;

  // Palette definition
  const colorPalette = [
    '#4f46e5', '#059669', '#d97706', '#0284c7', '#8b5cf6', '#ec4899', '#f43f5e', '#64748b'
  ];

  // 2. Chart 1: Service Distribution Doughnut
  const serviceLabels = sortedServices.map(s => s[0]);
  const serviceCounts = sortedServices.map(s => s[1]);

  servicesChart = new Chart(serviceCtx, {
    type: 'doughnut',
    data: {
      labels: serviceLabels.length > 0 ? serviceLabels : ['No Data'],
      datasets: [{
        data: serviceCounts.length > 0 ? serviceCounts : [1],
        backgroundColor: colorPalette,
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#334155',
            font: { family: 'Inter', size: 11, weight: '600' },
            boxWidth: 12,
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw || 0;
              const pct = totalCalls > 0 ? ((val / totalCalls) * 100).toFixed(1) : '0';
              return ` ${context.label}: ${val} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // 3. Chart 2: Appointment Status Metrics Bar Chart
  statusChart = new Chart(statusCtx, {
    type: 'bar',
    data: {
      labels: ['Booked', 'Cancelled', 'Inquiry', 'FAQ / Leads'],
      datasets: [{
        label: 'Calls / Appointments',
        data: [bookedCount, cancelledCount, inquiryCount, faqCount],
        backgroundColor: ['#059669', '#e11d48', '#d97706', '#4f46e5'],
        borderRadius: 8,
        barThickness: 36
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` Total: ${context.raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#475569', font: { family: 'Inter', size: 11, weight: '600' } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#475569', font: { family: 'Inter', size: 11 }, precision: 0 },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
        }
      }
    }
  });

  // 4. Chart 3: Call & Appointment Chronological Volume Trend Line Chart
  if (timelineCtx) {
    // Group bookings by date string (e.g. Jul 28)
    const dateCounts = {};
    const sortedBookings = [...allBookings].sort((a, b) => {
      const da = parseBookingDate(a.start_time);
      const db = parseBookingDate(b.start_time);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });

    sortedBookings.forEach(b => {
      const d = parseBookingDate(b.start_time);
      if (d) {
        const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        dateCounts[label] = (dateCounts[label] || 0) + 1;
      }
    });

    const timelineLabels = Object.keys(dateCounts);
    const timelineData = Object.values(dateCounts);

    timelineChart = new Chart(timelineCtx, {
      type: 'line',
      data: {
        labels: timelineLabels.length > 0 ? timelineLabels : ['Today'],
        datasets: [{
          label: 'Call Volume',
          data: timelineData.length > 0 ? timelineData : [0],
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return ` Volume: ${context.raw} calls`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#475569', font: { family: 'Inter', size: 10 } },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#475569', font: { family: 'Inter', size: 10 }, precision: 0 },
            grid: { color: '#f1f5f9' },
            beginAtZero: true
          }
        }
      }
    });
  }

  // 5. Chart 4: AI Agent Actions Chart
  if (actionsCtx) {
    const actionDist = statsData.action_distribution || {};
    const actionLabels = Object.keys(actionDist).map(act => {
      if (act === 'book_appointment') return 'Book Appointment';
      if (act === 'cancel_appointment') return 'Cancel Appointment';
      if (act === 'inquiry') return 'Inquiry';
      if (act === 'faq') return 'FAQ Answer';
      return act.replace('_', ' ');
    });
    const actionCounts = Object.values(actionDist);

    actionsChart = new Chart(actionsCtx, {
      type: 'polarArea',
      data: {
        labels: actionLabels.length > 0 ? actionLabels : ['No Actions'],
        datasets: [{
          data: actionCounts.length > 0 ? actionCounts : [1],
          backgroundColor: [
            'rgba(5, 150, 105, 0.75)',
            'rgba(225, 29, 72, 0.75)',
            'rgba(217, 119, 6, 0.75)',
            'rgba(79, 70, 229, 0.75)'
          ],
          borderWidth: 1,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#334155', font: { family: 'Inter', size: 10, weight: '500' }, boxWidth: 10 }
          }
        },
        scales: {
          r: { ticks: { display: false }, grid: { color: '#f1f5f9' } }
        }
      }
    });
  }

  // 6. Populate Service Popularity & Volume Breakdown List
  const serviceListContainer = document.getElementById('analytics-services-list');
  const serviceBadge = document.getElementById('analytics-service-count-badge');

  if (serviceBadge) {
    serviceBadge.textContent = `${sortedServices.length} Services`;
  }

  if (serviceListContainer) {
    if (sortedServices.length === 0) {
      serviceListContainer.innerHTML = `<div class="col-span-2 text-center py-6 text-slate-400 text-xs">No service data available.</div>`;
      return;
    }

    serviceListContainer.innerHTML = sortedServices.map(([name, count], idx) => {
      const share = totalCalls > 0 ? ((count / totalCalls) * 100).toFixed(1) : '0.0';
      const color = colorPalette[idx % colorPalette.length];

      return `
        <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 hover:bg-white hover:border-slate-300 transition-all">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2.5">
              <span class="w-3 h-3 rounded-full inline-block" style="background-color: ${color}"></span>
              <span class="font-bold text-xs text-slate-900">${escapeHtml(name)}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="text-xs font-black text-slate-900 font-mono">${count}</span>
              <span class="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">${share}%</span>
            </div>
          </div>
          <div class="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500" style="width: ${share}%; background-color: ${color}"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Settings Modal Control Functions
function openSettingsModal() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.classList.remove('hidden');
}

function updateSettingsModalUI(linked, user = null) {
  const statusIcon = document.getElementById('settings-status-icon');
  const statusTitle = document.getElementById('settings-status-title');
  const statusSub = document.getElementById('settings-status-sub');
  const btnUnlink = document.getElementById('btn-unlink-db');
  const errorMsg = document.getElementById('link-error-msg');

  if (errorMsg) errorMsg.classList.add('hidden');

  if (linked && user) {
    if (statusIcon) {
      statusIcon.className = "w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold";
      statusIcon.innerHTML = `<i class="fa-solid fa-plug-circle-check"></i>`;
    }
    if (statusTitle) statusTitle.textContent = user.client_name || `Organization: ${user.client_slug}`;
    if (statusSub) statusSub.textContent = `Connected via Hostinger ID ${user.id}`;
    if (btnUnlink) btnUnlink.classList.remove('hidden');

    const slugInput = document.getElementById('link-client-slug');
    if (slugInput && user.client_slug) slugInput.value = user.client_slug;
  } else {
    if (statusIcon) {
      statusIcon.className = "w-9 h-9 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-bold";
      statusIcon.innerHTML = `<i class="fa-solid fa-plug-circle-xmark"></i>`;
    }
    if (statusTitle) statusTitle.textContent = "Database Disconnected";
    if (statusSub) statusSub.textContent = "No active VPS client schema linked";
    if (btnUnlink) btnUnlink.classList.add('hidden');
  }
}

async function handleLinkDatabase(e) {
  e.preventDefault();
  const slugInput = document.getElementById('link-client-slug');
  const usernameInput = document.getElementById('link-username');
  const passwordInput = document.getElementById('link-password');
  const submitBtn = document.getElementById('btn-submit-link');
  const errorMsg = document.getElementById('link-error-msg');

  if (!slugInput || !usernameInput || !passwordInput) return;

  const client_slug = slugInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (errorMsg) {
    errorMsg.classList.add('hidden');
    errorMsg.textContent = '';
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> <span>Connecting...</span>`;
  }

  try {
    const res = await fetch(LINK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_slug, username, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      passwordInput.value = '';
      closeModal('modal-settings');
      await checkSession();
    } else {
      const msg = data.detail || 'Failed to connect database';
      if (errorMsg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Link database error:', err);
    if (errorMsg) {
      errorMsg.textContent = 'Server network error during database connection.';
      errorMsg.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-link"></i> <span>Connect Database</span>`;
    }
  }
}

async function handleUnlinkDatabase() {
  if (!confirm("Are you sure you want to disconnect from this database? Your dashboard data will be cleared.")) return;

  try {
    const res = await fetch(UNLINK_API, { method: 'POST' });
    if (res.ok) {
      closeModal('modal-settings');
      await checkSession();
    }
  } catch (err) {
    console.error('Unlink error:', err);
  }
}


async function handleLogout() {
  try {
    const res = await fetch(LOGOUT_API, { method: 'POST' });
    if (res.ok) {
      isAuthenticated = false;
      currentUsername = '';
      updateConnectionStatusUI(false);
      resetToDisconnectedState();
      window.location.replace('/login');
    }
  } catch (err) {
    console.error("Logout error:", err);
  }
}

function togglePasswordVisibility() {
  const pwdInput = document.getElementById('login-password');
  const icon = document.getElementById('toggle-password-icon');
  if (pwdInput && icon) {
    if (pwdInput.type === 'password') {
      pwdInput.type = 'text';
      icon.className = 'fa-solid fa-eye-slash';
    } else {
      pwdInput.type = 'password';
      icon.className = 'fa-solid fa-eye';
    }
  }
}

// Search Handler
function handleSearch() {
  searchQuery = document.getElementById('search-input').value;
  renderAppointmentsTable();
}

// Filter Tab Switcher
function filterTab(tabName) {
  currentTab = tabName;
  const tabs = ['all', 'booked', 'cancelled'];

  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) {
      if (t === tabName) {
        btn.className = "tab-btn px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all bg-indigo-600 text-white shadow-xs";
      } else {
        btn.className = "tab-btn px-3.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition-all";
      }
    }
  });

  renderAppointmentsTable();
}

function openTranscriptModal(patientName, eventId, action, reason) {
  document.getElementById('modal-transcript-patient').textContent = patientName;
  document.getElementById('modal-transcript-event').textContent = eventId;
  document.getElementById('modal-transcript-action').textContent = action;
  document.getElementById('modal-transcript-reason').textContent = `"${reason}"`;

  const modal = document.getElementById('modal-transcript');
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

// Re-seed Database Manual
async function seedDatabaseManual() {
  if (!isAuthenticated) {
    alert("Database connection required. Please log in under Settings/Login tab.");
    return;
  }

  if (confirm("Are you sure you want to re-seed the PostgreSQL bookings table from seed file?")) {
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      alert(data.message);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  }
}

// Helper: Status Pill Badge HTML
function getStatusBadge(status) {
  const st = (status || 'Booked').toLowerCase();

  if (st === 'booked') {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <i class="fa-solid fa-check text-[9px] mr-1"></i> Booked
    </span>`;
  } else if (st === 'inquiry') {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <i class="fa-solid fa-circle-question text-[9px] mr-1"></i> Inquiry
    </span>`;
  } else if (st === 'cancelled') {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
      <i class="fa-solid fa-xmark text-[9px] mr-1"></i> Cancelled
    </span>`;
  } else if (st === 'faq') {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
      <i class="fa-solid fa-comments text-[9px] mr-1"></i> FAQ
    </span>`;
  }

  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(status)}</span>`;
}

// Helper: HTML escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
