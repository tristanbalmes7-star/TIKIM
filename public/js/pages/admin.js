/**
 * TIKIM Organizer Dashboard Shell & Modules
 * Hash-based routing, SVG charts, double-booking prevention, proof review queue,
 * turnover checklist, and real-time cross-tab sync.
 */

import { mockApi } from '../mockApi.js';
import { computeQuote, getPricingConfig, PRICING_DEFAULTS, calculateQuotation, formatPeso, formatPesos, computeDownpaymentAndBalance } from '../pricing.js?v=r9';
import { simulateSms, getSmsLogs } from '../sms.js';
import { renderLayoutPreviewSvg } from '../layoutPreview.js';
import { AdminMasterCalendar } from '../adminCalendar.js';
import { formatPolicyHtml, DEFAULT_CANCELLATION_POLICY, DEFAULT_DAMAGE_POLICY } from '../policyHelper.js';
import { escapeAdminText } from '../adminText.js';
import { attachAdminQuotePreview } from '../adminQuotePreview.js';

// Verify organizer authentication using the Laravel session.
let currentSession = null;

async function checkSessionGuard() {
  try {
    const response = await fetch('/api/v1/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      window.location.replace('login.html');
      return null;
    }

    const result = await response.json();

    if (!result.authenticated || !result.user) {
      window.location.replace('login.html');
      return null;
    }

    return result.user;
  } catch (error) {
    console.error('Authentication check failed:', error);
    window.location.replace('login.html');
    return null;
  }
}

let currentRoute = 'dashboard';
let cachedBookings = [];
let bookingsLoading = false;
let bookingsError = null;
let cachedPendingPayments = [];
let paymentQueueError = null;
let cachedInventory = [];
let cachedVendors = [];
let cachedPackages = [];
let cachedDishes = [];
let cachedSettings = {};

async function initAdmin() {
  currentSession = await checkSessionGuard();

  if (!currentSession) return;

  bindLayoutControls();
  setupCrossTabSync();
  await refreshGlobalData();

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

/* --------------------------------------------------------------------------
   Data Refresh & Sync
   -------------------------------------------------------------------------- */
async function refreshGlobalData() {
  const bookingsPromise = refreshBookings();

  try {
    [cachedInventory, cachedVendors, cachedSettings] = await Promise.all([
      mockApi.listInventory(),
      mockApi.listVendors(),
      mockApi.getSettings()
    ]);

    const [pkgRes, menuRes] = await Promise.all([
      fetch('../data/packages.json'),
      fetch('../data/menu.json')
    ]);
    cachedPackages = await pkgRes.json();
    cachedDishes = await menuRes.json();

    await bookingsPromise;

    try {
    cachedPendingPayments = await mockApi.listPendingPayments();
      paymentQueueError = null;
    } catch (error) {
      cachedPendingPayments = [];
      paymentQueueError = error.message || 'Unable to load payment submissions.';
    }

    updateGlobalBadges();
  } catch (err) {
    console.error('Failed to load admin data:', err);
  }
}

async function refreshBookings() {
  bookingsLoading = true;
  bookingsError = null;
  cachedBookings = [];

  if (currentRoute === 'bookings' && document.getElementById('bookingsTableBody')) {
    renderBookingsRows([]);
  }

  updateGlobalBadges();

  try {
    cachedBookings = await mockApi.listBookings();
  } catch (error) {
    bookingsError = error.message || 'Unable to load bookings from the server.';
  } finally {
    bookingsLoading = false;
    updateGlobalBadges();

    if (currentRoute === 'bookings' && document.getElementById('bookingsTableBody')) {
      renderCurrentRoute();
    }
  }
}

function updateGlobalBadges() {
  const bookingsBadge = document.getElementById('navBadgeBookings');
  const paymentsBadge = document.getElementById('navBadgePayments');
  const bellBadge = document.getElementById('bellBadge');

  if (bookingsBadge) bookingsBadge.textContent = cachedBookings.length;

  const pendingPayments = cachedPendingPayments.length;
  if (paymentsBadge) paymentsBadge.textContent = paymentQueueError ? '!' : pendingPayments;
  if (bellBadge) bellBadge.textContent = paymentQueueError ? '!' : pendingPayments;
}

function setupCrossTabSync() {
  if ('BroadcastChannel' in window) {
    const syncHandler = async (e) => {
      const { type } = e.data || {};
      if (type) {
        showAdminToast(`Live Alert: ${type.replace(/_/g, ' ')}! Refreshing data...`, 'info');
      }
      await refreshGlobalData();
      renderCurrentRoute();
    };
    try {
      new BroadcastChannel('tikim_live_channel').onmessage = syncHandler;
      new BroadcastChannel('tikim_sync_channel').onmessage = syncHandler;
    } catch (err) {}
  }

  window.addEventListener('storage', async (e) => {
    if (e.key && e.key.startsWith('tikim.')) {
      await refreshGlobalData();
      renderCurrentRoute();
    }
  });
}


function showAdminToast(msg, type = 'info') {
  const container = document.getElementById('adminToastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = 'padding: 0.85rem 1.25rem; background: var(--color-slate); color: #fff; border-radius: 8px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,0.2); border-left: 4px solid var(--color-teal); animation: slideLeft 0.3s;';
  toast.textContent = msg;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

let activeLightboxBlobUrl = null;
let lightboxZoom = 1;
let lightboxRotate = 0;

function updateLightboxTransform() {
  const img = document.getElementById('proofLightboxImage');
  const levelEl = document.getElementById('lightboxZoomLevel');
  if (img) {
    img.style.transform = `scale(${lightboxZoom}) rotate(${lightboxRotate}deg)`;
  }
  if (levelEl) {
    levelEl.textContent = `${Math.round(lightboxZoom * 100)}%`;
  }
}

async function openProofLightbox(receiptId, bookingRef) {
  const modal = document.getElementById('proofLightboxModal');
  const img = document.getElementById('proofLightboxImage');
  const pdf = document.getElementById('proofLightboxPdf');
  const notFound = document.getElementById('proofLightboxNotFound');
  const title = document.getElementById('proofLightboxTitle');
  const dlBtn = document.getElementById('btnLightboxDownload');
  const newTabBtn = document.getElementById('btnLightboxNewTab');
  if (!modal) return;

  if (activeLightboxBlobUrl) {
    try { URL.revokeObjectURL(activeLightboxBlobUrl); } catch (e) {}
    activeLightboxBlobUrl = null;
  }

  lightboxZoom = 1;
  lightboxRotate = 0;
  updateLightboxTransform();

  if (title) title.textContent = `Payment Proof Inspection · ${bookingRef || 'Receipt'}`;
  if (notFound) notFound.style.display = 'none';
  if (img) { img.src = ''; img.style.display = 'none'; }
  if (pdf) { pdf.src = ''; pdf.style.display = 'none'; }

  let blob = null;
  try {
    blob = await mockApi.getPaymentReceipt(receiptId);
  } catch (error) {
    console.error('Failed to retrieve private payment receipt:', error);
  }

  if (blob) {
    activeLightboxBlobUrl = URL.createObjectURL(blob);
    const isPdf = blob.type === 'application/pdf';
    if (isPdf) {
      if (pdf) {
        pdf.src = activeLightboxBlobUrl;
        pdf.style.display = 'block';
      }
    } else {
      if (img) {
        img.src = activeLightboxBlobUrl;
        img.style.display = 'block';
      }
    }
    if (dlBtn) {
      const extension = isPdf
        ? 'pdf'
        : (blob.type === 'image/jpeg' ? 'jpg' : (blob.type === 'image/webp' ? 'webp' : 'png'));
      dlBtn.href = activeLightboxBlobUrl;
      dlBtn.download = `proof-${bookingRef || 'receipt'}.${extension}`;
      dlBtn.style.pointerEvents = 'auto';
      dlBtn.style.opacity = '1';
    }
    if (newTabBtn) {
      newTabBtn.href = activeLightboxBlobUrl;
      newTabBtn.target = '_blank';
      newTabBtn.style.pointerEvents = 'auto';
      newTabBtn.style.opacity = '1';
    }
  } else {
    if (notFound) notFound.style.display = 'block';
    if (dlBtn) {
      dlBtn.href = '#';
      dlBtn.style.pointerEvents = 'none';
      dlBtn.style.opacity = '0.5';
    }
    if (newTabBtn) {
      newTabBtn.href = '#';
      newTabBtn.style.pointerEvents = 'none';
      newTabBtn.style.opacity = '0.5';
    }
  }

  modal.style.display = 'flex';
}

function closeProofLightbox() {
  const modal = document.getElementById('proofLightboxModal');
  const img = document.getElementById('proofLightboxImage');
  const pdf = document.getElementById('proofLightboxPdf');
  if (modal) modal.style.display = 'none';
  if (img) img.src = '';
  if (pdf) pdf.src = '';
  if (activeLightboxBlobUrl) {
    try { URL.revokeObjectURL(activeLightboxBlobUrl); } catch (e) {}
    activeLightboxBlobUrl = null;
  }
}

let activeRejectPaymentId = null;
let activeRejectBookingRef = '';

function openRejectDialog(paymentId, bookingRef) {
  activeRejectPaymentId = paymentId;
  activeRejectBookingRef = bookingRef;

  const modal = document.getElementById('paymentRejectModal');
  const title = document.getElementById('paymentRejectTitle');
  const errorEl = document.getElementById('rejectErrorMsg');
  const freeText = document.getElementById('rejectFreeText');
  const radios = document.querySelectorAll('input[name="rejectReasonPreset"]');

  if (title) title.textContent = `Reject Payment Submission · ${bookingRef}`;
  if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
  if (freeText) freeText.value = '';
  radios.forEach(r => { r.checked = false; });

  if (modal) modal.style.display = 'flex';
}

function closeRejectDialog() {
  const modal = document.getElementById('paymentRejectModal');
  if (modal) modal.style.display = 'none';
  activeRejectPaymentId = null;
  activeRejectBookingRef = '';
}

function openPolicyPreviewDialog(title, text, version) {
  const modal = document.getElementById('policyPreviewModal');
  const titleEl = document.getElementById('policyPreviewTitle');
  const verEl = document.getElementById('policyPreviewVersion');
  const contentEl = document.getElementById('policyPreviewContent');
  if (!modal) return;

  if (titleEl) titleEl.textContent = title || 'Policy Preview';
  if (verEl) verEl.textContent = version ? `Version ${version}` : 'Official Dack\'s Policy';
  if (contentEl) contentEl.innerHTML = formatPolicyHtml(text || '');

  modal.style.display = 'flex';
}

function closePolicyPreviewDialog() {
  const modal = document.getElementById('policyPreviewModal');
  if (modal) modal.style.display = 'none';
}

if (typeof window !== 'undefined') {
  window.openProofLightbox = openProofLightbox;
  window.openRejectDialog = openRejectDialog;
}


/* --------------------------------------------------------------------------
   Layout & Router
   -------------------------------------------------------------------------- */
function bindLayoutControls() {
  const sidebar = document.getElementById('adminSidebar');
  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const logoutBtn = document.getElementById('btnLogout');
  const searchInput = document.getElementById('adminGlobalSearch');

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;

    try {
      const csrfCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('XSRF-TOKEN='));

      if (!csrfCookie) {
        throw new Error('Security token missing. Please refresh the page.');
      }

      const csrfToken = decodeURIComponent(
        csrfCookie.split('=').slice(1).join('=')
      );

      const response = await fetch('/api/v1/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json',
          'X-XSRF-TOKEN': csrfToken
        }
      });

      if (!response.ok) {
        throw new Error('Unable to log out. Please try again.');
      }

      window.location.replace('login.html');

    } catch (error) {
      console.error('Logout failed:', error);
      alert(error.message);
      logoutBtn.disabled = false;
    }
  });
}

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      if (currentRoute === 'bookings' || currentRoute === 'dashboard') {
        filterBookingsTable(term);
      } else if (currentRoute === 'packages-menu' || currentRoute === 'menu' || currentRoute === 'packages') {
        document.querySelectorAll('#menuTableBody tr').forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
      } else if (currentRoute === 'inventory') {
        document.querySelectorAll('#inventoryTableBody tr').forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
      }
    });
  }

  // Drawer Close
  const drawer = document.getElementById('adminDrawer');
  const drawerClose = document.getElementById('adminDrawerClose');
  const drawerBackdrop = document.getElementById('adminDrawerBackdrop');
  if (drawerClose) drawerClose.onclick = () => drawer.style.display = 'none';
  if (drawerBackdrop) drawerBackdrop.onclick = () => drawer.style.display = 'none';

  // Lightbox controls
  const btnCloseLightbox = document.getElementById('btnCloseLightbox');
  const proofLightboxBackdrop = document.getElementById('proofLightboxBackdrop');
  if (btnCloseLightbox) btnCloseLightbox.addEventListener('click', closeProofLightbox);
  if (proofLightboxBackdrop) proofLightboxBackdrop.addEventListener('click', closeProofLightbox);

  const btnZoomIn = document.getElementById('btnLightboxZoomIn');
  const btnZoomOut = document.getElementById('btnLightboxZoomOut');
  const btnRotate = document.getElementById('btnLightboxRotate');
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      if (lightboxZoom < 3) {
        lightboxZoom = Math.min(3, lightboxZoom + 0.25);
        updateLightboxTransform();
      }
    });
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      if (lightboxZoom > 0.5) {
        lightboxZoom = Math.max(0.5, lightboxZoom - 0.25);
        updateLightboxTransform();
      }
    });
  }
  if (btnRotate) {
    btnRotate.addEventListener('click', () => {
      lightboxRotate = (lightboxRotate + 90) % 360;
      updateLightboxTransform();
    });
  }

  // Reject modal controls
  const btnCloseReject = document.getElementById('btnCloseRejectModal');
  const rejectBackdrop = document.getElementById('paymentRejectBackdrop');
  const btnCancelReject = document.getElementById('btnCancelReject');
  const btnConfirmReject = document.getElementById('btnConfirmReject');
  if (btnCloseReject) btnCloseReject.addEventListener('click', closeRejectDialog);
  if (rejectBackdrop) rejectBackdrop.addEventListener('click', closeRejectDialog);
  if (btnCancelReject) btnCancelReject.addEventListener('click', closeRejectDialog);
  if (btnConfirmReject) {
    btnConfirmReject.addEventListener('click', async () => {
      const errorEl = document.getElementById('rejectErrorMsg');
      const freeText = (document.getElementById('rejectFreeText')?.value || '').trim();
      const selected = document.querySelector('input[name="rejectReasonPreset"]:checked');

      if (!selected && !freeText) {
        if (errorEl) {
          errorEl.textContent = 'Please choose a preset rejection reason or provide an explanation.';
          errorEl.style.display = 'block';
        }
        return;
      }

      if (selected && selected.value === 'Other' && !freeText) {
        if (errorEl) {
          errorEl.textContent = 'Please specify the rejection reason in the text box.';
          errorEl.style.display = 'block';
        }
        return;
      }

      let finalReason = '';
      if (selected && selected.value !== 'Other') {
        finalReason = freeText ? `${selected.value}: ${freeText}` : selected.value;
      } else {
        finalReason = freeText || 'Payment proof rejected by organizer';
      }

      try {
        await mockApi.reviewPayment(activeRejectPaymentId, 'Rejected', finalReason);
        showAdminToast(`Payment submission for ${activeRejectBookingRef} rejected.`, 'warning');
        closeRejectDialog();
        await refreshGlobalData();
        renderCurrentRoute();
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Failed to reject payment.';
          errorEl.style.display = 'block';
        }
      }
    });
  }

  // Policy preview modal controls
  const btnClosePolicyPreview = document.getElementById('btnClosePolicyPreview');
  const policyPreviewBackdrop = document.getElementById('policyPreviewBackdrop');
  const btnClosePolicyFooter = document.getElementById('btnClosePolicyPreviewFooter');
  if (btnClosePolicyPreview) btnClosePolicyPreview.addEventListener('click', closePolicyPreviewDialog);
  if (policyPreviewBackdrop) policyPreviewBackdrop.addEventListener('click', closePolicyPreviewDialog);
  if (btnClosePolicyFooter) btnClosePolicyFooter.addEventListener('click', closePolicyPreviewDialog);

  // Global ESC handler for modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProofLightbox();
      closeRejectDialog();
      closePolicyPreviewDialog();
    }
  });
}


function handleRoute() {
  const hash = window.location.hash.replace('#/', '') || 'dashboard';
  currentRoute = hash;

  let activeNav = hash;
  if (hash === 'quotations') activeNav = 'bookings';
  else if (hash === 'packages' || hash === 'menu') activeNav = 'packages-menu';
  else if (hash === 'turnover') activeNav = 'inventory';
  else if (hash === 'sms') activeNav = 'messages';

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
    link.classList.toggle('active', link.dataset.route === activeNav);
  });

  renderCurrentRoute();
}

function renderCurrentRoute() {
  const container = document.getElementById('adminViewContainer');
  if (!container) return;

  switch (currentRoute) {
    case 'dashboard':
      renderDashboardView(container);
      break;
    case 'reports':
      renderReportsView(container);
      break;
    case 'bookings':
      renderBookingsView(container, 'list');
      break;
    case 'quotations':
      renderBookingsView(container, 'quotations');
      break;
    case 'calendar':
      renderCalendarView(container);
      break;
    case 'payments':
      renderPaymentsView(container);
      break;
    case 'packages-menu':
      renderPackagesMenuView(container, 'packages');
      break;
    case 'packages':
      renderPackagesMenuView(container, 'packages');
      break;
    case 'menu':
      renderPackagesMenuView(container, 'menu');
      break;
    case 'inventory':
      renderInventoryView(container, 'fleet');
      break;
    case 'turnover':
      renderInventoryView(container, 'turnover');
      break;
    case 'vendors':
      renderVendorsView(container);
      break;
    case 'messages':
      renderMessagesView(container, 'change_requests');
      break;
    case 'sms':
      renderMessagesView(container, 'sms');
      break;
    case 'settings':
      renderSettingsView(container);
      break;
    default:
      renderDashboardView(container);
  }
}

function triggerCsvDownload() {
  const headers = ["Reference", "Customer", "Mobile", "Event Type", "Event Date", "Pax", "Status", "Total", "Paid", "Balance"];
  const rows = cachedBookings.map(b => [
    b.ref,
    `"${b.customer?.name || ''}"`,
    b.customer?.mobile || '',
    b.eventType || b.tag,
    b.eventDate || b.deliveryDate || '',
    b.pax || 0,
    b.status,
    b.total || 0,
    b.paidAmount || 0,
    b.balance || 0
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `tikim_bookings_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showAdminToast('CSV Export downloaded!', 'success');
}

/* --------------------------------------------------------------------------
   1. DASHBOARD VIEW (With Hand-Crafted SVG Charts & Analytics)
   -------------------------------------------------------------------------- */
function renderDashboardView(container) {
  const totalBookings = cachedBookings.length;
  const activeHolds = cachedBookings.filter(b =>
    b.status === 'Hold' || b.status === 'Hold (48 Hours)'
  );
  const pendingProofs = cachedPendingPayments;
  const totalRevenue = cachedBookings.reduce((sum, b) => sum + (b.paidAmount || 0), 0);

  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Executive Command Overview</h1>
        <p class="view-subtitle">Live bookings schedule, payment verifications, and fleet status.</p>
      </div>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <button type="button" class="btn btn-sm btn-outline" id="btnDashboardExportCsv">Download Bookings CSV</button>
        <button type="button" class="btn btn-sm btn-primary" id="btnQuickNewBooking">+ Quick Manual Booking</button>
      </div>
    </div>

    ${pendingProofs.length > 0 ? `
      <div style="background:rgba(79,164,157,0.12); border-left:4px solid var(--color-teal); border-radius:8px; padding:0.85rem 1.25rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:var(--color-slate);">Payment Review Alert:</strong>
          <span style="font-size:13px; color:var(--color-slate-80); margin-left:0.5rem;">${pendingProofs.length} proof screenshot(s) awaiting verification.</span>
        </div>
        <a href="#/payments" class="btn btn-xs btn-primary">Review Payments Queue &rarr;</a>
      </div>
    ` : ''}

    ${activeHolds.length > 0 ? `
      <div style="background:rgba(171,75,46,0.1); border-left:4px solid var(--color-rust); border-radius:8px; padding:0.85rem 1.25rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:var(--color-rust);">Date Holds Active:</strong>
          <span style="font-size:13px; color:var(--color-slate-80); margin-left:0.5rem;">${activeHolds.length} reservation(s) on 48h hold countdown.</span>
        </div>
        <a href="#/calendar" class="btn btn-xs btn-outline">Check Calendar &rarr;</a>
      </div>
    ` : ''}

    <!-- 4 KPI Cards -->
    <div class="kpi-cards-grid">
      <div class="kpi-card">
        <span class="kpi-label">Verified Revenue</span>
        <div class="kpi-value">${formatPeso(totalRevenue)}</div>
        <span class="kpi-subtext">Received downpayments</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Active Bookings</span>
        <div class="kpi-value">${totalBookings}</div>
        <span class="kpi-subtext">Events & Food Orders</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Active 48h Holds</span>
        <div class="kpi-value" style="color:var(--color-rust);">${activeHolds.length}</div>
        <span class="kpi-subtext">Awaiting downpayment</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Proof Reviews Due</span>
        <div class="kpi-value" style="color:#d97706;">${pendingProofs.length}</div>
        <span class="kpi-subtext">Receipts to verify</span>
      </div>
    </div>

    <!-- Hand-Crafted SVG Charts (No external library) -->
    <div class="charts-row">
      <div class="chart-card">
        <h3 class="chart-title">Revenue Forecast & Booking Trend (Next 6 Months)</h3>
        <div class="svg-chart-wrap" id="revenueTrendChart">
          <!-- Rendered SVG line/bar below -->
        </div>
      </div>
      <div class="chart-card">
        <h3 class="chart-title">Celebrations by Event Type</h3>
        <div class="svg-chart-wrap" id="eventTypeDonutChart">
          <!-- Rendered SVG Donut below -->
        </div>
      </div>
    </div>

    <!-- Upcoming Events Table -->
    <div class="data-table-card">
      <div class="table-toolbar">
        <h3 style="font-family:var(--font-heading); font-size:var(--text-base); margin:0;">Upcoming Events Schedule</h3>
        <a href="#/bookings" class="btn btn-xs btn-outline">View All Bookings &rarr;</a>
      </div>
      <div style="overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Ref #</th>
              <th>Customer</th>
              <th>Event / Date</th>
              <th>Pax</th>
              <th>Status</th>
              <th>Balance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${cachedBookings.slice(0, 6).map(b => `
              <tr>
                <td><strong>${b.ref}</strong></td>
                <td>${b.customer?.name || 'Customer'}</td>
                <td>${b.eventType || b.tag}<br><small style="color:var(--color-slate-60);">${b.eventDate || b.deliveryDate || 'TBD'}</small></td>
                <td>${b.pax || 'N/A'}</td>
                <td><span class="badge ${b.status === 'Hold' || b.status === 'Hold (48 Hours)' ? 'badge-rust' : 'badge-teal'}">${b.status}</span></td>
                <td>${formatPeso(b.balance || 0)}</td>
                <td>
                  <button type="button" class="btn btn-xs btn-outline btn-view-drawer" data-id="${b.id}">Details</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- New Inquiries Card from Contact Us -->
    <div class="data-table-card" style="margin-top: 1.5rem;">
      <div class="table-toolbar">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:var(--text-base); margin:0;">New Inquiries (${(JSON.parse(localStorage.getItem('tikim.inquiries') || '[]')).length})</h3>
          <span style="font-size: 0.8rem; color: var(--color-slate-60);">Submitted via Contact Us page</span>
        </div>
      </div>
      ${(JSON.parse(localStorage.getItem('tikim.inquiries') || '[]')).length === 0 ? `
        <div style="padding: 2rem; text-align: center; color: var(--color-slate-60); font-size: 0.9rem;">
          No new inquiries yet. Submissions from contact.html will appear here.
        </div>
      ` : `
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Occasion</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              ${(JSON.parse(localStorage.getItem('tikim.inquiries') || '[]')).map(inq => `
                <tr>
                  <td><small>${new Date(inq.createdAt).toLocaleDateString()}</small></td>
                  <td><strong>${inq.name}</strong></td>
                  <td><a href="tel:${inq.phone}" style="color: var(--color-teal);">${inq.phone}</a></td>
                  <td><span class="badge badge-teal">${inq.eventType}</span></td>
                  <td style="max-width: 320px; font-size: 0.85rem; color: var(--color-slate-80);">${inq.message}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    <!-- Business Analytics & CSV Export Summary -->
    <div class="kpi-cards-grid" style="margin-top: 1.5rem; margin-bottom: 1.5rem;">
      <div class="kpi-card">
        <span class="kpi-label">Average Order Value</span>
        <div class="kpi-value">₱112,400</div>
        <span class="kpi-subtext">Across catering events</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Most Popular Tier</span>
        <div class="kpi-value" style="font-size:1.3rem;">Grand Wedding</div>
        <span class="kpi-subtext">34% of all reservations</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Hold Conversion Rate</span>
        <div class="kpi-value" style="color:var(--color-teal);">88%</div>
        <span class="kpi-subtext">From 48h hold to confirmed</span>
      </div>
      <div class="kpi-card" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start; gap:0.5rem;">
        <span class="kpi-label">Logistics & Accounting</span>
        <button type="button" class="btn btn-sm btn-primary" id="btnDashboardExportCsvCard" style="width:100%;">Download Bookings CSV</button>
      </div>
    </div>
  `;

  // Draw pure SVG Charts
  drawRevenueTrendChart();
  drawEventTypeDonutChart();

  // Actions
  document.getElementById('btnDashboardExportCsv')?.addEventListener('click', triggerCsvDownload);
  document.getElementById('btnDashboardExportCsvCard')?.addEventListener('click', triggerCsvDownload);
  document.getElementById('btnQuickNewBooking')?.addEventListener('click', openManualBookingModal);
  container.querySelectorAll('.btn-view-drawer').forEach(btn => {
    btn.addEventListener('click', () => openBookingDrawer(btn.dataset.id));
  });
}

function drawRevenueTrendChart() {
  const mount = document.getElementById('revenueTrendChart');
  if (!mount) return;

  mount.innerHTML = `
    <svg viewBox="0 0 600 220" xmlns="http://www.w3.org/2000/svg">
      <!-- Grid Lines -->
      <line x1="40" y1="20" x2="580" y2="20" stroke="rgba(33,46,52,0.08)" stroke-dasharray="4"/>
      <line x1="40" y1="70" x2="580" y2="70" stroke="rgba(33,46,52,0.08)" stroke-dasharray="4"/>
      <line x1="40" y1="120" x2="580" y2="120" stroke="rgba(33,46,52,0.08)" stroke-dasharray="4"/>
      <line x1="40" y1="170" x2="580" y2="170" stroke="rgba(33,46,52,0.15)"/>
      
      <!-- Bars -->
      <rect x="70" y="110" width="36" height="60" rx="4" fill="#4fa49d" opacity="0.4"/>
      <rect x="150" y="80" width="36" height="90" rx="4" fill="#4fa49d" opacity="0.6"/>
      <rect x="230" y="50" width="36" height="120" rx="4" fill="#4fa49d" opacity="0.8"/>
      <rect x="310" y="30" width="36" height="140" rx="4" fill="#4fa49d"/>
      <rect x="390" y="70" width="36" height="100" rx="4" fill="#ab4b2e" opacity="0.8"/>
      <rect x="470" y="45" width="36" height="125" rx="4" fill="#4fa49d"/>

      <!-- Spline Line overlay -->
      <path d="M 88 110 Q 168 80 248 50 T 328 30 T 408 70 T 488 45" fill="none" stroke="#212e34" stroke-width="3"/>
      <circle cx="88" cy="110" r="5" fill="#212e34"/>
      <circle cx="168" cy="80" r="5" fill="#212e34"/>
      <circle cx="248" cy="50" r="5" fill="#212e34"/>
      <circle cx="328" cy="30" r="5" fill="#212e34"/>
      <circle cx="408" cy="70" r="5" fill="#ab4b2e"/>
      <circle cx="488" cy="45" r="5" fill="#212e34"/>

      <!-- Labels -->
      <text x="88" y="195" font-size="11" font-weight="bold" fill="#212e34" text-anchor="middle">Nov</text>
      <text x="168" y="195" font-size="11" font-weight="bold" fill="#212e34" text-anchor="middle">Dec</text>
      <text x="248" y="195" font-size="11" font-weight="bold" fill="#212e34" text-anchor="middle">Jan</text>
      <text x="328" y="195" font-size="11" font-weight="bold" fill="#212e34" text-anchor="middle">Feb</text>
      <text x="408" y="195" font-size="11" font-weight="bold" fill="#212e34" text-anchor="middle">Mar</text>
      <text x="488" y="195" font-size="11" font-weight="bold" fill="#212e34" text-anchor="middle">Apr</text>
    </svg>
  `;
}

function drawEventTypeDonutChart() {
  const mount = document.getElementById('eventTypeDonutChart');
  if (!mount) return;

  mount.innerHTML = `
    <svg viewBox="0 0 240 220" xmlns="http://www.w3.org/2000/svg">
      <circle cx="120" cy="100" r="70" fill="none" stroke="#4fa49d" stroke-width="26" stroke-dasharray="160 300" stroke-dashoffset="0"/>
      <circle cx="120" cy="100" r="70" fill="none" stroke="#ab4b2e" stroke-width="26" stroke-dasharray="100 300" stroke-dashoffset="-160"/>
      <circle cx="120" cy="100" r="70" fill="none" stroke="#212e34" stroke-width="26" stroke-dasharray="90 300" stroke-dashoffset="-260"/>
      <circle cx="120" cy="100" r="70" fill="none" stroke="#d97706" stroke-width="26" stroke-dasharray="50 300" stroke-dashoffset="-350"/>
      <text x="120" y="98" font-size="18" font-weight="800" fill="#212e34" text-anchor="middle">${cachedBookings.length}</text>
      <text x="120" y="114" font-size="10" font-weight="bold" fill="#4fa49d" text-anchor="middle">TOTAL</text>
      
      <!-- Legend -->
      <g transform="translate(20, 195)" font-size="9" font-weight="bold">
        <circle cx="10" cy="0" r="4" fill="#4fa49d"/>
        <text x="18" y="3" fill="#212e34">Weddings</text>
        <circle cx="75" cy="0" r="4" fill="#ab4b2e"/>
        <text x="83" y="3" fill="#212e34">Birthdays</text>
        <circle cx="140" cy="0" r="4" fill="#212e34"/>
        <text x="148" y="3" fill="#212e34">Corporate</text>
      </g>
    </svg>
  `;
}

/* --------------------------------------------------------------------------
   2. BOOKINGS VIEW
   -------------------------------------------------------------------------- */
function renderBookingsView(container, subTab = 'list') {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Bookings & Food Orders Master</h1>
        <p class="view-subtitle">Search, inspect floor plans, verify payments, and manage status lifecycles.</p>
      </div>
      <button type="button" class="btn btn-sm btn-primary" id="btnNewManualBooking">+ Create Manual Booking</button>
    </div>

    <div class="admin-subnav-tabs">
      <button type="button" class="admin-tab-btn ${subTab === 'list' ? 'active' : ''}" id="tabBtnBookingsList">All Bookings & Reservations (${cachedBookings.length})</button>
      <button type="button" class="admin-tab-btn ${subTab === 'quotations' ? 'active' : ''}" id="tabBtnQuotations">Quotation Proposal Generator</button>
    </div>

    <div id="bookingsTabContentMount"></div>
  `;

  document.getElementById('btnNewManualBooking').addEventListener('click', openManualBookingModal);

  document.getElementById('tabBtnBookingsList').addEventListener('click', () => {
    window.location.hash = '#/bookings';
  });

  document.getElementById('tabBtnQuotations').addEventListener('click', () => {
    window.location.hash = '#/quotations';
  });

  const mount = document.getElementById('bookingsTabContentMount');
  if (subTab === 'quotations') {
    renderQuotationsView(mount);
  } else {
    renderBookingsListContent(mount);
  }
}

function renderBookingsListContent(mount) {
  mount.innerHTML = `
    <div class="data-table-card">
      <div class="table-toolbar">
        <div class="table-filters-group">
          <input type="text" id="bookingsTableSearch" class="form-input input-sm" placeholder="Filter customer, ref, date...">
          <select id="bookingsStatusFilter" class="form-select select-sm">
            <option value="all">All Statuses</option>
            <option value="Hold">On Hold (48h)</option>
            <option value="Pending Verification">Pending Verification</option>
            <option value="Confirmed">Confirmed (50% Verified)</option>
            <option value="Fully Paid">Fully Paid</option>
            <option value="Event Day">Event Day</option>
            <option value="Completed">Completed</option>
            <option value="Released">Released</option>
          </select>
        </div>
        <div>
          <span style="font-size:12px; color:var(--color-slate-60); font-weight:700;" id="tableCountDisplay">
            ${cachedBookings.length} total entries
          </span>
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table class="admin-table" id="bookingsMasterTable">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer Contact</th>
              <th>Event Type / Service</th>
              <th>Date & Pax</th>
              <th>Status</th>
              <th>Financials</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="bookingsTableBody">
            <!-- Filtered rows -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderBookingsRows(cachedBookings);

  document.getElementById('bookingsTableSearch').addEventListener('input', (e) => {
    filterBookingsTable(e.target.value);
  });

  document.getElementById('bookingsStatusFilter').addEventListener('change', (e) => {
    const val = e.target.value;
    const filtered = val === 'all'
      ? cachedBookings
      : cachedBookings.filter(b =>
        b.status === val || (val === 'Hold' && b.status === 'Hold (48 Hours)')
      );
    renderBookingsRows(filtered);
  });
}

function renderBookingsRows(list) {
  const tbody = document.getElementById('bookingsTableBody');
  if (!tbody) return;

  if (bookingsLoading) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem;">Loading bookings from Laravel...</td></tr>';
    return;
  }

  if (bookingsError) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:1.5rem;">
          <div>${escapeAdminText(bookingsError)}</div>
          <button type="button" class="btn btn-xs btn-outline" id="btnRetryBookings" style="margin-top:0.5rem;">Retry</button>
        </td>
      </tr>
    `;
    tbody.querySelector('#btnRetryBookings')?.addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      await refreshBookings();
    });
    return;
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem;">No bookings found.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(b => {
    let badgeClass = 'badge-teal';
    let typeName = 'Event';
    if (b.type === 'food') {
      badgeClass = 'badge-teal';
      typeName = 'Food Package';
    } else if (b.type === 'trays' || b.type === 'food_order') {
      badgeClass = 'badge-rust';
      typeName = 'Food Trays';
    } else {
      badgeClass = 'badge-outline';
      typeName = 'Event';
    }

    const contactMethodLabel = b.customer?.contactMethod === 'messenger' && b.customer?.messengerName
      ? `<div style="font-size:11px; margin-top:2px; display:flex; align-items:center; gap:4px;">
           <span class="badge badge-teal" style="font-size:9px; padding:1px 4px;">Messenger</span>
           <span>${b.customer.messengerName}</span>
           <button type="button" class="btn-copy-messenger" data-name="${b.customer.messengerName}" title="Copy Messenger Name" style="background:#fff; border:1px solid #ccc; border-radius:3px; padding:0 4px; font-size:10px; cursor:pointer;">Copy</button>
         </div>`
      : `<div style="font-size:10px; color:var(--color-slate-60); margin-top:2px;">Pref: ${b.customer?.contactMethod === 'sms' ? 'Phone/SMS' : (b.customer?.contactMethod || 'Phone')}</div>`;

    return `
    <tr>
      <td>
        <strong>${b.ref}</strong>
        <br><span class="badge ${badgeClass}" style="font-size:9px;">${typeName}</span>
        ${(b.layout || b.layoutThumbnail || b.floorPlan) ? `<span class="badge badge-teal" style="font-size:9px; margin-left:2px;">Layout</span>` : ''}
      </td>
      <td>
        <strong>${b.customer?.name || 'Anonymous'}</strong>
        <div style="font-size:11px; color:var(--color-slate-60);">${b.customer?.mobile || 'No mobile'}</div>
        ${contactMethodLabel}
      </td>
      <td>
        ${b.eventType || b.tag || typeName}
        <div style="font-size:11px; color:var(--color-slate-60);">${b.packageName || (b.level ? `Food Package ${b.level}` : 'A la Carte')}</div>
      </td>
      <td>
        ${b.eventDate || b.deliveryDate || 'TBD'}
        <div style="font-size:11px; color:var(--color-slate-60);">${b.pax ? b.pax + ' Pax' : 'Trays Delivery'}</div>
      </td>
      <td>
        <span class="badge ${b.status === 'Hold' || b.status === 'Hold (48 Hours)' ? 'badge-rust' : (b.status === 'Pending Verification' ? 'badge-outline' : 'badge-teal')}">
          ${b.status}
        </span>
      </td>
      <td>
        <strong>${formatPeso(b.total || 0)}</strong>
        <div style="font-size:11px; color:var(--color-rust);">Bal: ${formatPeso(b.balance || 0)}</div>
      </td>
      <td>
        <button type="button" class="btn btn-xs btn-outline btn-open-booking-drawer" data-id="${b.id}">
          Manage &rarr;
        </button>
      </td>
    </tr>
  `;
  }).join('');

  tbody.querySelectorAll('.btn-open-booking-drawer').forEach(btn => {
    btn.addEventListener('click', () => openBookingDrawer(btn.dataset.id));
  });
}

function filterBookingsTable(term) {
  const filtered = cachedBookings.filter(b => {
    const str = `${b.ref} ${b.customer?.name} ${b.customer?.mobile} ${b.eventType} ${b.eventDate}`.toLowerCase();
    return str.includes(term);
  });
  renderBookingsRows(filtered);
}

/* --------------------------------------------------------------------------
   Booking Detail Drawer
   -------------------------------------------------------------------------- */
async function openBookingDrawer(bookingId, persistedQuote = null) {
  const bookingSummary = cachedBookings.find(b => String(b.id) === String(bookingId));
  if (!bookingSummary) return;

  const drawer = document.getElementById('adminDrawer');
  const title = document.getElementById('drawerTitle');
  const body = document.getElementById('adminDrawerBody');

  title.textContent = `Booking Details: ${bookingSummary.ref}`;
  drawer.style.display = 'flex';
  body.innerHTML = '<p style="padding:1rem; color:var(--color-slate-60);">Loading saved booking quote...</p>';

  let booking;
  if (persistedQuote) {
    booking = { ...bookingSummary, ...persistedQuote };
  } else {
    try {
      const result = await mockApi.getAdminBookingQuote(bookingSummary.id);
      booking = { ...bookingSummary, ...result.booking };
    } catch (error) {
      body.innerHTML = `<p role="alert" style="padding:1rem; color:var(--color-rust);">${escapeAdminText(error.message || 'Unable to load the saved booking quote.')}</p>`;
      showAdminToast(error.message || 'Unable to load the saved booking quote.', 'error');
      return;
    }
  }

  const quote = booking.quoteSnapshot;
  if (!Array.isArray(quote.lines)) {
    body.innerHTML = '<p role="alert" style="padding:1rem; color:var(--color-rust);">The saved booking quote is unavailable.</p>';
    return;
  }

  const unpricedItems = (quote.lines || []).filter(l => l.category === 'Add-on' || l.isTbc || l.isEstimate || l.category === 'Special Dish' || l.amount === 0);

  const messengerDetail = booking.customer?.contactMethod === 'messenger' && booking.customer?.messengerName
    ? `<div style="font-size:11px; margin-top:4px; display:flex; align-items:center; gap:6px;">
        <span class="badge badge-teal" style="font-size:9px;">Messenger</span>
      <strong>${escapeAdminText(booking.customer.messengerName)}</strong>
      <button type="button" class="btn-copy-messenger" data-name="${escapeAdminText(booking.customer.messengerName)}" style="background:#fff; border:1px solid #ccc; border-radius:4px; padding:2px 6px; font-size:10px; cursor:pointer;">Copy</button>
      </div>`
    : `<div style="font-size:11px; color:var(--color-slate-60); margin-top:2px;">Preferred Contact: ${escapeAdminText(booking.customer?.contactMethod === 'sms' ? 'Phone or SMS' : (booking.customer?.contactMethod || 'Phone'))}</div>`;

  const specPackage = booking.type === 'food'
    ? `Food Package ${booking.level || 1} (${booking.pax || 75} guests)`
    : (booking.type === 'trays' ? 'Food Trays' : `${escapeAdminText(booking.packageName || booking.occasion || 'Event Package')} (${booking.pax || 100} guests)`);

  const specPlan = booking.type === 'food'
    ? `Food Package ${booking.level || 1}`
    : (booking.type === 'trays' ? 'Party Trays Order' : `${escapeAdminText(booking.packageName || 'Event Package')} · Food Level ${booking.level || 1}`);
  const status = String(booking.status || 'Unknown');
  const bookingDate = booking.eventDate || booking.deliveryDate || '';
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isTerminalStatus = ['Completed', 'Cancelled', 'Expired'].includes(status);
  const canCancel = !isTerminalStatus;
  const canComplete = !isTerminalStatus && bookingDate && bookingDate <= todayString;
  const canReopen = ['Cancelled', 'Expired'].includes(status);
  const statusActions = [
    canCancel ? '<button type="button" class="btn btn-sm btn-outline" data-booking-action="cancel">Cancel Booking</button>' : '',
    canComplete ? '<button type="button" class="btn btn-sm btn-outline" data-booking-action="complete">Mark Completed</button>' : '',
    canReopen ? '<button type="button" class="btn btn-sm btn-outline" data-booking-action="reopen">Reopen Booking</button>' : ''
  ].filter(Boolean).join('');

  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--color-slate-05); padding:1rem; border-radius:8px;">
      <div>
        <strong style="font-size:14px;">${escapeAdminText(booking.customer?.name || 'Customer')}</strong>
        <div style="font-size:11px; color:var(--color-slate-60);">${escapeAdminText(booking.customer?.mobile || '')}</div>
        ${messengerDetail}
      </div>
      <span class="badge ${status === 'Hold' || status === 'Hold (48 Hours)' ? 'badge-rust' : (status === 'Pending Verification' ? 'badge-outline' : 'badge-teal')}">${escapeAdminText(status)}</span>
    </div>

    <div>
      <h4 style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--color-slate-60); margin-bottom:0.5rem;">Event Specifications</h4>
      <div style="font-size:12px; line-height:1.6;">
        <div><strong>Date & Time:</strong> ${escapeAdminText(booking.eventDate || booking.deliveryDate || 'TBD')} · ${escapeAdminText(booking.eventTime || booking.deliveryTime || '')}</div>
        <div><strong>Venue:</strong> ${escapeAdminText(booking.venue || booking.customer?.deliveryAddress || 'On-site')}</div>
        <div><strong>Package / Service:</strong> ${specPackage}</div>
        <div><strong>Plan & Level:</strong> ${specPlan}</div>
        <div><strong>Name on Board:</strong> ${escapeAdminText(booking.stageText?.name?.trim() || 'Not provided')}</div>
        <div><strong>Theme / Palette:</strong> ${escapeAdminText(booking.stageText?.character?.trim() || 'Not provided')}</div>
      </div>
    </div>

    <!-- Financials Box -->
    <div style="background:rgba(79,164,157,0.1); border:1px solid var(--color-teal); border-radius:8px; padding:1rem;">
      <h4 style="font-size:12px; font-weight:700; color:var(--color-slate); margin:0 0 0.5rem;">Financials & Payments</h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:0.35rem 0.75rem; font-size:12px;">
        <span>Subtotal: <strong data-quote-preview="subtotal">${formatPeso(booking.subtotal || 0)}</strong></span>
        <span>Organizer Discount: <strong data-quote-preview="discount">${formatPeso(booking.discount || 0)}</strong></span>
        <span>Total: <strong data-quote-preview="total">${formatPeso(booking.total || 0)}</strong></span>
        <span>${booking.type === 'trays' ? 'Pay in full' : 'Required Downpayment'}: <strong data-quote-preview="downpayment">${formatPeso(booking.downpaymentRequired || 0)}</strong></span>
        <span>Amount Paid: <strong data-quote-preview="paid" style="color:var(--color-teal);">${formatPeso(booking.paidAmount || 0)}</strong></span>
        <span>Remaining Balance: <strong data-quote-preview="balance" style="color:var(--color-rust);">${formatPeso(booking.balance || 0)}</strong></span>
      </div>
    </div>

    <!-- Itemized Quotation Snapshot -->
    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <h4 style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--color-slate-60); margin:0;">Itemized Quotation Breakdown</h4>
        ${quote.hasTbc ? '<span class="badge-assumed">Awaiting Final Quote (TBC)</span>' : '<span style="font-size:10px; font-weight:700; color:var(--color-teal); background:rgba(79,164,157,0.15); padding:2px 6px; border-radius:4px;">Quote Locked</span>'}
      </div>
      <div style="display:flex; flex-direction:column; gap:0.4rem; font-size:12px;">
        ${(quote.lines || []).map(line => `
          <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #f1f5f9; padding-bottom:0.3rem;">
            <div>
              <div style="font-weight:600;">${escapeAdminText(line.name)}</div>
              <div style="font-size:11px; color:var(--color-slate-60);">${escapeAdminText(line.formula || '')}</div>
            </div>
            <div style="font-weight:700; color:${line.isTbc ? 'var(--color-rust)' : 'var(--color-slate)'};">
              ${line.isTbc ? 'To be quoted' : formatPeso(line.amount)}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Organizer Quote Builder for TBC items and adjustments -->
    <div style="background:rgba(171,75,46,0.06); border:1px solid rgba(171,75,46,0.25); border-radius:8px; padding:1rem;">
      <h4 style="font-size:12px; font-weight:700; color:var(--color-rust); margin:0 0 0.4rem;">Organizer Quote Builder & Adjustments</h4>
      <p style="font-size:11px; color:var(--color-slate-60); margin-bottom:0.75rem;">Set prices for unquoted items, special dishes, or apply organizer discounts to update the booking snapshot.</p>
      
      <div style="display:flex; flex-direction:column; gap:0.5rem;" id="drawerTbcItemsContainer">
        ${unpricedItems.map(item => `
          <div class="quote-drawer-tbc-item">
            <span style="font-size:12px; font-weight:600;">${escapeAdminText(item.name)}</span>
            <div style="display:flex; align-items:center; gap:0.25rem;">
              <span style="font-size:11px; color:var(--color-slate-60);">${item.quantity} × ₱</span>
              <input type="number" min="0" step="1" class="drawer-tbc-input field-input" style="width:110px; padding:0.25rem 0.5rem; font-size:12px;" data-item-id="${item.bookingItemId}" placeholder="Unit price" value="${item.unitPrice}">
            </div>
          </div>
        `).join('')}

        <div class="quote-drawer-tbc-item">
          <span style="font-size:12px; font-weight:600;">Organizer Discount</span>
          <div style="display:flex; align-items:center; gap:0.25rem;">
            <span style="font-size:12px; color:var(--color-slate-60);">-₱</span>
            <input type="number" min="0" step="1" id="drawerDiscountInput" class="field-input" style="width:110px; padding:0.25rem 0.5rem; font-size:12px;" placeholder="0" value="${booking.discount || ''}">
          </div>
        </div>

        <label for="drawerQuoteReason" style="font-size:12px; font-weight:600;">Reason for quote revision</label>
        <textarea id="drawerQuoteReason" class="field-input" rows="2" maxlength="1000" required placeholder="Required for the quote history"></textarea>
        <p id="drawerQuoteFeedback" role="alert" style="display:none; margin:0; color:var(--color-rust); font-size:11px;"></p>

        <button type="button" class="btn btn-xs btn-primary" id="btnSaveDrawerQuote" style="margin-top:0.5rem; align-self:flex-start;">
        Save & Lock Quotation Snapshot
        </button>
      </div>
    </div>

    <!-- Floor Plan Section (Revision 17B Part 5.3) -->
    <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid #e2e8f0;">
      <h4 style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--color-slate-60); margin-bottom:0.5rem;">Floor Plan</h4>
      ${(booking.layout || booking.floorPlan) ? `
        <div style="background:#faf7f2; border-radius:8px; padding:0.75rem; border:1px solid #e4dbcf;">
          <div id="adminLayoutPreviewMount" style="width:100%; border-radius:6px; overflow:hidden;">
            ${renderLayoutPreviewSvg(booking.layout || booking.floorPlan, { maxHeight: '220px' })}
          </div>
          <div style="font-size:12px; color:#212e34; margin-top:0.5rem; font-weight:500;">
            Confirmed by customer on ${escapeAdminText(booking.layout?.confirmedAt ? new Date(booking.layout.confirmedAt).toLocaleString('en-PH') : 'Reservation submission')}
          </div>
          <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
            <button type="button" class="btn btn-xs btn-outline" id="btnAdminOpenLayout">Open layout</button>
            <button type="button" class="btn btn-xs btn-outline" id="btnAdminDownloadJson">Download JSON</button>
          </div>
        </div>
      ` : `
        <div style="font-size:13px; color:#64748b; padding:0.5rem 0;">No floor plan</div>
      `}
    </div>

    <div style="background:rgba(79,164,157,0.08); border:1px solid var(--color-teal); border-radius:8px; padding:0.85rem; margin-top:1rem;">
      <div style="font-size:12px; font-weight:700; color:var(--color-slate); margin-bottom:0.5rem;">Payment Verification</div>
      <div style="font-size:11px; color:var(--color-slate-60);">Payment proofs are stored securely in Laravel. Open the Payment Verification Queue to inspect receipts and review submissions.</div>
      <a href="#/payments" class="btn btn-xs btn-outline" style="margin-top:0.6rem;">Open Payment Queue</a>
    </div>

    <div style="display:flex; justify-content:space-between; margin-top:1rem; border-top:1px solid #eee; padding-top:1rem;">
      <button type="button" class="btn btn-sm btn-outline" id="btnPrintBookingSummary">Print Official Contract</button>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:flex-end;">
        ${statusActions}
      </div>
    </div>
    <div id="bookingStatusFeedback" role="status" style="font-size:12px; margin-top:0.5rem;"></div>
  `;

  body.querySelectorAll('[data-booking-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.dataset.bookingAction;
      const confirmAction = action === 'cancel';
      const refundWarning = Number(booking.paidAmount || 0) > 0
        ? ' Approved payment history will remain recorded; no refund will be processed automatically.'
        : '';

      if (confirmAction) {
        const confirmed = window.showConfirmDialog
          ? await window.showConfirmDialog({
            title: 'Cancel this booking?',
            desc: `This will release this booking's date lock.${refundWarning}`,
            confirmText: 'Cancel Booking'
          })
          : window.confirm(`Cancel booking ${booking.ref}?${refundWarning}`);
        if (!confirmed) return;
      }

      const feedback = document.getElementById('bookingStatusFeedback');
      body.querySelectorAll('[data-booking-action]').forEach(actionButton => {
        actionButton.disabled = true;
      });
      button.textContent = 'Saving...';
      if (feedback) {
        feedback.textContent = 'Saving booking status...';
        feedback.style.color = 'var(--color-slate-60)';
      }

      try {
        const result = await mockApi.updateBookingStatus(booking.id, action);
        await refreshGlobalData();
        renderCurrentRoute();
        const updatedBooking = cachedBookings.find(item => String(item.id) === String(booking.id));
        if (updatedBooking) openBookingDrawer(updatedBooking.id);
        showAdminToast(result.warning || result.message || 'Booking status updated.', 'success');
      } catch (error) {
        if (feedback) {
          feedback.textContent = error.message || 'Unable to update booking status.';
          feedback.style.color = 'var(--color-rust)';
        }
        showAdminToast(error.message || 'Unable to update booking status.', 'error');
        button.disabled = false;
        button.textContent = action === 'cancel'
          ? 'Cancel Booking'
          : (action === 'complete' ? 'Mark Completed' : 'Reopen Booking');
      }
    });
  });

  const btnDlJson = document.getElementById('btnAdminDownloadJson');
  if (btnDlJson) {
    btnDlJson.addEventListener('click', () => {
      const layoutData = booking.layout || booking.floorPlan || {};
      const blob = new Blob([JSON.stringify(layoutData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booking-${booking.ref || 'layout'}-floorplan.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const btnOpenLayout = document.getElementById('btnAdminOpenLayout');
  if (btnOpenLayout) {
    btnOpenLayout.addEventListener('click', () => {
      const layoutData = booking.layout || booking.floorPlan;
      if (!layoutData) return;
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop is-open';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1.5rem;';
      modal.innerHTML = `
        <div style="background:#ffffff; border-radius:12px; max-width:860px; width:100%; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,0.25);">
          <div style="padding:1rem 1.25rem; background:#212e34; color:#faf7f2; display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:1.1rem; color:#faf7f2;">Floor Plan Layout (Read-Only) · ${escapeAdminText(booking.ref)}</h3>
            <button type="button" id="btnCloseLayoutModal" style="background:none; border:none; color:#faf7f2; font-size:1.5rem; cursor:pointer;">&times;</button>
          </div>
          <div style="padding:1.5rem; overflow:auto; display:flex; justify-content:center; background:#faf7f2;">
            ${renderLayoutPreviewSvg(layoutData, { maxHeight: '70vh' })}
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#btnCloseLayoutModal').onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    });
  }

  const btnSaveQuote = document.getElementById('btnSaveDrawerQuote');
  attachAdminQuotePreview({
    root: body,
    lines: quote.lines,
    downpaymentPercent: booking.downpaymentPercent,
    paidAmount: booking.paidAmount,
    bookingType: booking.type
  });

  if (btnSaveQuote) {
    btnSaveQuote.addEventListener('click', async () => {
      const feedback = document.getElementById('drawerQuoteFeedback');
      const reason = document.getElementById('drawerQuoteReason')?.value.trim() || '';
      const discountInput = document.getElementById('drawerDiscountInput')?.value ?? '';
      const discount = Number(discountInput);
      const lineOverrides = [...document.querySelectorAll('.drawer-tbc-input')].map(input => ({
        booking_item_id: Number(input.dataset.itemId),
        unit_price: Number(input.value)
      }));

      const invalidOverride = lineOverrides.some(item =>
        !Number.isSafeInteger(item.booking_item_id) ||
        !Number.isSafeInteger(item.unit_price) ||
        item.unit_price < 0
      );
      if (!reason || !Number.isSafeInteger(discount) || discount < 0 || invalidOverride) {
        feedback.textContent = !reason
          ? 'Enter a reason for this quote revision.'
          : 'Enter valid nonnegative whole-peso prices and discount.';
        feedback.style.display = 'block';
        return;
      }

      feedback.style.display = 'none';
      btnSaveQuote.disabled = true;
      btnSaveQuote.textContent = 'Saving quote...';

      try {
        const result = await mockApi.updateBookingQuote(booking.id, {
          line_overrides: lineOverrides,
          discount,
          reason
        });

        showAdminToast(`Quotation snapshot updated for ${booking.ref}`, 'success');
        await refreshGlobalData();
        await openBookingDrawer(booking.id, result.booking);
      } catch (error) {
        feedback.textContent = error.message || 'Unable to update the booking quote.';
        feedback.style.display = 'block';
        showAdminToast(feedback.textContent, 'error');
        btnSaveQuote.disabled = false;
        btnSaveQuote.textContent = 'Save & Lock Quotation Snapshot';
      }
    });
  }

  document.getElementById('btnPrintBookingSummary').addEventListener('click', () => {
    window.print();
  });

  drawer.style.display = 'flex';
}

/* --------------------------------------------------------------------------
   Manual Booking Modal
   -------------------------------------------------------------------------- */
async function openManualBookingModal() {
  let catalog;
  try {
    catalog = await mockApi.getManualBookingCatalog();
  } catch (error) {
    showAdminToast(error.message || 'Unable to load booking options.', 'error');
    return;
  }

  document.getElementById('manualBookingModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'manualBookingModal';
  modal.style.cssText = 'position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:1rem; background:rgba(15,23,42,.62);';
  const eventPackages = catalog.eventPackages || [];
  const dishes = catalog.dishes || [];
  const addOns = catalog.addOns || [];
  const trays = catalog.trays || [];
  const fieldStyle = 'width:100%; padding:.6rem; border:1px solid #cbd5e1; border-radius:6px; background:#fff;';
  const labelStyle = 'display:block; font-size:12px; font-weight:700; margin-bottom:.3rem;';

  modal.innerHTML = `
    <section role="dialog" aria-modal="true" aria-labelledby="manualBookingTitle" style="background:#fff; border-radius:12px; width:min(760px,100%); max-height:90vh; display:flex; flex-direction:column; box-shadow:0 12px 40px rgba(0,0,0,.25);">
      <header style="padding:1rem 1.25rem; background:#212e34; color:#faf7f2; display:flex; justify-content:space-between; align-items:center;">
        <h2 id="manualBookingTitle" style="font-size:1.1rem; margin:0; color:#faf7f2;">Create Manual Booking</h2>
        <button type="button" data-manual-close aria-label="Close" style="background:none; border:0; color:#fff; font-size:1.5rem; cursor:pointer;">&times;</button>
      </header>
      <form id="manualBookingForm" style="padding:1.25rem; overflow:auto; display:grid; gap:1rem;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:.8rem;">
          <label style="${labelStyle}">Booking type
            <select name="type" required style="${fieldStyle}"><option value="event">Event</option><option value="food">Food</option><option value="trays">Food Trays</option></select>
          </label>
          <label style="${labelStyle}">Event / delivery date
            <input name="eventDate" type="date" required style="${fieldStyle}">
          </label>
          <label style="${labelStyle}">Customer full name
            <input name="customerName" maxlength="160" required style="${fieldStyle}">
          </label>
          <label style="${labelStyle}">Mobile number
            <input name="mobile" type="tel" maxlength="30" required style="${fieldStyle}" placeholder="09XX...">
          </label>
          <label data-manual-pax style="${labelStyle}">Guest count
            <input name="pax" type="number" min="1" max="5000" value="100" required style="${fieldStyle}">
          </label>
          <label data-manual-package style="${labelStyle}">Event package
            <select name="packageId" required style="${fieldStyle}">
              <option value="">Select a package</option>
              ${eventPackages.map(item => `<option value="${escapeAdminText(item.code)}">${escapeAdminText(item.name)}</option>`).join('')}
            </select>
          </label>
          <label data-manual-level style="${labelStyle}">Food package level
            <select name="level" required style="${fieldStyle}">
              ${(catalog.foodPackages || []).map(item => `<option value="${Number(item.level)}">Level ${Number(item.level)} - ${escapeAdminText(item.name)}</option>`).join('')}
            </select>
          </label>
          <label style="${labelStyle}">Event time (optional)
            <input name="eventTime" maxlength="40" style="${fieldStyle}" placeholder="e.g. 5:00 PM">
          </label>
          <label style="${labelStyle}">Venue (optional)
            <input name="venue" maxlength="255" style="${fieldStyle}">
          </label>
        </div>
        <details>
          <summary style="font-weight:700; cursor:pointer;">Menu selections and add-ons (optional)</summary>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:1rem; margin-top:.8rem;">
            <fieldset style="border:1px solid #e2e8f0; border-radius:6px; padding:.7rem; max-height:190px; overflow:auto;">
              <legend style="font-weight:700; font-size:12px;">Menu selections</legend>
              ${dishes.map(item => `<label style="display:block; font-size:12px; padding:.2rem;"><input type="checkbox" data-manual-dish value="${escapeAdminText(item.code)}"> ${escapeAdminText(item.name)}</label>`).join('') || '<span>No menu selections available.</span>'}
            </fieldset>
            <fieldset style="border:1px solid #e2e8f0; border-radius:6px; padding:.7rem; max-height:190px; overflow:auto;">
              <legend style="font-weight:700; font-size:12px;">Add-ons</legend>
              ${addOns.map(item => `<label style="display:flex; gap:.4rem; align-items:center; font-size:12px; padding:.2rem;"><input type="checkbox" data-manual-addon value="${escapeAdminText(item.code)}"> ${escapeAdminText(item.label)} <input type="number" data-manual-addon-quantity min="1" max="1000" value="1" aria-label="${escapeAdminText(item.label)} quantity" style="width:54px;"></label>`).join('') || '<span>No add-ons available.</span>'}
            </fieldset>
            <fieldset data-manual-trays style="display:none; border:1px solid #e2e8f0; border-radius:6px; padding:.7rem; max-height:190px; overflow:auto;">
              <legend style="font-weight:700; font-size:12px;">Food trays</legend>
              ${trays.map(item => `<label style="display:flex; gap:.4rem; align-items:center; font-size:12px; padding:.2rem;"><input type="checkbox" data-manual-tray value="${escapeAdminText(item.code)}"> ${escapeAdminText(item.name)} (${escapeAdminText(item.category || '')}) <input type="number" data-manual-tray-quantity min="1" max="1000" value="1" aria-label="${escapeAdminText(item.name)} quantity" style="width:54px;"></label>`).join('') || '<span>No trays available.</span>'}
            </fieldset>
          </div>
        </details>
        <label style="${labelStyle}">Customer notes (optional)
          <textarea name="notes" maxlength="5000" rows="2" style="${fieldStyle}"></textarea>
        </label>
        <section data-manual-preview aria-live="polite" style="border:1px solid #e2e8f0; border-radius:8px; padding:.85rem;">
          <strong>Price preview</strong>
          <p data-manual-preview-state style="margin:.4rem 0 0; color:#64748b;">Calculating price...</p>
          <div data-manual-preview-breakdown hidden style="margin-top:.6rem; font-size:14px;">
            <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><strong data-preview-subtotal></strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Discount</span><strong data-preview-discount></strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Total</span><strong data-preview-total></strong></div>
            <div style="display:flex; justify-content:space-between;"><span data-preview-payment-label></span><strong data-preview-payment></strong></div>
            <p data-preview-lines style="margin:.45rem 0 0; color:#64748b;"></p>
          </div>
        </section>
        <p data-manual-feedback role="alert" style="display:none; color:var(--color-rust); margin:0;"></p>
        <footer style="display:flex; justify-content:flex-end; gap:.6rem;">
          <button type="button" class="btn btn-sm btn-outline" data-manual-close>Cancel</button>
          <button type="submit" class="btn btn-sm btn-primary" disabled>Create Booking</button>
        </footer>
      </form>
    </section>
  `;
  document.body.appendChild(modal);

  const form = modal.querySelector('#manualBookingForm');
  const typeInput = form.elements.type;
  const submit = form.querySelector('[type="submit"]');
  const previewState = form.querySelector('[data-manual-preview-state]');
  const previewBreakdown = form.querySelector('[data-manual-preview-breakdown]');
  let previewTimer;
  let previewSequence = 0;
  let previewSignature = null;
  let previewLoading = false;
  let creating = false;
  const formatMoney = amount => `₱${Number(amount).toLocaleString('en-PH')}`;
  const buildPayload = () => {
    const type = typeInput.value;
    const payload = {
      type,
      customerName: form.elements.customerName.value.trim(),
      mobile: form.elements.mobile.value.trim(),
      eventDate: form.elements.eventDate.value,
      eventTime: form.elements.eventTime.value.trim() || null,
      venue: form.elements.venue.value.trim() || null,
      notes: form.elements.notes.value.trim() || null,
      dishes: [...form.querySelectorAll('[data-manual-dish]:checked')].map(input => input.value),
      addOns: [...form.querySelectorAll('[data-manual-addon]:checked')].map(input => ({
        id: input.value,
        quantity: Number(input.parentElement.querySelector('[data-manual-addon-quantity]').value)
      }))
    };
    if (type !== 'trays') {
      payload.pax = Number(form.elements.pax.value);
      payload.level = Number(form.elements.level.value);
    }
    if (type === 'event') payload.packageId = form.elements.packageId.value;
    if (type === 'trays') {
      payload.trays = [...form.querySelectorAll('[data-manual-tray]:checked')].map(input => ({
        id: input.value,
        qty: Number(input.parentElement.querySelector('[data-manual-tray-quantity]').value)
      }));
    }
    return payload;
  };
  const syncSubmitState = () => {
    submit.disabled = creating || previewLoading || !previewSignature;
    submit.textContent = creating ? 'Creating booking...' : 'Create Booking';
  };
  const renderPreview = preview => {
    form.querySelector('[data-preview-subtotal]').textContent = formatMoney(preview.subtotal);
    form.querySelector('[data-preview-discount]').textContent = formatMoney(preview.discount);
    form.querySelector('[data-preview-total]').textContent = formatMoney(preview.total);
    form.querySelector('[data-preview-payment-label]').textContent =
      `${preview.paymentLabel} (${Number(preview.paymentPercent)}%)`;
    form.querySelector('[data-preview-payment]').textContent = formatMoney(preview.paymentAmount);
    form.querySelector('[data-preview-lines]').textContent = preview.lines
      .map(line => `${line.quantity} x ${line.name}: ${formatMoney(line.total)}`)
      .join(' · ');
    previewBreakdown.hidden = false;
  };
  const requestPreview = () => {
    window.clearTimeout(previewTimer);
    const sequence = ++previewSequence;
    previewSignature = null;
    previewLoading = true;
    previewBreakdown.hidden = true;
    previewState.textContent = 'Calculating price...';
    previewState.style.color = '#64748b';
    syncSubmitState();
    const payload = buildPayload();
    const signature = JSON.stringify(payload);
    previewTimer = window.setTimeout(async () => {
      try {
        const preview = await mockApi.previewManualBooking(payload);
        if (sequence !== previewSequence || !form.isConnected) return;
        previewSignature = signature;
        previewState.textContent = `Calculated by the server · ${Number(preview.paymentPercent)}% payment required`;
        previewState.style.color = '#166534';
        renderPreview(preview);
      } catch (error) {
        if (sequence !== previewSequence || !form.isConnected) return;
        previewState.textContent = error.message || 'Unable to calculate this price.';
        previewState.style.color = 'var(--color-rust)';
      } finally {
        if (sequence === previewSequence && form.isConnected) {
          previewLoading = false;
          syncSubmitState();
        }
      }
    }, 250);
  };
  const updateTypeFields = () => {
    const type = typeInput.value;
    form.querySelector('[data-manual-pax]').style.display = type === 'trays' ? 'none' : 'block';
    form.elements.pax.required = type !== 'trays';
    form.querySelector('[data-manual-package]').style.display = type === 'event' ? 'block' : 'none';
    form.elements.packageId.required = type === 'event';
    form.querySelector('[data-manual-level]').style.display = type === 'trays' ? 'none' : 'block';
    form.elements.level.required = type !== 'trays';
    form.querySelector('[data-manual-trays]').style.display = type === 'trays' ? 'block' : 'none';
  };
  typeInput.addEventListener('change', () => {
    updateTypeFields();
    requestPreview();
  });
  updateTypeFields();
  form.addEventListener('input', requestPreview);
  form.addEventListener('change', requestPreview);
  modal.querySelectorAll('[data-manual-close]').forEach(button => button.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', event => {
    if (event.target === modal) modal.remove();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const feedback = form.querySelector('[data-manual-feedback]');
    const payload = buildPayload();
    if (creating || previewLoading || previewSignature !== JSON.stringify(payload)) {
      feedback.textContent = 'Wait for a valid price preview before creating the booking.';
      feedback.style.display = 'block';
      return;
    }

    feedback.style.display = 'none';
    creating = true;
    syncSubmitState();
    try {
      const booking = await mockApi.createManualBooking(payload);
      modal.remove();
      showAdminToast(`Created manual booking ${booking.ref}.`, 'success');
      await refreshGlobalData();
      renderCurrentRoute();
    } catch (error) {
      feedback.textContent = error.message || 'Unable to create the manual booking.';
      feedback.style.display = 'block';
    } finally {
      creating = false;
      syncSubmitState();
    }
  });
  requestPreview();
}

/* --------------------------------------------------------------------------
   3. QUOTATION BUILDER VIEW
   -------------------------------------------------------------------------- */
function renderQuotationsView(container) {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Quotation Proposal Generator</h1>
        <p class="view-subtitle">Instant quote builder utilizing the same verified calculation engine.</p>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:2rem;">
      <div class="step-card">
        <h3 class="step-subheading">Event Parameters</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Event Type</label>
            <select id="quoteGenType" class="form-select">
              <option value="Wedding">Wedding</option>
              <option value="Birthday">Birthday</option>
              <option value="Corporate">Corporate</option>
              <option value="Party">Party</option>
              <option value="Reunion">Reunion</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Guest Count (Pax)</label>
            <input type="number" id="quoteGenPax" class="form-input" value="100" min="30">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Package Tier</label>
          <select id="quoteGenPackage" class="form-select">
            ${cachedPackages.map(p => `<option value="${p.id}">${p.name} (Base ₱${p.basePrice.toLocaleString()})</option>`).join('')}
            <option value="custom">A la Carte Custom Setup</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Coordinator Custom Surcharge / Travel Fee (₱)</label>
          <input type="number" id="quoteGenExtraFee" class="form-input" value="0">
        </div>

        <div class="form-group">
          <label class="form-label">Manual Discount (₱)</label>
          <input type="number" id="quoteGenDiscount" class="form-input" value="0">
        </div>

        <button type="button" class="btn btn-primary btn-block" id="btnCalculateAdminQuote">
          Recalculate Quotation
        </button>
      </div>

      <!-- Preview Column -->
      <div class="step-card" style="background:#ffffff; border:1px solid var(--color-slate-10);">
        <h3 class="step-subheading">Live Proposal Breakdown</h3>
        <div id="adminQuoteBreakdownBody" style="font-size:12px; min-height:220px; display:flex; flex-direction:column; gap:0.5rem;">
          <!-- Dynamically computed -->
        </div>

        <div style="border-top:1px dashed #ccc; padding-top:1rem; margin-top:1rem; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; color:var(--color-slate-60);">50% Downpayment Required</div>
            <strong id="adminQuoteDownpayment" style="font-size:1.1rem; color:var(--color-rust);">₱0</strong>
          </div>
          <button type="button" class="btn btn-sm btn-outline" id="btnPrintQuotePdf">Save as PDF</button>
        </div>
      </div>
    </div>
  `;

  const runCalc = () => {
    const pkgId = document.getElementById('quoteGenPackage').value;
    const pax = Number(document.getElementById('quoteGenPax').value) || 100;
    const extraFee = Number(document.getElementById('quoteGenExtraFee').value) || 0;
    const discount = Number(document.getElementById('quoteGenDiscount').value) || 0;
    const pkgObj = cachedPackages.find(p => p.id === pkgId) || null;

    const extras = extraFee > 0 ? [{ name: 'Venue / Logistics Travel Surcharge', amount: extraFee }] : [];

    const quote = calculateQuotation({
      pax,
      packageObj: pkgObj,
      organizerExtras: extras,
      manualDiscount: discount
    });

    const body = document.getElementById('adminQuoteBreakdownBody');
    body.innerHTML = quote.lines.map(l => `
      <div style="display:flex; justify-content:space-between; padding:0.35rem 0; border-bottom:1px solid #f0f0f0;">
        <span>${l.name}</span>
        <strong>${formatPeso(l.total)}</strong>
      </div>
    `).join('') + `
      <div style="display:flex; justify-content:space-between; margin-top:0.5rem; font-size:14px; font-weight:800; color:var(--color-slate);">
        <span>Total:</span>
        <span>${quote.formatted.total}</span>
      </div>
    `;

    document.getElementById('adminQuoteDownpayment').textContent = quote.formatted.downpaymentRequired;
  };

  document.getElementById('btnCalculateAdminQuote').addEventListener('click', runCalc);
  document.getElementById('btnPrintQuotePdf').addEventListener('click', () => window.print());
  runCalc();
}

/* --------------------------------------------------------------------------
   4. CALENDAR & HOLDS VIEW
   -------------------------------------------------------------------------- */
function renderCalendarView(container) {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Master Schedule & Date Hold Calendar</h1>
        <p class="view-subtitle">Double-booking prevention: single event per date enforcement and date hold audit.</p>
      </div>
    </div>

    <div class="step-card" style="padding:1rem;">
      <div id="adminMasterCalendarContainer"></div>
    </div>
  `;

  const mount = document.getElementById('adminMasterCalendarContainer');
  if (mount) {
    new AdminMasterCalendar(mount, {
      onOpenDrawer: (bookingId) => openBookingDrawer(bookingId),
      onStateChanged: async () => {
        await refreshGlobalData();
      }
    });
  }
}


/* --------------------------------------------------------------------------
   5. PACKAGES & MENU VIEW (With Rentals Catalog & 3D Assets)
   -------------------------------------------------------------------------- */
function renderPackagesMenuView(container, subTab = 'packages') {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Packages, Menu & Pricing Configuration</h1>
        <p class="view-subtitle">Single source of truth (pricing.json) editor, live quote simulator, and culinary catalog.</p>
      </div>
    </div>

    <div class="admin-subnav-tabs">
      <button type="button" class="admin-tab-btn ${subTab === 'packages' ? 'active' : ''}" id="tabBtnPackages">Pricing & Packages Editor</button>
      <button type="button" class="admin-tab-btn ${subTab === 'menu' ? 'active' : ''}" id="tabBtnMenu">Heritage Menu & Trays (${cachedDishes.length})</button>
      <button type="button" class="admin-tab-btn ${subTab === 'rentals' ? 'active' : ''}" id="tabBtnRentals">Equipment Catalog (${cachedInventory.length})</button>
    </div>

    <div id="packagesMenuTabMount"></div>
  `;

  document.getElementById('tabBtnPackages').addEventListener('click', () => {
    window.location.hash = '#/packages';
  });

  document.getElementById('tabBtnMenu').addEventListener('click', () => {
    window.location.hash = '#/menu';
  });

  document.getElementById('tabBtnRentals').addEventListener('click', () => {
    renderPackagesMenuView(container, 'rentals');
  });

  const mount = document.getElementById('packagesMenuTabMount');
  if (subTab === 'menu') {
    renderMenuView(mount);
  } else if (subTab === 'rentals') {
    renderRentalsCatalogTab(mount);
  } else {
    renderPackagesView(mount);
  }
}

function renderRentalsCatalogTab(mount) {
  mount.innerHTML = `
    <div class="data-table-card">
      <div class="table-toolbar">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:var(--text-base); margin:0;">Event Rentals & Interactive 3D Equipment</h3>
          <span style="font-size: 0.8rem; color: var(--color-slate-60);">Catalog of tables, chairs, arches, and equipment included in packages or available on request.</span>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Category</th>
              <th>Total Fleet</th>
              <th>Available</th>
              <th>Inclusion Policy</th>
              <th>Condition</th>
              <th>3D Status</th>
            </tr>
          </thead>
          <tbody>
            ${cachedInventory.map(item => `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td><span class="badge badge-outline">${item.category}</span></td>
                <td>${item.totalQuantity} units</td>
                <td><strong style="color:var(--color-teal);">${item.availableQuantity} units</strong></td>
                <td><span class="badge badge-teal">${item.badge || 'Included in all packages'}</span></td>
                <td><span class="badge ${item.condition === 'Good' ? 'badge-teal' : 'badge-rust'}">${item.condition}</span></td>
                <td>
                  <span class="badge ${item.model3d ? 'badge-teal' : 'badge-outline'}">
                    ${item.model3d ? '3D Model Ready' : 'Interactive Code'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPackagesView(container) {
  const currentCfg = JSON.parse(JSON.stringify(getPricingConfig()));

  // Local state for simulator
  const simState = {
    eventType: 'party',
    pax: 100,
    plan: 'allin',
    level: 1,
    stageVariant: 'none',
    extraBeef: false,
    extraChicken: false,
    includeTbc: false
  };

  container.innerHTML = `
    <div class="pricing-editor-layout">
      <!-- LEFT: Editor Form Sections -->
      <div class="pricing-editor-sections">
        
        <!-- Action Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; background:#fff; padding:1rem 1.25rem; border-radius:10px; border:1px solid #e2e8f0;">
          <div>
            <strong style="font-size:14px; color:var(--color-slate);">Master Pricing Parameters</strong>
            <div style="font-size:11px; color:var(--color-slate-60);">Saves directly to localStorage key <code>tikim.pricing</code></div>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-xs btn-outline" id="btnResetPricing">Reset to Defaults</button>
            <button type="button" class="btn btn-xs btn-primary" id="btnSavePricing">Save Pricing Overrides</button>
          </div>
        </div>

        <!-- 1. Global Policies -->
        <div class="pricing-section-card">
          <div class="pricing-section-title">
            <span>Global Event Policies</span>
          </div>
          <div class="pricing-fields-grid">
            <div class="field-group">
              <label class="field-label">Min Pax</label>
              <input type="number" class="field-input" id="cfgMinPax" value="${currentCfg.minPax}">
            </div>
            <div class="field-group">
              <label class="field-label">
                Under-Min Flat (₱)
                <span class="badge-assumed">Assumed</span>
              </label>
              <input type="number" class="field-input" id="cfgUnderMinFlat" value="${currentCfg.underMinFlat}">
            </div>
            <div class="field-group">
              <label class="field-label">
                Soft Max Pax
                <span class="badge-assumed">Assumed</span>
              </label>
              <input type="number" class="field-input" id="cfgSoftMaxPax" value="${currentCfg.softMaxPax}">
            </div>
            <div class="field-group">
              <label class="field-label">Downpayment (%)</label>
              <input type="number" class="field-input" id="cfgDownpayment" value="${currentCfg.downpaymentPercent}">
            </div>
            <div class="field-group">
              <label class="field-label">Wedding Surcharge / Head (₱)</label>
              <input type="number" class="field-input" id="cfgWeddingSurcharge" value="${currentCfg.weddingSurchargePerHead}">
            </div>
          </div>
        </div>

        <!-- 2. Food Packages -->
        <div class="pricing-section-card">
          <div class="pricing-section-title">
            <span>Food Packages (Food Package 1, 2, 3)</span>
          </div>
          <div class="pricing-fields-grid">
            ${(currentCfg.levels || []).map((lvl, idx) => `
              <div class="field-group" style="background:#f8fafc; padding:0.75rem; border-radius:8px; border:1px solid #e2e8f0;">
                <label class="field-label">${lvl.name} (${lvl.dishes} Dishes)</label>
                <div style="display:flex; align-items:center; gap:0.25rem;">
                  <span style="font-size:12px; color:var(--color-slate-60);">₱</span>
                  <input type="number" class="field-input cfg-level-rate" data-idx="${idx}" value="${lvl.perHead}">
                  <span style="font-size:11px; color:var(--color-slate-60);">/pax</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 3. Six Event Packages & Suitability Matrix (Revision 10) -->
        <div class="pricing-section-card">
          <div class="pricing-section-title">
            <span>Six Event Packages & Suitability Matrix (Revision 10)</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${(currentCfg.eventPackages || []).map((pkg, idx) => {
              const isEstimate = pkg.priceStatus === 'estimate';
              return `
              <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:0.75rem 1rem; border-radius:8px; border:1px solid #e2e8f0; flex-wrap:wrap; gap:0.5rem;">
                <div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <strong>${pkg.name}</strong>
                    ${isEstimate 
                      ? `<span class="badge badge-rust" title="Estimated price, to be confirmed by Dack's">Estimate</span>` 
                      : `<span class="badge badge-teal">Confirmed</span>`}
                    ${isEstimate ? `<button type="button" class="btn btn-xs btn-outline btn-confirm-price" data-idx="${idx}" style="font-size:11px; padding:2px 8px; border-color:var(--color-teal); color:var(--color-teal); cursor:pointer;">Confirm price</button>` : ''}
                  </div>
                  <div style="font-size:11px; color:var(--color-slate-60);">Occasion: <code>${pkg.occasion}</code> · Base: ${pkg.basePax || 100} guests</div>
                </div>
                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <div style="display:flex; align-items:center; gap:0.25rem;">
                    <span style="font-size:12px; color:var(--color-slate-60);">Base ₱</span>
                    <input type="number" class="field-input cfg-pkg-price" style="width:90px; padding:0.25rem 0.5rem;" data-idx="${idx}" value="${pkg.price}">
                  </div>
                  <div style="display:flex; align-items:center; gap:0.25rem;">
                    <span style="font-size:12px; color:var(--color-slate-60);">+₱</span>
                    <input type="number" class="field-input cfg-pkg-extra" style="width:75px; padding:0.25rem 0.5rem;" data-idx="${idx}" value="${pkg.extraPerHead}">
                    <span style="font-size:11px; color:var(--color-slate-60);">/extra</span>
                  </div>
                </div>
              </div>
            `;}).join('')}
          </div>

          <!-- A2 Inclusions Suitability Matrix -->
          <div style="margin-top:1.25rem; overflow-x:auto;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--color-slate); margin-bottom:0.5rem;">
              Suitability Matrix (I = Included, A = Priced Add-on, X = Not offered)
            </div>
            <table class="table-clean" style="width:100%; font-size:11px; border-collapse:collapse; background:#ffffff; border:1px solid #e2e8f0;">
              <thead>
                <tr style="background:#212e34; color:#ffffff;">
                  <th style="padding:6px 10px; text-align:left;">Inclusion</th>
                  <th style="padding:6px 8px; text-align:center;">Wedding</th>
                  <th style="padding:6px 8px; text-align:center;">Party</th>
                  <th style="padding:6px 8px; text-align:center;">Birthday</th>
                  <th style="padding:6px 8px; text-align:center;">Corporate</th>
                  <th style="padding:6px 8px; text-align:center;">Reunion</th>
                  <th style="padding:6px 8px; text-align:center;">Special</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Catering service</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Stage set up</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I (couch)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I (full)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I (full)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I (company board + arc)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I (family board, balloon, chair, arc)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I (full)</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Clown (puppet and magician)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">X</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">X</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱4,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱4,000)</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Photobooth (3 hours)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱5,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱5,000)</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Basic lights and sounds</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Cake and 1 dozen cupcakes</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱3,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱3,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Photographer</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱5,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Host</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I (emcee)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Presidential table</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱1,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱1,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱1,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱1,000)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱1,000)</td>
                </tr>
                <tr>
                  <td style="padding:6px 10px; font-weight:600; border-bottom:1px solid #f1f5f9;">Invitation (20 pcs)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">I</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱600)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱600)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">X</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱600)</td>
                  <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #f1f5f9;">A (+₱600)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 4. Stage Setup & Extra Dish Rates -->
        <div class="pricing-section-card">
          <div class="pricing-section-title">
            <span>Stage Setup & Extra Dish Surcharges</span>
          </div>
          <div class="pricing-fields-grid">
            ${(currentCfg.stageSetup?.variants || []).map((stg, idx) => `
              <div class="field-group">
                <label class="field-label">
                  Stage: ${stg.label}
                  ${stg.assumed ? '<span class="badge-assumed">Assumed</span>' : ''}
                </label>
                <div style="display:flex; align-items:center; gap:0.25rem;">
                  <span style="font-size:12px; color:var(--color-slate-60);">₱</span>
                  <input type="number" class="field-input cfg-stage-price" data-idx="${idx}" value="${stg.price}">
                </div>
              </div>
            `).join('')}
            <div class="field-group">
              <label class="field-label">Extra Chicken / 100 pax</label>
              <input type="number" class="field-input cfg-extradish" data-cat="chicken" value="${currentCfg.extraDishPer100?.chicken || 3000}">
            </div>
            <div class="field-group">
              <label class="field-label">Extra Beef / 100 pax</label>
              <input type="number" class="field-input cfg-extradish" data-cat="beef" value="${currentCfg.extraDishPer100?.beef || 3500}">
            </div>
            <div class="field-group">
              <label class="field-label">Extra Pork / 100 pax</label>
              <input type="number" class="field-input cfg-extradish" data-cat="pork" value="${currentCfg.extraDishPer100?.pork || 3500}">
            </div>
            <div class="field-group">
              <label class="field-label">Extra Fish / 100 pax</label>
              <input type="number" class="field-input cfg-extradish" data-cat="fish" value="${currentCfg.extraDishPer100?.fish || 3000}">
            </div>
          </div>
        </div>

        <!-- 5. Food Trays Pricing -->
        <div class="pricing-section-card">
          <div class="pricing-section-title">
            <span>Food Trays Pricing (Per Category)</span>
          </div>
          <div class="pricing-fields-grid">
            ${Object.entries(currentCfg.trays || {}).map(([cat, prc]) => `
              <div class="field-group">
                <label class="field-label" style="text-transform:capitalize;">${cat} Tray Rate</label>
                <div style="display:flex; align-items:center; gap:0.25rem;">
                  <span style="font-size:12px; color:var(--color-slate-60);">₱</span>
                  <input type="number" class="field-input cfg-tray-price" data-cat="${cat}" value="${prc}">
                </div>
              </div>
            `).join('')}
          </div>
        <!-- 6. Priced Add-ons & Status Editor (Revision 9) -->
        <div class="pricing-section-card">
          <div class="pricing-section-title">
            <span>Unified Add-ons Catalog & Status Editor (Revision 9)</span>
          </div>
          <div style="font-size:11px; color:var(--color-slate-60); margin-bottom:0.75rem;">
            Edit prices, inspect billing types (flat, per_head, per_unit), and confirm estimated prices.
          </div>
          <div style="display:flex; flex-direction:column; gap:0.6rem; max-height:420px; overflow-y:auto; padding-right:0.25rem;">
            ${(currentCfg.addOns || []).map((addon, idx) => `
              <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:0.6rem 0.85rem; border-radius:6px; border:1px solid #e2e8f0; font-size:12px; gap:0.5rem; flex-wrap:wrap;">
                <div style="flex:1; min-width:180px;">
                  <strong style="color:var(--color-slate);">${addon.label}</strong>
                  <div style="font-size:10px; color:var(--color-slate-60);">
                    Type: <code>${addon.type}</code> · Occasions: <code>${(addon.occasions || []).join(', ')}</code>
                    ${addon.hideIfIncluded ? ' · <span style="color:#d97706;">Hidden if included</span>' : ''}
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <div style="display:flex; align-items:center; gap:0.2rem;">
                    <span style="font-size:11px; color:var(--color-slate-60);">₱</span>
                    <input type="number" class="field-input cfg-addon-price" data-idx="${idx}" style="width:75px; padding:0.2rem 0.4rem; font-size:11px;" value="${addon.price}">
                  </div>
                  <span class="badge ${addon.priceStatus === 'confirmed' ? 'badge-teal' : 'badge-rust'}" style="font-size:10px;" id="statusBadge-${idx}">
                    ${addon.priceStatus === 'confirmed' ? 'Confirmed' : 'Estimate'}
                  </span>
                  <button type="button" class="btn btn-xs ${addon.priceStatus === 'confirmed' ? 'btn-outline' : 'btn-secondary'} btn-confirm-addon" data-idx="${idx}">
                    ${addon.priceStatus === 'confirmed' ? 'Unconfirm' : 'Confirm Price'}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <!-- RIGHT: Interactive Live Quote Preview -->
      <aside class="live-quote-sidebar-card">
        <div class="live-quote-header">
          <h3 style="font-family:var(--font-heading); font-size:1.05rem; margin:0 0 0.25rem; color:var(--color-slate);">Live Quote Simulator</h3>
          <span style="font-size:11px; color:var(--color-slate-60);">Instantly evaluates computeQuote(input) with active overrides.</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:0.75rem; font-size:12px;">
          <div>
            <label class="field-label">Occasion</label>
            <select id="simOccasion" class="form-select select-sm field-input" style="width:100%;">
              <option value="wedding">Wedding</option>
              <option value="birthday">Birthday</option>
              <option value="corporate">Corporate</option>
              <option value="reunion">Reunion</option>
              <option value="party" selected>Party</option>
              <option value="other">Special Occasion</option>
            </select>
          </div>

          <div>
            <label class="field-label">Plan Type</label>
            <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
              <label style="display:flex; align-items:center; gap:0.25rem; font-size:12px;">
                <input type="radio" name="simPlan" value="allin" checked> All-In
              </label>
              <label style="display:flex; align-items:center; gap:0.25rem; font-size:12px;">
                <input type="radio" name="simPlan" value="catering"> Food Package
              </label>
            </div>
          </div>

          <div>
            <label class="field-label">Guest Count (Pax)</label>
            <input type="number" id="simPax" class="field-input" style="width:100%;" value="100">
          </div>

          <div>
            <label class="field-label">Food Level</label>
            <select id="simLevel" class="form-select select-sm field-input" style="width:100%;">
              <option value="1">Level 1 (4 dishes)</option>
              <option value="2">Level 2 (+₱20/pax)</option>
              <option value="3">Level 3 (+₱50/pax)</option>
            </select>
          </div>

          <div>
            <label class="field-label">Stage Setup</label>
            <select id="simStage" class="form-select select-sm field-input" style="width:100%;">
              <option value="none">None</option>
              <option value="wooden-chair">Wooden chair (₱5,000)</option>
              <option value="couch">Couch (₱6,000)</option>
            </select>
          </div>

          <div>
            <label class="field-label">Extras</label>
            <label style="display:flex; align-items:center; gap:0.35rem; font-size:11px; margin-top:0.25rem;">
              <input type="checkbox" id="simExtraBeef"> Extra Beef dish (+₱35/pax)
            </label>
            <label style="display:flex; align-items:center; gap:0.35rem; font-size:11px; margin-top:0.25rem;">
              <input type="checkbox" id="simIncludeTbc"> Special dish: Shrimp Tempura (TBC)
            </label>
          </div>
        </div>

        <div class="live-quote-total-box" id="simResultBox">
          <!-- Dynamic breakdown injected here -->
        </div>
      </aside>
    </div>
  `;

  // Function to recompute the simulator
  function updateSimulator() {
    const input = {
      eventType: document.getElementById('simOccasion')?.value || 'party',
      pax: Number(document.getElementById('simPax')?.value) || 0,
      plan: document.querySelector('input[name="simPlan"]:checked')?.value || 'allin',
      level: Number(document.getElementById('simLevel')?.value) || 1,
      stageVariant: document.getElementById('simStage')?.value !== 'none' ? document.getElementById('simStage')?.value : null,
      extraDishes: document.getElementById('simExtraBeef')?.checked ? ['beef'] : [],
      special: document.getElementById('simIncludeTbc')?.checked ? [{ name: 'Shrimp Tempura' }] : []
    };

    const quote = computeQuote(input);
    const box = document.getElementById('simResultBox');
    if (!box) return;

    box.innerHTML = `
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--color-slate-60); margin-bottom:0.5rem;">
        Quotation Calculation
      </div>
      <div style="display:flex; flex-direction:column; gap:0.35rem; font-size:11px;">
        ${quote.lines.map(l => `
          <div style="display:flex; justify-content:space-between;">
            <div>
              <strong>${l.name}</strong>
              <div style="color:var(--color-slate-60);">${l.formula || ''}</div>
            </div>
            <div style="font-weight:700; color:${l.isTbc ? 'var(--color-rust)' : 'var(--color-slate)'};">
              ${l.isTbc ? 'To be quoted' : formatPeso(l.amount)}
            </div>
          </div>
        `).join('')}
      </div>

      <div style="border-top:1px solid rgba(79,164,157,0.3); margin-top:0.75rem; padding-top:0.5rem;">
        <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:800; color:var(--color-slate);">
          <span>Known Total:</span>
          <span>${formatPeso(quote.knownTotal)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--color-teal); font-weight:700; margin-top:0.25rem;">
          <span>50% Downpayment:</span>
          <span>${formatPeso(quote.downpayment)}</span>
        </div>
        ${quote.underMin ? '<div class="badge-assumed" style="margin-top:0.5rem; display:block; text-align:center;">Under 75 Flat applied</div>' : ''}
        ${quote.hasTbc ? '<div class="badge-assumed" style="margin-top:0.5rem; display:block; text-align:center;">Awaiting Final Quote (TBC)</div>' : ''}
      </div>
    `;
  }

  // Bind simulator change listeners
  ['simOccasion', 'simPax', 'simLevel', 'simStage', 'simExtraBeef', 'simIncludeTbc'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateSimulator);
    document.getElementById(id)?.addEventListener('change', updateSimulator);
  });
  document.querySelectorAll('input[name="simPlan"]').forEach(el => el.addEventListener('change', updateSimulator));

  // Run initial simulator update
  updateSimulator();

  // Save Pricing Overrides
  document.getElementById('btnSavePricing')?.addEventListener('click', () => {
    // Collect values from inputs
    currentCfg.minPax = Number(document.getElementById('cfgMinPax')?.value) || 75;
    currentCfg.underMinFlat = Number(document.getElementById('cfgUnderMinFlat')?.value) || 15000;
    currentCfg.softMaxPax = Number(document.getElementById('cfgSoftMaxPax')?.value) || 500;
    currentCfg.downpaymentPercent = Number(document.getElementById('cfgDownpayment')?.value) || 50;
    currentCfg.weddingSurchargePerHead = Number(document.getElementById('cfgWeddingSurcharge')?.value) || 20;

    // Catering levels
    document.querySelectorAll('.cfg-level-rate').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (currentCfg.levels[idx]) {
        currentCfg.levels[idx].perHead = Number(inp.value) || currentCfg.levels[idx].perHead;
      }
    });

    // Event packages
    document.querySelectorAll('.cfg-pkg-price').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (currentCfg.eventPackages[idx]) {
        currentCfg.eventPackages[idx].price = Number(inp.value) || 55000;
      }
    });
    document.querySelectorAll('.cfg-pkg-extra').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (currentCfg.eventPackages[idx]) {
        currentCfg.eventPackages[idx].extraPerHead = Number(inp.value) || 250;
      }
    });

    // Stage variants
    document.querySelectorAll('.cfg-stage-price').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (currentCfg.stageSetup?.variants?.[idx]) {
        currentCfg.stageSetup.variants[idx].price = Number(inp.value) || 5000;
      }
    });

    // Extra dish rates
    document.querySelectorAll('.cfg-extradish').forEach(inp => {
      const cat = inp.dataset.cat;
      if (cat && currentCfg.extraDishPer100) {
        currentCfg.extraDishPer100[cat] = Number(inp.value) || 3000;
      }
    });

    // Tray rates
    document.querySelectorAll('.cfg-tray-price').forEach(inp => {
      const cat = inp.dataset.cat;
      if (cat && currentCfg.trays) {
        currentCfg.trays[cat] = Number(inp.value) || 800;
      }
    });

    // Add-on prices
    document.querySelectorAll('.cfg-addon-price').forEach(inp => {
      const idx = Number(inp.dataset.idx);
      if (currentCfg.addOns && currentCfg.addOns[idx]) {
        currentCfg.addOns[idx].price = Number(inp.value) || 0;
      }
    });

    localStorage.setItem('tikim.pricing', JSON.stringify(currentCfg));
    if ('BroadcastChannel' in window) {
      new BroadcastChannel('tikim_live_channel').postMessage({ type: 'PRICING_UPDATED', payload: currentCfg });
    }
    showAdminToast('Pricing overrides saved to tikim.pricing!', 'success');
    updateSimulator();
  });

  // Confirm / Unconfirm Add-on action buttons
  document.querySelectorAll('.btn-confirm-addon').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (currentCfg.addOns && currentCfg.addOns[idx]) {
        const nextStatus = currentCfg.addOns[idx].priceStatus === 'confirmed' ? 'estimate' : 'confirmed';
        currentCfg.addOns[idx].priceStatus = nextStatus;
        localStorage.setItem('tikim.pricing', JSON.stringify(currentCfg));
        showAdminToast(`Add-on "${currentCfg.addOns[idx].label}" status set to ${nextStatus}!`, 'success');
        renderPackagesView(container);
      }
    });
  });

  // Confirm / Unconfirm Package price action buttons
  document.querySelectorAll('.btn-confirm-price').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (currentCfg.eventPackages && currentCfg.eventPackages[idx]) {
        currentCfg.eventPackages[idx].priceStatus = 'confirmed';
        localStorage.setItem('tikim.pricing', JSON.stringify(currentCfg));
        showAdminToast(`Price confirmed for ${currentCfg.eventPackages[idx].name}!`, 'success');
        renderPackagesView(container);
      }
    });
  });

  // Reset to Defaults
  document.getElementById('btnResetPricing')?.addEventListener('click', async () => {
    const ok = window.showConfirmDialog
      ? await window.showConfirmDialog({ title: 'Reset pricing?', desc: 'Reset all pricing overrides to client price list defaults?', confirmText: 'Reset' })
      : true;
    if (ok) {
      localStorage.removeItem('tikim.pricing');
      if ('BroadcastChannel' in window) {
        new BroadcastChannel('tikim_live_channel').postMessage({ type: 'PRICING_RESET' });
      }
      showAdminToast('Pricing reset to defaults from pricing.json', 'info');
      renderPackagesView(container);
    }
  });
}

function renderMenuView(container) {
  const currentCfg = getPricingConfig();
  
  container.innerHTML = `
    <div class="data-table-card">
      <div class="table-toolbar">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:var(--text-base); margin:0;">Heritage Culinary Library (Client Dishes Only)</h3>
          <span style="font-size: 0.8rem; color: var(--color-slate-60);">All dishes from client price list. Special dishes are price on request (TBC).</span>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Dish Name</th>
              <th>Category</th>
              <th>Course</th>
              <th>Pricing Rule</th>
              <th>Assumed Note</th>
            </tr>
          </thead>
          <tbody id="menuTableBody">
            ${cachedDishes.map(d => `
              <tr>
                <td><strong>${d.name}</strong><br><small style="color:var(--color-slate-60);">${d.description || ''}</small></td>
                <td><span class="badge badge-outline">${d.category}</span></td>
                <td>${d.course || d.category}</td>
                <td>
                  ${d.category === 'Special' ? '<span class="badge-assumed">Price on request</span>' : (d.category === 'Drinks' || d.category === 'Desserts' || d.category === 'Rice' ? '<span class="badge badge-teal">Included staple</span>' : 'Standard tier')}
                </td>
                <td>
                  ${d.category === 'Special' ? '<span class="badge-assumed">Assumed</span>' : '<span style="color:var(--color-slate-40);">Client List</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Food Trays Table -->
    <div class="data-table-card" style="margin-top:1.5rem;">
      <div class="table-toolbar">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:var(--text-base); margin:0;">Zhel's Food Trays Menu</h3>
          <span style="font-size: 0.8rem; color: var(--color-slate-60);">Rates per tray by category. Hotline: 0977 752 3458</span>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Tray Price (₱)</th>
              <th>Inclusions & Details</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Chicken</strong></td><td><strong style="color:var(--color-teal);">${formatPeso(currentCfg.trays?.chicken || 900)}</strong></td><td>Teriyaki, Barbecue, Caldareta, Buttered, Cordonbleu</td></tr>
            <tr><td><strong>Pork</strong></td><td><strong style="color:var(--color-teal);">${formatPeso(currentCfg.trays?.pork || 950)}</strong></td><td>Broccoli, Caldareta, Menudo, Korean Pork, Kare Kare, Lechon Kawali, Sisig</td></tr>
            <tr><td><strong>Beef</strong></td><td><strong style="color:var(--color-teal);">${formatPeso(currentCfg.trays?.beef || 1000)}</strong></td><td>Broccoli, Caldareta, Creamy Beef, Kare Kare</td></tr>
            <tr><td><strong>Pasta</strong></td><td><strong style="color:var(--color-teal);">${formatPeso(currentCfg.trays?.pasta || 800)}</strong></td><td>Palabok, Spaghetti, Pancit Bihon, Sotanghon, Carbonara, Japchae</td></tr>
            <tr><td><strong>Fish</strong></td><td><strong style="color:var(--color-teal);">${formatPeso(currentCfg.trays?.fish || 800)}</strong></td><td>Fish Fillet with Tartar Sauce, Fish Fillet Sweet & Sour</td></tr>
            <tr><td><strong>Veggie</strong></td><td><strong style="color:var(--color-teal);">${formatPeso(currentCfg.trays?.veggie || 800)}</strong></td><td>Mix Vegetables, Sipo Egg, Gising Gising, Chopsuey</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   6. INVENTORY VIEW (With Equipment Stock & Turnover Reports)
   -------------------------------------------------------------------------- */
function renderInventoryView(container, subTab = 'fleet') {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Equipment Fleet Logistics & Turnover</h1>
        <p class="view-subtitle">Monitor stock quantities, damages, and post-event equipment turnover.</p>
      </div>
    </div>

    <div class="admin-subnav-tabs">
      <button type="button" class="admin-tab-btn ${subTab === 'fleet' ? 'active' : ''}" id="tabBtnFleet">Equipment Fleet & Stock (${cachedInventory.length})</button>
      <button type="button" class="admin-tab-btn ${subTab === 'turnover' ? 'active' : ''}" id="tabBtnTurnover">Ingress / Egress Turnover Reports</button>
    </div>

    <div id="inventoryTabMount"></div>
  `;

  document.getElementById('tabBtnFleet').addEventListener('click', () => {
    window.location.hash = '#/inventory';
  });

  document.getElementById('tabBtnTurnover').addEventListener('click', () => {
    window.location.hash = '#/turnover';
  });

  const mount = document.getElementById('inventoryTabMount');
  if (subTab === 'turnover') {
    renderTurnoverView(mount);
  } else {
    renderInventoryFleetTab(mount);
  }
}

function renderInventoryFleetTab(mount) {
  mount.innerHTML = `
    <div class="data-table-card">
      <div style="overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Category</th>
              <th>Total Fleet</th>
              <th>Available</th>
              <th>Condition</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody id="inventoryTableBody">
            ${cachedInventory.map(item => `
              <tr>
                <td><strong>${item.name}</strong></td>
                <td><span class="badge badge-outline">${item.category}</span></td>
                <td>${item.totalQuantity} units</td>
                <td><strong style="color:var(--color-teal);">${item.availableQuantity} units</strong></td>
                <td><span class="badge ${item.condition === 'Good' ? 'badge-teal' : 'badge-rust'}">${item.condition}</span></td>
                <td>${item.source}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   8. PARTNER VENDORS VIEW
   -------------------------------------------------------------------------- */
function renderVendorsView(container) {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Partner Vendor Directory</h1>
        <p class="view-subtitle">Accredited entertainers, acoustic lights and sounds, and photobooth operators.</p>
      </div>
    </div>

    <div class="data-table-card">
      <div style="overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>Service Domain</th>
              <th>Contact Details</th>
              <th>Standard Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${cachedVendors.map(v => `
              <tr>
                <td><strong>${v.name}</strong></td>
                <td><span class="badge badge-teal">${v.services || v.service}</span></td>
                <td>${v.phone || v.contactPerson || v.contact} · ${v.messenger || ''}</td>
                <td>${formatPeso(v.rate)}</td>
                <td><span class="badge badge-outline">${v.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------------------
   9. PAYMENT PROOF REVIEWS VIEW
   -------------------------------------------------------------------------- */
async function renderPaymentsView(container) {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Payment Verification Queue</h1>
        <p class="view-subtitle">Inspect receipt proofs, approve downpayments, and lock event dates.</p>
      </div>
    </div>
    <div class="step-card" style="text-align:center; padding:3rem 1rem;">Loading payment submissions...</div>
  `;

  try {
    cachedPendingPayments = await mockApi.listPendingPayments();
    paymentQueueError = null;
  } catch (error) {
    cachedPendingPayments = [];
    paymentQueueError = error.message || 'Unable to load payment submissions.';
  }

  if (currentRoute !== 'payments') return;
  updateGlobalBadges();

  const pendingPayments = cachedPendingPayments;

  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Payment Verification Queue</h1>
        <p class="view-subtitle">Inspect receipt proofs, approve downpayments, and lock event dates.</p>
      </div>
    </div>

    ${paymentQueueError ? `
      <div class="step-card" style="text-align:center; padding:3rem 1rem;">
        <h3>Payment submissions could not be loaded</h3>
        <p style="font-size:12px; color:var(--color-slate-60);">${escapeAdminText(paymentQueueError)}</p>
        <button type="button" class="btn btn-sm btn-primary" id="btnRetryPaymentQueue">Retry</button>
      </div>
    ` : pendingPayments.length === 0 ? `
      <div class="step-card" style="text-align:center; padding:3rem 1rem;">
        <h3>No payments pending verification!</h3>
        <p style="font-size:12px; color:var(--color-slate-60);">All submitted transaction receipts have been processed.</p>
      </div>
    ` : `
      <div class="data-table-card">
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Booking Ref</th>
                <th>Customer</th>
                <th>Event Date</th>
                <th>Amount & Channel</th>
                <th>Proof Receipt</th>
                <th>Decision Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pendingPayments.map(payment => {
                const booking = payment.booking || {};
                const receipt = payment.receipts?.[0];
                return `
                <tr>
                  <td>
                    <span class="font-mono" style="font-weight:700; color:var(--color-rust);">${escapeAdminText(booking.reference)}</span>
                  </td>
                  <td>${escapeAdminText(booking.customerName || 'Customer')}<br><small style="color:var(--color-slate-60);">${escapeAdminText(booking.customerMobile || '')}</small></td>
                  <td>${escapeAdminText(booking.eventDate || 'TBD')}</td>
                  <td>
                    <strong>${formatPeso(payment.amount)}</strong><br>
                    <small style="color:var(--color-slate-60);">${escapeAdminText(payment.paymentMethod)} · Txn: ${escapeAdminText(payment.transactionNumber || '-')}</small>
                  </td>
                  <td>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                      <span style="font-size:9px; font-weight:700; color:#ab4b2e; background:#fbebe6; padding:5px 7px; border-radius:4px;">${receipt?.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                      <button type="button" class="btn btn-xs btn-outline btn-view-queue-proof" data-id="${receipt?.id || ''}" data-ref="${escapeAdminText(booking.reference)}" ${receipt ? '' : 'disabled'}>
                        ${receipt ? 'View receipt' : 'Receipt unavailable'}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                      <button type="button" class="btn btn-xs btn-primary btn-approve-pay" data-id="${payment.id}" data-ref="${escapeAdminText(booking.reference)}">
                        Approve & Lock Date
                      </button>
                      <button type="button" class="btn btn-xs btn-outline btn-reject-pay" data-id="${payment.id}" data-ref="${escapeAdminText(booking.reference)}">
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              `;}).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `}
  `;

  const retryButton = container.querySelector('#btnRetryPaymentQueue');
  if (retryButton) {
    retryButton.addEventListener('click', async () => {
      retryButton.disabled = true;
      await refreshGlobalData();
      renderPaymentsView(container);
    });
  }

  // Lightbox buttons
  container.querySelectorAll('.btn-view-queue-proof').forEach(btn => {
    btn.addEventListener('click', () => openProofLightbox(btn.dataset.id, btn.dataset.ref));
  });

  // Approve buttons
  container.querySelectorAll('.btn-approve-pay').forEach(btn => {
    btn.addEventListener('click', async () => {
      const paymentId = btn.dataset.id;
      const bookingRef = btn.dataset.ref;
      btn.disabled = true;
      btn.textContent = 'Approving...';

      try {
        await mockApi.reviewPayment(paymentId, 'Approved');
        showAdminToast(`Payment for ${bookingRef} approved.`, 'success');
        await refreshGlobalData();
        renderPaymentsView(container);
      } catch (err) {
        console.error('Approve error:', err);
        showAdminToast(err.message || 'Failed to approve payment.', 'error');
        btn.disabled = false;
        btn.textContent = 'Approve & Lock Date';
      }
    });
  });


  // Reject buttons: trigger rejection dialog
  container.querySelectorAll('.btn-reject-pay').forEach(btn => {
    btn.addEventListener('click', () => {
      openRejectDialog(btn.dataset.id, btn.dataset.ref);
    });
  });
}


/* --------------------------------------------------------------------------
   10. TURNOVER REPORTS VIEW
   -------------------------------------------------------------------------- */
function renderTurnoverView(container) {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Equipment Ingress / Egress Turnover</h1>
        <p class="view-subtitle">Generate post-event equipment audit and reconcile fleet damages.</p>
      </div>
    </div>

    <div class="step-card">
      <h3 class="step-subheading">Select Event For Turnover Audit</h3>
      <div style="display:flex; gap:1rem; align-items:flex-end;">
        <div class="form-group flex-2">
          <label class="form-label">Booking</label>
          <select id="turnoverBookingSelect" class="form-select">
            ${cachedBookings.map(b => `<option value="${b.id}">${b.ref} - ${b.customer?.name} (${b.eventDate || 'Date'})</option>`).join('')}
          </select>
        </div>
        <button type="button" class="btn btn-primary" id="btnLoadTurnover">Load Checklist</button>
      </div>

      <div id="turnoverChecklistMount" style="margin-top:1.5rem; display:none;">
        <h4 style="font-size:14px; font-weight:800; color:var(--color-slate); margin-bottom:0.75rem;">Dispatched Equipment Reconciler</h4>
        <table class="admin-table">
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Dispatched</th>
              <th>Returned Qty</th>
              <th>Damaged / Missing</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Round Banquet Tables</td>
              <td>10 units</td>
              <td><input type="number" class="form-input input-sm" value="10" style="width:70px;"></td>
              <td><input type="number" class="form-input input-sm" value="0" style="width:70px;"></td>
              <td><input type="text" class="form-input input-sm" placeholder="All returned in good condition"></td>
            </tr>
            <tr>
              <td>Cross-back Tiffany Chairs</td>
              <td>100 units</td>
              <td><input type="number" class="form-input input-sm" value="100" style="width:70px;"></td>
              <td><input type="number" class="form-input input-sm" value="0" style="width:70px;"></td>
              <td><input type="text" class="form-input input-sm" placeholder="Clean linens returned"></td>
            </tr>
            <tr>
              <td>Chafing Food Warmer Dishes</td>
              <td>6 sets</td>
              <td><input type="number" class="form-input input-sm" value="6" style="width:70px;"></td>
              <td><input type="number" class="form-input input-sm" value="0" style="width:70px;"></td>
              <td><input type="text" class="form-input input-sm" placeholder="Complete with lids"></td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top:1.5rem; display:flex; justify-content:space-between; align-items:center;">
          <button type="button" class="btn btn-outline" onclick="window.print()">Print Turnover Report</button>
          <button type="button" class="btn btn-primary" id="btnSaveTurnover">Save Turnover & Close Event</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnLoadTurnover').addEventListener('click', () => {
    document.getElementById('turnoverChecklistMount').style.display = 'block';
  });

  document.getElementById('turnoverChecklistMount').addEventListener('click', (e) => {
    if (e.target.id === 'btnSaveTurnover') {
      showAdminToast('Equipment Turnover Report filed! Event marked completed.', 'success');
    }
  });
}

/* --------------------------------------------------------------------------
   11. SMS OUTBOX VIEW
   -------------------------------------------------------------------------- */
function renderSmsView(container) {
  const logs = getSmsLogs();

  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Simulated SMS Dispatch Log</h1>
        <p class="view-subtitle">View scheduled hold warnings, downpayment acknowledgments, and reminders.</p>
      </div>
      <button type="button" class="btn btn-sm btn-outline" id="btnSendTestSms">Trigger Test Reminder</button>
    </div>

    <div class="data-table-card">
      <div style="overflow-x:auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Recipient</th>
              <th>Template Type</th>
              <th>Simulated Message Content</th>
              <th>Delivery Status</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0 ? `
              <tr><td colspan="5" style="text-align:center;">No SMS logs recorded yet.</td></tr>
            ` : logs.map(s => `
              <tr>
                <td>${new Date(s.timestamp).toLocaleTimeString()}</td>
                <td><strong>${s.payload?.name || 'Customer'}</strong></td>
                <td><span class="badge badge-teal">${s.template}</span></td>
                <td style="font-family:monospace; font-size:11px;">${s.message}</td>
                <td><span class="badge badge-outline">Simulated Sent</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btnSendTestSms').addEventListener('click', () => {
    simulateSms('hold_warning_24h', {
      name: 'Maria Clara',
      ref: 'TK-261021-001',
      date: 'Dec 25, 2026',
      balance: '₱50,000',
      dueDate: '24 hours'
    });
    showAdminToast('Test 24h hold warning queued!', 'info');
    renderSmsView(container);
  });
}

/* --------------------------------------------------------------------------
   12. REPORTS & CSV EXPORT VIEW
   -------------------------------------------------------------------------- */
function renderReportsView(container) {
  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Business Analytics & Data Export</h1>
        <p class="view-subtitle">Generate client-side CSV downloads for accounting and logistics.</p>
      </div>
      <button type="button" class="btn btn-sm btn-primary" id="btnExportCsv">
        Download Bookings CSV
      </button>
    </div>

    <div class="kpi-cards-grid">
      <div class="kpi-card">
        <span class="kpi-label">Average Order Value</span>
        <div class="kpi-value">₱112,400</div>
        <span class="kpi-subtext">Across catering events</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Most Popular Tier</span>
        <div class="kpi-value" style="font-size:1.4rem;">Grand Wedding</div>
        <span class="kpi-subtext">34% of all reservations</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Hold Conversion Rate</span>
        <div class="kpi-value" style="color:var(--color-teal);">88%</div>
        <span class="kpi-subtext">From 48h hold to confirmed</span>
      </div>
    </div>
  `;

  document.getElementById('btnExportCsv').addEventListener('click', () => {
    const headers = ["Reference", "Customer", "Mobile", "Event Type", "Event Date", "Pax", "Status", "Total", "Paid", "Balance"];
    const rows = cachedBookings.map(b => [
      b.ref,
      `"${b.customer?.name || ''}"`,
      b.customer?.mobile || '',
      b.eventType || b.tag,
      b.eventDate || b.deliveryDate || '',
      b.pax || 0,
      b.status,
      b.total || 0,
      b.paidAmount || 0,
      b.balance || 0
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tikim_bookings_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showAdminToast('CSV Export downloaded!', 'success');
  });
}

/* --------------------------------------------------------------------------
   8. MESSAGES & COMMUNICATIONS VIEW (Change Requests, Inquiries & SMS)
   -------------------------------------------------------------------------- */
function renderMessagesView(container, subTab = 'change_requests') {
  const reqs = JSON.parse(localStorage.getItem('tikim.change_requests') || '[]');
  const inquiries = JSON.parse(localStorage.getItem('tikim.inquiries') || '[]');

  container.innerHTML = `
    <div class="view-header">
      <div>
        <h1 class="view-title">Communications & Message Center</h1>
        <p class="view-subtitle">Customer change requests, contact inquiries, and simulated SMS dispatch log.</p>
      </div>
    </div>

    <div class="admin-subnav-tabs">
      <button type="button" class="admin-tab-btn ${subTab === 'change_requests' ? 'active' : ''}" id="tabBtnChangeReqs">Change Requests (${reqs.length})</button>
      <button type="button" class="admin-tab-btn ${subTab === 'inquiries' ? 'active' : ''}" id="tabBtnInquiries">Contact Inquiries (${inquiries.length})</button>
      <button type="button" class="admin-tab-btn ${subTab === 'sms' ? 'active' : ''}" id="tabBtnSms">Simulated SMS Dispatch Log</button>
    </div>

    <div id="messagesTabMount"></div>
  `;

  document.getElementById('tabBtnChangeReqs').addEventListener('click', () => {
    renderMessagesView(container, 'change_requests');
  });

  document.getElementById('tabBtnInquiries').addEventListener('click', () => {
    renderMessagesView(container, 'inquiries');
  });

  document.getElementById('tabBtnSms').addEventListener('click', () => {
    window.location.hash = '#/sms';
  });

  const mount = document.getElementById('messagesTabMount');
  if (subTab === 'inquiries') {
    renderInquiriesContent(mount);
  } else if (subTab === 'sms') {
    renderSmsView(mount);
  } else {
    renderChangeRequestsContent(mount);
  }
}

function renderChangeRequestsContent(targetEl) {
  const reqs = JSON.parse(localStorage.getItem('tikim.change_requests') || '[]');
  targetEl.innerHTML = `
    <div class="data-table-card">
      <div class="table-toolbar">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:var(--text-base); margin:0;">Customer Change Requests (${reqs.length})</h3>
          <span style="font-size: 0.8rem; color: var(--color-slate-60);">Reschedule and cancellation requests submitted via Track page</span>
        </div>
      </div>
      ${reqs.length === 0 ? `
        <div style="padding: 2.5rem; text-align: center; color: var(--color-slate-60); font-size: 0.9rem;">
          No change requests submitted yet. Customers can request date reschedules or cancellations from track.html.
        </div>
      ` : `
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Booking Ref</th>
                <th>Customer</th>
                <th>Request Type</th>
                <th>Preferred Date</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${reqs.map((r, idx) => `
                <tr>
                  <td><strong>${r.ref}</strong></td>
                  <td>${r.customerName}<br><small style="color:var(--color-slate-60);">${r.mobile}</small></td>
                  <td><span class="badge ${r.type === 'Reschedule' ? 'badge-teal' : 'badge-rust'}">${r.type}</span></td>
                  <td><strong>${r.preferredDate || 'N/A'}</strong></td>
                  <td style="max-width:240px; font-size:12px; color:var(--color-slate-80);">${r.reason || 'None provided'}</td>
                  <td><span class="badge ${r.status === 'Approved' ? 'badge-teal' : (r.status === 'Rejected' ? 'badge-rust' : 'badge-outline')}">${r.status}</span></td>
                  <td>
                    ${r.status === 'Pending Review' ? `
                      <button type="button" class="btn btn-xs btn-primary btn-approve-change" data-idx="${idx}">Approve</button>
                      <button type="button" class="btn btn-xs btn-outline btn-reject-change" data-idx="${idx}">Reject</button>
                    ` : '<span style="color:var(--color-slate-40); font-size:11px;">Processed</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  targetEl.querySelectorAll('.btn-approve-change').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = btn.dataset.idx;
      reqs[idx].status = 'Approved';
      localStorage.setItem('tikim.change_requests', JSON.stringify(reqs));
      showAdminToast(`Change request for ${reqs[idx].ref} approved!`, 'success');
      renderChangeRequestsContent(targetEl);
    });
  });

  targetEl.querySelectorAll('.btn-reject-change').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = btn.dataset.idx;
      reqs[idx].status = 'Rejected';
      localStorage.setItem('tikim.change_requests', JSON.stringify(reqs));
      showAdminToast(`Change request for ${reqs[idx].ref} marked rejected.`, 'warning');
      renderChangeRequestsContent(targetEl);
    });
  });
}

function renderInquiriesContent(targetEl) {
  const inquiries = JSON.parse(localStorage.getItem('tikim.inquiries') || '[]');
  targetEl.innerHTML = `
    <div class="data-table-card">
      <div class="table-toolbar">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:var(--text-base); margin:0;">Contact Inquiries (${inquiries.length})</h3>
          <span style="font-size: 0.8rem; color: var(--color-slate-60);">Inquiries submitted via contact.html</span>
        </div>
      </div>
      ${inquiries.length === 0 ? `
        <div style="padding: 2.5rem; text-align: center; color: var(--color-slate-60); font-size: 0.9rem;">
          No contact inquiries recorded yet. Submissions from contact.html will appear here.
        </div>
      ` : `
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Messenger</th>
                <th>Occasion</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              ${inquiries.map(inq => `
                <tr>
                  <td><small>${new Date(inq.createdAt).toLocaleDateString()}</small></td>
                  <td><strong>${inq.name}</strong></td>
                  <td><a href="tel:${inq.phone || inq.mobile}" style="color:var(--color-teal);">${inq.phone || inq.mobile || 'N/A'}</a></td>
                  <td>
                    ${inq.messengerName ? `
                      <span style="font-weight:600;">${inq.messengerName}</span>
                      <button type="button" class="btn-copy-messenger" data-name="${inq.messengerName}" style="margin-left:4px; background:#fff; border:1px solid #ccc; border-radius:3px; padding:1px 4px; font-size:10px; cursor:pointer;">Copy</button>
                    ` : '<span style="color:var(--color-slate-40);">-</span>'}
                  </td>
                  <td><span class="badge badge-teal">${inq.eventType || inq.occasion || 'General'}</span></td>
                  <td style="max-width:320px; font-size:12px; color:var(--color-slate-80);">${inq.message}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

/* --------------------------------------------------------------------------
   9. SETTINGS VIEW (Business Info, Policies, SMS Rules)
   -------------------------------------------------------------------------- */
function renderSettingsView(container) {
  let isDirty = false;
  let channels = JSON.parse(JSON.stringify(cachedSettings.paymentChannels || []));
  if (!channels || channels.length === 0) {
    channels = [
      { id: 'chan_gcash', name: 'GCash', accountName: "Dack's Catering Services", accountNumber: '0977 752 3458', notes: 'Express send or QR transfer.', enabled: true },
      { id: 'chan_maya', name: 'Maya', accountName: "Dack's Catering Services", accountNumber: '0977 752 3458', notes: 'Maya wallet or scan QR.', enabled: true },
      { id: 'chan_bdo', name: 'Bank Transfer', accountName: "Dack's Catering Services", accountNumber: '0048-2910-4491', notes: 'BDO Current Account.', enabled: true }
    ];
  }

  function renderChannelsListHtml() {
    if (!channels || channels.length === 0) {
      return `<div style="text-align:center; padding:1.5rem; color:var(--color-slate-60); font-size:12px; background:var(--color-slate-05); border-radius:6px;">No payment channels defined. Click "+ Add Channel" to configure payment accounts.</div>`;
    }
    return channels.map((c, idx) => `
      <div class="channel-card-item" data-index="${idx}">
        <div class="channel-card-header">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <label style="display:flex; align-items:center; gap:0.4rem; font-size:12px; font-weight:700; cursor:pointer;">
              <input type="checkbox" class="chan-enabled-chk" data-index="${idx}" ${c.enabled !== false ? 'checked' : ''}>
              <span>${c.name ? c.name : `Channel #${idx + 1}`}</span>
            </label>
            <span style="font-size:10px; color:${c.enabled !== false ? 'var(--color-teal)' : 'var(--color-slate-40)'}; font-weight:600;">
              ${c.enabled !== false ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div class="channel-order-controls">
            <button type="button" class="btn btn-xs btn-outline btn-chan-up" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move Up">&uarr;</button>
            <button type="button" class="btn btn-xs btn-outline btn-chan-down" data-index="${idx}" ${idx === channels.length - 1 ? 'disabled' : ''} title="Move Down">&darr;</button>
            <button type="button" class="btn btn-xs btn-outline btn-chan-del" data-index="${idx}" style="color:var(--color-rust); border-color:rgba(171,75,46,0.3);" title="Remove">&times;</button>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.75rem;">
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">Channel Name</label>
            <input type="text" class="form-input chan-name-input" data-index="${idx}" value="${c.name || ''}" placeholder="e.g. GCash, Maya, BDO">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">Account Name</label>
            <input type="text" class="form-input chan-acctname-input" data-index="${idx}" value="${c.accountName || ''}" placeholder="e.g. Dack's Catering Services">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">Account / Mobile Number</label>
            <input type="text" class="form-input chan-acctnum-input" data-index="${idx}" value="${c.accountNumber || ''}" placeholder="e.g. 0977 752 3458">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:11px;">Notes / Remarks</label>
            <input type="text" class="form-input chan-notes-input" data-index="${idx}" value="${c.notes || ''}" placeholder="e.g. Express send or QR transfer">
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderCustomerPreviewHtml() {
    const active = (channels || []).filter(c => c.enabled !== false && (c.name || c.accountNumber));
    const notes = document.getElementById('setPaymentNotes')?.value || cachedSettings.paymentNotes || cachedSettings.paymentInstructions || '';
    if (active.length === 0) {
      return `<div style="text-align:center; color:var(--color-slate-60); font-size:12px; padding:1rem;">No active payment channels configured to preview.</div>`;
    }
    return `
      <div style="background:#faf7f2; border:1px solid #e4dbcf; border-radius:8px; padding:1rem;">
        <h4 style="font-size:13px; font-weight:700; color:#212e34; margin:0 0 0.5rem;">
          Official Payment Accounts
        </h4>
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.75rem;">
          ${active.map(c => `
            <div style="background:#ffffff; border:1px solid #e4dbcf; border-radius:6px; padding:0.6rem 0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <strong style="font-size:12px; color:#212e34;">${c.name || 'Channel'}</strong>
                <div style="font-size:11px; color:#64748b;">Account Name: <strong style="color:#212e34;">${c.accountName || "Dack's Catering"}</strong></div>
                ${c.notes ? `<div style="font-size:10px; color:#94a3b8;">${c.notes}</div>` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <code style="font-size:12px; font-weight:700; color:#212e34; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${c.accountNumber || ''}</code>
                <button type="button" class="btn btn-xs btn-outline btn-copy-acct" data-copy="${c.accountNumber || ''}" style="font-size:10px; padding:2px 6px;">Copy</button>
              </div>
            </div>
          `).join('')}
        </div>
        ${notes ? `<p style="font-size:11px; color:#64748b; margin:0 0 0.5rem; font-style:italic;">${notes}</p>` : ''}
        <div style="font-size:10px; color:#ab4b2e; font-weight:600; border-top:1px dashed #e4dbcf; padding-top:0.4rem;">
          Notice: Dack's will never request payments via personal accounts not listed above. Always upload your proof screenshot after transfer.
        </div>
      </div>
    `;
  }

  function setDirty(dirty = true) {
    isDirty = dirty;
    const banner = document.getElementById('settingsUnsavedBanner');
    if (banner) banner.style.display = isDirty ? 'flex' : 'none';
  }

  function renderFullView() {
    const cancelText = cachedSettings.cancellationPolicy || DEFAULT_CANCELLATION_POLICY;
    const damageText = cachedSettings.damagePolicy || DEFAULT_DAMAGE_POLICY;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <h1 class="view-title">System Configuration & Policies</h1>
            <span class="badge" id="settingsPolicyVerBadge" style="background:rgba(79,164,157,0.15); color:var(--color-teal); font-weight:700; font-size:11px; padding:3px 8px; border-radius:4px;">
              Policy Version ${cachedSettings.policyVersion || 1}
            </span>
          </div>
          <p class="view-subtitle">Modify business details, downpayment percentages, hold windows, and payment account details.</p>
        </div>
        <button type="button" class="btn btn-sm btn-primary" id="btnSaveSettings">Save All Settings</button>
      </div>

      <div id="settingsUnsavedBanner" class="unsaved-warning-bar" style="display:${isDirty ? 'flex' : 'none'};">
        <span>You have unsaved configuration changes. Click "Save All Settings" to commit.</span>
        <button type="button" class="btn btn-xs btn-outline" id="btnDismissUnsaved" style="background:#ffffff; color:#92400e; border-color:#d97706;">Dismiss</button>
      </div>

      <div class="step-card" style="max-width:860px;">
        <h3 class="step-subheading">Business & Venue Details</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="setBrandName">Brand / Business Name</label>
            <input type="text" id="setBrandName" class="form-input" value="${cachedSettings.brandName || "Dack's Catering Services"}">
          </div>
          <div class="form-group">
            <label class="form-label" for="setAddress">Registered Office Location</label>
            <input type="text" id="setAddress" class="form-input" value="${cachedSettings.address || 'San Ildefonso, Bulacan'}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="setHotline">Hotline / Contact</label>
            <input type="text" id="setHotline" class="form-input" value="${cachedSettings.hotline || cachedSettings.phone || '0977 752 3458'}">
          </div>
          <div class="form-group">
            <label class="form-label" for="setMessengerUrl">Facebook Messenger URL</label>
            <input type="text" id="setMessengerUrl" class="form-input" value="${cachedSettings.messengerUrl || 'https://m.me/dackscatering'}">
          </div>
        </div>

        <h3 class="step-subheading" style="margin-top:1.5rem;">Booking Engine & Downpayment Rules</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="setDp">Mandatory Downpayment (%)</label>
            <input type="number" id="setDp" class="form-input" value="${cachedSettings.downpaymentPercent || 50}">
          </div>
          <div class="form-group">
            <label class="form-label" for="setHoldHours">Date Hold Window (Hours)</label>
            <input type="number" id="setHoldHours" class="form-input" value="${cachedSettings.holdHours || 48}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="setDueDays">Balance Due (Days Prior to Event)</label>
            <input type="number" id="setDueDays" class="form-input" value="${cachedSettings.balanceDueDaysBeforeEvent || 7}">
          </div>
          <div class="form-group">
            <label class="form-label" for="setExtraPax">Extra Pax Surcharge (₱ / head)</label>
            <input type="number" id="setExtraPax" class="form-input" value="${cachedSettings.extraPerHead || 250}">
          </div>
        </div>

        <!-- PAYMENT CHANNELS REPEATER -->
        <div style="margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--color-slate-15);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <div>
              <h3 class="step-subheading" style="margin:0;">Payment Channels Configuration</h3>
              <p style="font-size:12px; color:var(--color-slate-60); margin:0.25rem 0 0;">
                Configure payment channels displayed on the customer booking confirmation and tracking portal.
              </p>
            </div>
            <button type="button" class="btn btn-xs btn-outline" id="btnAddPaymentChannel">+ Add Channel</button>
          </div>

          <div class="channel-repeater-list" id="paymentChannelsRepeater">
            ${renderChannelsListHtml()}
          </div>

          <div class="form-group" style="margin-top:1rem;">
            <label class="form-label" for="setPaymentNotes">Additional Payment Instructions & Notes</label>
            <textarea id="setPaymentNotes" class="form-textarea" rows="2" placeholder="e.g. Please include your Booking Reference in GCash remarks...">${cachedSettings.paymentNotes || cachedSettings.paymentInstructions || ''}</textarea>
          </div>

          <!-- Customer Live Preview Card -->
          <div style="margin-top:1.5rem;">
            <label class="form-label" style="display:flex; justify-content:space-between;">
              <span>Customer Track Page Preview (Live):</span>
              <small style="color:var(--color-teal); font-weight:600;">Visible to customers with open balance</small>
            </label>
            <div id="channelsCustomerPreview" class="settings-preview-card">
              ${renderCustomerPreviewHtml()}
            </div>
          </div>
        </div>

        <!-- OFFICIAL POLICIES CONFIGURATION -->
        <div style="margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--color-slate-15);">
          <h3 class="step-subheading">Customer Policies & Legal Terms</h3>
          <p style="font-size:12px; color:var(--color-slate-60); margin-bottom:1.25rem;">
            Changes to cancellation or equipment damage policies automatically increment the policy version. Plain text formatting: blank lines create paragraphs, lines starting with "- " create bullet points.
          </p>

          <!-- 1. Cancellation Policy -->
          <div class="form-group" style="margin-bottom:1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
              <label class="form-label" for="setCancelPolicy" style="margin:0; font-weight:700;">Cancellation & Refund Policy</label>
              <div style="display:flex; gap:0.5rem;">
                <button type="button" class="btn btn-xs btn-outline" id="btnPreviewCancelPolicy">Preview formatted</button>
                <button type="button" class="btn btn-xs btn-outline" id="btnResetCancelPolicy">Reset to default</button>
              </div>
            </div>
            <textarea id="setCancelPolicy" class="form-textarea policy-textarea" maxlength="2000">${cancelText}</textarea>
            <div id="cancelCharCount" class="char-counter">${cancelText.length} / 2000 characters</div>
          </div>

          <!-- 2. Damage & Loss Policy -->
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
              <label class="form-label" for="setDamagePolicy" style="margin:0; font-weight:700;">Equipment Care, Damage & Loss Policy</label>
              <div style="display:flex; gap:0.5rem;">
                <button type="button" class="btn btn-xs btn-outline" id="btnPreviewDamagePolicy">Preview formatted</button>
                <button type="button" class="btn btn-xs btn-outline" id="btnResetDamagePolicy">Reset to default</button>
              </div>
            </div>
            <textarea id="setDamagePolicy" class="form-textarea policy-textarea" maxlength="2000">${damageText}</textarea>
            <div id="damageCharCount" class="char-counter">${damageText.length} / 2000 characters</div>
          </div>
        </div>

        <div class="form-group" style="margin-top:1.5rem; padding:1rem; background:rgba(79,164,157,0.08); border-radius:8px;">
          <strong style="font-size:12px; color:var(--color-slate);">Automated SMS Dispatch Rules:</strong>
          <p style="font-size:11px; color:var(--color-slate-70); margin:0.25rem 0 0;">
            • Hold 24h Warning sent at T-24h before hold expiration<br>
            • Downpayment Confirmation sent upon receipt verification<br>
            • Balance Due Reminder sent at T-7 days before event date<br>
            • Final Ingress Checklist sent at T-24h before event setup
          </p>
        </div>
      </div>
    `;

    bindSettingsEvents();
  }

  function bindRepeaterItemEvents() {
    const listEl = document.getElementById('paymentChannelsRepeater');
    const previewEl = document.getElementById('channelsCustomerPreview');
    if (!listEl) return;

    listEl.querySelectorAll('.chan-enabled-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.index);
        if (channels[idx]) {
          channels[idx].enabled = e.target.checked;
          setDirty(true);
          listEl.innerHTML = renderChannelsListHtml();
          bindRepeaterItemEvents();
          if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
        }
      });
    });

    listEl.querySelectorAll('.chan-name-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.index);
        if (channels[idx]) {
          channels[idx].name = e.target.value;
          setDirty(true);
          if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
        }
      });
    });

    listEl.querySelectorAll('.chan-acctname-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.index);
        if (channels[idx]) {
          channels[idx].accountName = e.target.value;
          setDirty(true);
          if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
        }
      });
    });

    listEl.querySelectorAll('.chan-acctnum-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.index);
        if (channels[idx]) {
          channels[idx].accountNumber = e.target.value;
          setDirty(true);
          if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
        }
      });
    });

    listEl.querySelectorAll('.chan-notes-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.index);
        if (channels[idx]) {
          channels[idx].notes = e.target.value;
          setDirty(true);
          if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
        }
      });
    });

    listEl.querySelectorAll('.btn-chan-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        if (idx > 0) {
          const temp = channels[idx];
          channels[idx] = channels[idx - 1];
          channels[idx - 1] = temp;
          setDirty(true);
          listEl.innerHTML = renderChannelsListHtml();
          bindRepeaterItemEvents();
          if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
        }
      });
    });

    listEl.querySelectorAll('.btn-chan-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        if (idx < channels.length - 1) {
          const temp = channels[idx];
          channels[idx] = channels[idx + 1];
          channels[idx + 1] = temp;
          setDirty(true);
          listEl.innerHTML = renderChannelsListHtml();
          bindRepeaterItemEvents();
          if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
        }
      });
    });

    listEl.querySelectorAll('.btn-chan-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        channels.splice(idx, 1);
        setDirty(true);
        listEl.innerHTML = renderChannelsListHtml();
        bindRepeaterItemEvents();
        if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
      });
    });
  }

  function bindSettingsEvents() {
    bindRepeaterItemEvents();

    const previewEl = document.getElementById('channelsCustomerPreview');
    const notesInp = document.getElementById('setPaymentNotes');
    if (notesInp) {
      notesInp.addEventListener('input', () => {
        setDirty(true);
        if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
      });
    }

    // Add channel button
    const btnAddChan = document.getElementById('btnAddPaymentChannel');
    if (btnAddChan) {
      btnAddChan.addEventListener('click', () => {
        channels.push({
          id: `chan_${Date.now()}`,
          name: '',
          accountName: "Dack's Catering Services",
          accountNumber: '',
          notes: '',
          enabled: true
        });
        setDirty(true);
        const listEl = document.getElementById('paymentChannelsRepeater');
        if (listEl) listEl.innerHTML = renderChannelsListHtml();
        bindRepeaterItemEvents();
        if (previewEl) previewEl.innerHTML = renderCustomerPreviewHtml();
      });
    }

    // Character counter & dirty state for Cancellation Policy
    const cancelTextarea = document.getElementById('setCancelPolicy');
    const cancelCount = document.getElementById('cancelCharCount');
    if (cancelTextarea && cancelCount) {
      cancelTextarea.addEventListener('input', () => {
        const len = cancelTextarea.value.length;
        cancelCount.textContent = `${len} / 2000 characters`;
        cancelCount.className = len >= 2000 ? 'char-counter is-limit' : (len >= 1800 ? 'char-counter is-near-limit' : 'char-counter');
        setDirty(true);
      });
    }

    // Character counter & dirty state for Damage Policy
    const damageTextarea = document.getElementById('setDamagePolicy');
    const damageCount = document.getElementById('damageCharCount');
    if (damageTextarea && damageCount) {
      damageTextarea.addEventListener('input', () => {
        const len = damageTextarea.value.length;
        damageCount.textContent = `${len} / 2000 characters`;
        damageCount.className = len >= 2000 ? 'char-counter is-limit' : (len >= 1800 ? 'char-counter is-near-limit' : 'char-counter');
        setDirty(true);
      });
    }

    // Policy preview buttons
    const btnPreviewCancel = document.getElementById('btnPreviewCancelPolicy');
    if (btnPreviewCancel && cancelTextarea) {
      btnPreviewCancel.addEventListener('click', () => {
        openPolicyPreviewDialog('Cancellation & Refund Policy', cancelTextarea.value, cachedSettings.policyVersion || 1);
      });
    }

    const btnPreviewDamage = document.getElementById('btnPreviewDamagePolicy');
    if (btnPreviewDamage && damageTextarea) {
      btnPreviewDamage.addEventListener('click', () => {
        openPolicyPreviewDialog('Equipment Care, Damage & Loss Policy', damageTextarea.value, cachedSettings.policyVersion || 1);
      });
    }

    // Policy reset buttons
    const btnResetCancel = document.getElementById('btnResetCancelPolicy');
    if (btnResetCancel && cancelTextarea && cancelCount) {
      btnResetCancel.addEventListener('click', () => {
        cancelTextarea.value = DEFAULT_CANCELLATION_POLICY;
        cancelCount.textContent = `${cancelTextarea.value.length} / 2000 characters`;
        cancelCount.className = 'char-counter';
        setDirty(true);
      });
    }

    const btnResetDamage = document.getElementById('btnResetDamagePolicy');
    if (btnResetDamage && damageTextarea && damageCount) {
      btnResetDamage.addEventListener('click', () => {
        damageTextarea.value = DEFAULT_DAMAGE_POLICY;
        damageCount.textContent = `${damageTextarea.value.length} / 2000 characters`;
        damageCount.className = 'char-counter';
        setDirty(true);
      });
    }

    // General input listeners for dirty state
    ['setBrandName', 'setAddress', 'setHotline', 'setMessengerUrl', 'setDp', 'setHoldHours', 'setDueDays', 'setExtraPax'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => setDirty(true));
    });

    const btnDismissUnsaved = document.getElementById('btnDismissUnsaved');
    if (btnDismissUnsaved) {
      btnDismissUnsaved.addEventListener('click', () => setDirty(false));
    }

    // Save All Settings
    const btnSave = document.getElementById('btnSaveSettings');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        const newCancelPolicy = cancelTextarea ? cancelTextarea.value : (cachedSettings.cancellationPolicy || DEFAULT_CANCELLATION_POLICY);
        const newDamagePolicy = damageTextarea ? damageTextarea.value : (cachedSettings.damagePolicy || DEFAULT_DAMAGE_POLICY);

        // Check if policy text was edited; if so, bump policyVersion
        const policiesChanged = (newCancelPolicy.trim() !== (cachedSettings.cancellationPolicy || '').trim()) ||
                                (newDamagePolicy.trim() !== (cachedSettings.damagePolicy || '').trim());
        let currentVersion = Number(cachedSettings.policyVersion) || 1;
        if (policiesChanged) {
          currentVersion += 1;
        }

        const updated = {
          ...cachedSettings,
          brandName: document.getElementById('setBrandName')?.value || cachedSettings.brandName,
          address: document.getElementById('setAddress')?.value || cachedSettings.address,
          hotline: document.getElementById('setHotline')?.value || cachedSettings.hotline,
          phone: document.getElementById('setHotline')?.value || cachedSettings.phone,
          messengerUrl: document.getElementById('setMessengerUrl')?.value || cachedSettings.messengerUrl,
          downpaymentPercent: Number(document.getElementById('setDp')?.value) || 50,
          holdHours: Number(document.getElementById('setHoldHours')?.value) || 48,
          balanceDueDaysBeforeEvent: Number(document.getElementById('setDueDays')?.value) || 7,
          extraPerHead: Number(document.getElementById('setExtraPax')?.value) || 250,
          paymentChannels: channels,
          paymentNotes: document.getElementById('setPaymentNotes')?.value || '',
          cancellationPolicy: newCancelPolicy,
          damagePolicy: newDamagePolicy,
          policyVersion: currentVersion
        };

        await mockApi.saveSettings(updated);
        cachedSettings = updated;
        setDirty(false);

        const verBadge = document.getElementById('settingsPolicyVerBadge');
        if (verBadge) verBadge.textContent = `Policy Version ${updated.policyVersion}`;

        showAdminToast(`System configuration and policies saved (Policy v${updated.policyVersion}).`, 'success');
      });
    }
  }

  renderFullView();
}


document.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('.btn-copy-messenger');
  if (copyBtn) {
    const name = copyBtn.dataset.name;
    if (name && navigator.clipboard) {
      navigator.clipboard.writeText(name);
      showAdminToast(`Copied Messenger name: ${name}`, 'info');
    }
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
