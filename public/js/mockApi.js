// Single mock API layer accessing localStorage seeds with cross-tab live synchronization.
import { renderSmsText, openSmsMockupModal } from './sms.js';

const STORAGE_KEYS = {
  DRAFT: 'tikim.draft',
  BOOKINGS: 'tikim.bookings',
  HOLDS: 'tikim.holds',
  QUOTES: 'tikim.quotes',
  INVENTORY: 'tikim.inventory',
  SMS: 'tikim.sms',
  SETTINGS: 'tikim.settings',
  SESSION: 'tikim.session',
  SEARCH_HISTORY: 'tikim.searchHistory',
  TURNOVERS: 'tikim.turnovers',
  LAYOUTS: 'tikim.layouts',
  SAVED_MENUS: 'tikim.menus',
  INQUIRIES: 'tikim.inquiries'
};

export function getDefaultDraft() {
  return {
    type: 'event',
    packageId: null,
    level: 1,
    pax: 100,
    date: '',
    dishes: [],
    extraDishes: [],
    specialDishes: [],
    addOns: [],
    skipped: [],
    stageText: { name: '', character: '' },
    layoutId: null,
    details: {
      name: '',
      mobile: '',
      contactMethod: 'SMS',
      messengerName: '',
      venue: '',
      time: '06:30 PM',
      notes: ''
    },
    trays: []
  };
}

// Cross-tab broadcast channels for instant multi-tab sync across both channel names.
const broadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tikim_sync_channel') : null;
const liveBroadcast = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tikim_live_channel') : null;

export function onSyncMessage(callback) {
  if (broadcast) {
    broadcast.onmessage = (event) => callback(event.data);
  }
  if (liveBroadcast) {
    liveBroadcast.onmessage = (event) => callback(event.data);
  }
  window.addEventListener('storage', (event) => {
    callback({ type: 'storage_change', key: event.key, newValue: event.newValue });
  });
}

function notifySync(type, payload = {}) {
  const msg = { type, payload, timestamp: Date.now() };
  if (broadcast) {
    try {
      broadcast.postMessage(msg);
    } catch (e) {
      // Ignore broadcast errors in sandboxed environments
    }
  }
  if (liveBroadcast) {
    try {
      liveBroadcast.postMessage(msg);
    } catch (e) {
      // Ignore broadcast errors
    }
  }
}

function notifyAvailabilityChanged() {
  window.dispatchEvent(new CustomEvent('tikim:availability-updated'));
}

// Relative date helper generating YYYY-MM-DD from today + dayOffset.
export function getRelativeDateString(dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Storage helpers
function getStored(key, defaultVal) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function setStored(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// Initial seed loader
export async function initSeedData() {
  // Legacy JSON seed files are no longer loaded.
  // Catalog data now comes from the Laravel API.

  if (!localStorage.getItem(STORAGE_KEYS.INVENTORY)) {
    setStored(STORAGE_KEYS.INVENTORY, []);
  }

  if (!localStorage.getItem(STORAGE_KEYS.BOOKINGS)) {
    setStored(STORAGE_KEYS.BOOKINGS, []);
  }

  if (!localStorage.getItem(STORAGE_KEYS.SMS)) {
    setStored(STORAGE_KEYS.SMS, []);
  }

  if (!localStorage.getItem(STORAGE_KEYS.HOLDS)) {
    setStored(STORAGE_KEYS.HOLDS, []);
  }

  if (!localStorage.getItem(STORAGE_KEYS.QUOTES)) {
    setStored(STORAGE_KEYS.QUOTES, {});
  }
}
// Laravel date-hold API helpers
function getTikimHoldToken() {
  const key = 'tikim.holdToken';
  let token = localStorage.getItem(key);

  if (!token) {
    token = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(key, token);
  }

  return token;
}

async function requestTikimHoldApi(url, method, payload) {
  const csrfResponse = await fetch('/api/v1/csrf', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });

  const csrfData = await csrfResponse.json().catch(() => ({}));

  if (!csrfResponse.ok || !csrfData.token) {
    throw new Error('Unable to start a secure request. Please refresh the page and try again.');
  }

  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfData.token
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const validationMessages = Object.values(data.errors || {})
      .flat()
      .filter(message => typeof message === 'string');
    throw new Error(validationMessages.join(' ') || data.message || 'Unable to complete your request. Please try again.');
  }

  return data;
}

async function requestTikimFormApi(url, formData) {
  const csrfResponse = await fetch('/api/v1/csrf', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  const csrfData = await csrfResponse.json().catch(() => ({}));

  if (!csrfResponse.ok || !csrfData.token) {
    throw new Error('Unable to start a secure request. Please refresh the page and try again.');
  }

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-CSRF-TOKEN': csrfData.token
    },
    body: formData
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const validationMessage = data.errors
      ? Object.values(data.errors).flat()[0]
      : null;
    throw new Error(validationMessage || data.message || 'Unable to submit your payment proof. Please try again.');
  }

  return data;
}

// Replace the existing holdDate function.
export async function holdDate(date, draftId = 'draft-current') {
  await initSeedData();

  const token = getTikimHoldToken();

  const data = await requestTikimHoldApi('/api/v1/holds', 'POST', {
    date,
    session_token: token
  });

  const expiresAt = data.hold.expiresAt;

  // Keep a local copy for existing calendar and cross-tab UI behavior.
  const holds = getStored(STORAGE_KEYS.HOLDS, []);
  const filtered = holds.filter(h => h.draftId !== draftId && h.date !== date);

  filtered.push({
    date,
    draftId,
    expiresAt,
    createdAt: new Date().toISOString()
  });

  setStored(STORAGE_KEYS.HOLDS, filtered);

  notifySync('date_hold_created', { date, draftId, expiresAt });
  notifyAvailabilityChanged();

  return {
    success: true,
    date,
    expiresAt
  };
}

// Replace the existing getActiveHold function.
export async function getActiveHold() {
  const token = getTikimHoldToken();

  const response = await fetch(
    `/api/v1/holds/active?session_token=${encodeURIComponent(token)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Unable to check your date hold. Please refresh and try again.');
  }

  if (!data.hold) {
    setStored(STORAGE_KEYS.HOLDS, []);
    return null;
  }

  const activeHold = {
    date: data.hold.date,
    expiresAt: data.hold.expiresAt,
    draftId: 'draft-current'
  };

  setStored(STORAGE_KEYS.HOLDS, [activeHold]);

  return activeHold;
}

// Replace the existing releaseHold function.
export async function releaseHold(target) {
  const token = getTikimHoldToken();

  await requestTikimHoldApi('/api/v1/holds/active', 'DELETE', {
    session_token: token
  });

  setStored(STORAGE_KEYS.HOLDS, []);

  notifySync('date_hold_released', { target });
  notifyAvailabilityChanged();
}

// Replace the existing releaseActiveHold function.
export async function releaseActiveHold() {
  const token = getTikimHoldToken();

  await requestTikimHoldApi('/api/v1/holds/active', 'DELETE', {
    session_token: token
  });

  setStored(STORAGE_KEYS.HOLDS, []);

  notifySync('date_hold_released', {});
  notifyAvailabilityChanged();
}

// 2. Customer Bookings CRUD

export async function createBooking(payload) {
  await initSeedData();

  const customerName = payload.customerName || payload.customer?.name || '';
  const mobile = payload.mobile || payload.customer?.mobile || '';

  const rawType = payload.type || 'event';
  const type = rawType === 'food_order' ? 'trays' : rawType;

  const eventDate =
    payload.eventDate ||
    payload.deliveryDate ||
    getRelativeDateString(14);

  const requestPayload = {
    ...payload,
    type,
    customerName,
    mobile,
    eventDate,
    session_token: type === 'trays' ? undefined : getTikimHoldToken()
  };

  // Submit the booking to Laravel.
  const response = await requestTikimHoldApi(
    '/api/v1/bookings',
    'POST',
    requestPayload
  );

  if (!response?.success || !response?.booking) {
    throw new Error(response?.message || 'Unable to create your booking.');
  }

  const newBooking = response.booking;
  notifyAvailabilityChanged();

  // Queue initial simulated SMS after successful database creation.
  await queueSms(newBooking.mobile, 'booking_received', {
    name: newBooking.customerName,
    ref: newBooking.ref,
    date: newBooking.eventDate
  });

  notifySync('booking_created', newBooking);

  return newBooking;
}

export async function getManualBookingCatalog() {
  const response = await fetch('/api/v1/catalog', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.data) {
    throw new Error(data.message || 'Unable to load booking options.');
  }

  return data.data;
}

export async function createManualBooking(payload) {
  const result = await requestTikimHoldApi(
    '/api/v1/admin/bookings/manual',
    'POST',
    payload
  );

  if (!result.booking || !result.success) {
    throw new Error(result.message || 'Unable to create the manual booking.');
  }

  notifyAvailabilityChanged();
  notifySync('booking_created', result.booking);
  return result.booking;
}

export async function previewManualBooking(payload) {
  const result = await requestTikimHoldApi(
    '/api/v1/admin/bookings/manual/preview',
    'POST',
    payload
  );

  if (!result.preview) {
    throw new Error(result.message || 'Unable to calculate the booking price.');
  }

  return result.preview;
}


export async function getBooking(idOrRef) {
  await initSeedData();
  const bookings = getStored(STORAGE_KEYS.BOOKINGS, []);
  return bookings.find(b => b.id === idOrRef || (b.ref || '').toUpperCase() === (idOrRef || '').toUpperCase()) || null;
}

export async function getBookingByRef(ref, last4) {
  const cleanRef = (ref || '').trim().toUpperCase();
  const cleanLast4 = (last4 || '').trim();

  if (!cleanRef) return null;

  let data;
  if (cleanLast4) {
    data = await requestTikimHoldApi('/api/v1/bookings/lookup', 'POST', {
      reference: cleanRef,
      last4: cleanLast4
    });
  } else {
    const response = await fetch(
      `/api/v1/bookings/${encodeURIComponent(cleanRef)}`,
      {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      }
    );

    data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Unable to retrieve your booking. Please try again.');
    }
  }

  return data.booking || null;
}


export async function listBookings(filters = {}) {
  const response = await fetch('/api/v1/admin/bookings', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Unable to load bookings from the server.');
  }

  if (!Array.isArray(data.bookings)) {
    throw new Error('The booking list response was invalid.');
  }

  let bookings = data.bookings.map(booking => {
    const typeLabels = {
      event: 'Event',
      food: 'Food Package',
      trays: 'Food Trays'
    };
    const typeLabel = typeLabels[booking.type] || booking.type || 'Catering';

    return {
      ...booking,
      id: String(booking.id),
      customerName: booking.customer?.name || '',
      mobile: booking.customer?.mobile || '',
      eventType: typeLabel,
      tag: typeLabel,
      deliveryDate: booking.eventDate || null
    };
  });

  if (filters.status && filters.status !== 'All' && filters.status !== 'all') {
    bookings = bookings.filter(booking =>
      booking.status === filters.status ||
      (filters.status === 'Hold' && booking.status === 'Hold (48 Hours)')
    );
  }

  if (filters.search) {
    const query = String(filters.search).toLowerCase();
    bookings = bookings.filter(booking => [
      booking.customer?.name,
      booking.ref,
      booking.customer?.mobile,
      booking.eventType,
      booking.eventDate
    ].some(value => String(value || '').toLowerCase().includes(query)));
  }

  return bookings;
}

export async function getAdminCalendarData(from, to) {
  const response = await fetch(
    `/api/v1/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Unable to load calendar availability.');
  }

  if (!data.availability || typeof data.availability !== 'object' || Array.isArray(data.availability)) {
    throw new Error('The availability response was invalid.');
  }

  const bookings = await listBookings();
  return {
    availability: data.availability,
    bookings: bookings.filter(booking => {
      const date = booking.eventDate || booking.deliveryDate;
      return date && date >= from && date <= to;
    })
  };
}

export async function getAdminBookingQuote(id) {
  const response = await fetch(
    `/api/v1/admin/bookings/${encodeURIComponent(id)}/quote`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Unable to load the persisted booking quote.');
  }
  if (!data.booking || !data.booking.quoteSnapshot) {
    throw new Error('The server returned an invalid booking quote response.');
  }

  return data;
}

export async function updateBookingQuote(id, payload) {
  const result = await requestTikimHoldApi(
    `/api/v1/admin/bookings/${encodeURIComponent(id)}/quote`,
    'PATCH',
    payload
  );

  if (!result.booking || !result.booking.quoteSnapshot) {
    throw new Error('The server returned an invalid updated quote response.');
  }

  return result;
}

export async function updateBooking(id, patch = {}) {
  const bookings = getStored(STORAGE_KEYS.BOOKINGS, []);
  const idx = bookings.findIndex(b => b.id === id || b.ref === id);
  if (idx === -1) return null;

  bookings[idx] = { ...bookings[idx], ...patch };
  setStored(STORAGE_KEYS.BOOKINGS, bookings);
  notifySync('booking_updated', bookings[idx]);
  return bookings[idx];
}

export async function updateBookingStatus(id, action) {
  if (!['cancel', 'complete', 'reopen'].includes(action)) {
    throw new Error('Unsupported booking status action.');
  }

  const result = await requestTikimHoldApi(
    `/api/v1/admin/bookings/${encodeURIComponent(id)}/status`,
    'PATCH',
    { action }
  );

  if (!result.booking) {
    throw new Error('The server returned an invalid booking status response.');
  }

  return result;
}

// 3. Payments and Proof Upload
export async function addPayment(arg1, arg2) {
  const payload = arg1 && typeof arg1 === 'object' ? arg1 : (arg2 || {});
  const reference = String(payload.reference || payload.ref || '').trim().toUpperCase();
  const file = payload.file || payload.receipt;

  if (!reference || !(file instanceof Blob)) {
    throw new Error('A verified booking, payment details, and receipt file are required.');
  }

  const formData = new FormData();
  formData.append('payment_method', payload.channel || payload.paymentMethod || 'GCash');
  formData.append(
    'transaction_number',
    payload.transaction_number || payload.transactionNo || payload.refNo || ''
  );
  formData.append('amount', String(payload.amount || ''));
  formData.append('receipt', file, file.name || 'receipt');

  const result = await requestTikimFormApi(
    `/api/v1/bookings/${encodeURIComponent(reference)}/payments`,
    formData
  );
  notifySync('payment_proof_submitted', { reference, payment: result.payment });
  return result.payment;
}

export async function listPendingPayments() {
  const response = await fetch('/api/v1/admin/payments/pending', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Unable to load payment submissions.');
  }

  if (!Array.isArray(data.payments)) {
    throw new Error('The payment queue response was invalid.');
  }

  return data.payments;
}

export async function getPaymentReceipt(paymentReceiptId) {
  const response = await fetch(
    `/api/v1/admin/payment-receipts/${encodeURIComponent(paymentReceiptId)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/octet-stream' }
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Unable to retrieve this receipt.');
  }

  return response.blob();
}

export async function reviewPayment(paymentId, decision, reason = '') {
  const action = String(decision).toLowerCase();
  if (!['approved', 'approve', 'rejected', 'reject'].includes(action)) {
    throw new Error('Choose an approval or rejection decision.');
  }

  const endpointAction = action.startsWith('approv') ? 'approve' : 'reject';
  return requestTikimHoldApi(
    `/api/v1/admin/payments/${encodeURIComponent(paymentId)}/${endpointAction}`,
    'POST',
    endpointAction === 'reject' ? { reason } : {}
  );
}


// 4. Inventory fleet management
export async function listInventory() {
  await initSeedData();
  return getStored(STORAGE_KEYS.INVENTORY, []);
}

export async function updateInventory(id, patch) {
  const items = getStored(STORAGE_KEYS.INVENTORY, []);
  const idx = items.findIndex(i => i.id === id || i.rentalId === id);
  if (idx === -1) return null;

  items[idx] = { ...items[idx], ...patch };
  setStored(STORAGE_KEYS.INVENTORY, items);
  notifySync('inventory_updated', items[idx]);
  return items[idx];
}

// 5. Quotes and Unified Shared Draft (tikim.draft)
export async function getDraft() {
  const stored = getStored(STORAGE_KEYS.DRAFT, null);
  if (!stored) return null;
  return { ...getDefaultDraft(), ...stored };
}

export async function saveDraft(patch) {
  const cur = (await getDraft()) || getDefaultDraft();
  const updated = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  setStored(STORAGE_KEYS.DRAFT, updated);
  notifySync('draft_saved', updated);
  return updated;
}

export async function clearDraft() {
  localStorage.removeItem(STORAGE_KEYS.DRAFT);
  notifySync('draft_cleared', null);
  return null;
}

export const getDraftQuote = getDraft;
export const saveDraftQuote = saveDraft;

// Layouts CRUD (tikim.layouts)
export async function listLayouts() {
  return getStored(STORAGE_KEYS.LAYOUTS, []);
}

export async function getLayout(id) {
  const layouts = getStored(STORAGE_KEYS.LAYOUTS, []);
  return layouts.find(l => l.id === id) || null;
}

export async function saveLayout(layout) {
  const layouts = getStored(STORAGE_KEYS.LAYOUTS, []);
  const now = new Date().toISOString();
  const id = layout.id || `layout-${Date.now()}`;
  const idx = layouts.findIndex(l => l.id === id);
  const record = {
    id,
    name: layout.name || 'Untitled Layout',
    venue: layout.venue || 'Standard Hall',
    units: layout.units || [],
    thumbnail: layout.thumbnail || '',
    createdAt: idx >= 0 ? (layouts[idx].createdAt || now) : now,
    updatedAt: now
  };
  if (idx >= 0) {
    layouts[idx] = record;
  } else {
    layouts.unshift(record);
  }
  setStored(STORAGE_KEYS.LAYOUTS, layouts);
  notifySync('layout_saved', record);
  return record;
}

export async function deleteLayout(id) {
  const layouts = getStored(STORAGE_KEYS.LAYOUTS, []);
  const filtered = layouts.filter(l => l.id !== id);
  setStored(STORAGE_KEYS.LAYOUTS, filtered);
  notifySync('layout_deleted', { id });
  return true;
}

// Saved Menus CRUD (tikim.menus)
export async function listSavedMenus() {
  return getStored(STORAGE_KEYS.SAVED_MENUS, []);
}

export async function saveMenu(menu) {
  const menus = getStored(STORAGE_KEYS.SAVED_MENUS, []);
  const now = new Date().toISOString();
  const id = menu.id || `menu-${Date.now()}`;
  const idx = menus.findIndex(m => m.id === id);
  const record = {
    id,
    name: menu.name || 'Menu 1',
    level: menu.level || 1,
    dishes: menu.dishes || [],
    extraDishes: menu.extraDishes || [],
    specialDishes: menu.specialDishes || [],
    createdAt: idx >= 0 ? (menus[idx].createdAt || now) : now,
    updatedAt: now
  };
  if (idx >= 0) {
    menus[idx] = record;
  } else {
    menus.unshift(record);
  }
  setStored(STORAGE_KEYS.SAVED_MENUS, menus);
  notifySync('menu_saved', record);
  return record;
}

export async function deleteMenu(id) {
  const menus = getStored(STORAGE_KEYS.SAVED_MENUS, []);
  const filtered = menus.filter(m => m.id !== id);
  setStored(STORAGE_KEYS.SAVED_MENUS, filtered);
  notifySync('menu_deleted', { id });
  return true;
}

// Inquiries CRUD (tikim.inquiries)
export async function listInquiries() {
  return getStored(STORAGE_KEYS.INQUIRIES, []);
}

export async function createInquiry(payload) {
  const inquiries = getStored(STORAGE_KEYS.INQUIRIES, []);
  const item = {
    id: `inq-${Date.now()}`,
    name: payload.name || 'Anonymous',
    mobile: payload.mobile || '',
    messengerName: payload.messengerName || '',
    message: payload.message || '',
    createdAt: new Date().toISOString()
  };
  inquiries.unshift(item);
  setStored(STORAGE_KEYS.INQUIRIES, inquiries);
  notifySync('inquiry_created', item);
  return item;
}

export async function createQuote(quotePayload) {
  const quotes = getStored(STORAGE_KEYS.QUOTES, {});
  const id = `QT-${Date.now().toString(36).toUpperCase()}`;
  quotes[id] = { ...quotePayload, id, createdAt: new Date().toISOString() };
  setStored(STORAGE_KEYS.QUOTES, quotes);
  return quotes[id];
}

export async function getQuote(id) {
  const quotes = getStored(STORAGE_KEYS.QUOTES, {});
  return quotes[id] || null;
}

// 6. Vendors
export async function listVendors() {
  await initSeedData();
  try {
    const res = await fetch('data/vendors.json');
    return await res.json();
  } catch (e) {
    return [];
  }
}

// 7. Equipment Turnover Reports
export async function saveTurnover(bookingId, report) {
  const turnovers = getStored(STORAGE_KEYS.TURNOVERS, {});
  turnovers[bookingId] = {
    bookingId,
    report,
    savedAt: new Date().toISOString()
  };
  setStored(STORAGE_KEYS.TURNOVERS, turnovers);
  await updateBooking(bookingId, { turnoverStatus: 'Inspection Signed' });
  notifySync('turnover_saved', { bookingId, report });
  return turnovers[bookingId];
}

export async function getTurnover(bookingId) {
  const turnovers = getStored(STORAGE_KEYS.TURNOVERS, {});
  return turnovers[bookingId] || null;
}

// 8. SMS Queue and Log
export async function listSms() {
  return getStored(STORAGE_KEYS.SMS, []);
}

export async function queueSms(recipientPhone, templateKey, params = {}) {
  const logs = getStored(STORAGE_KEYS.SMS, []);
  const body = renderSmsText(templateKey, params);
  const item = {
    id: `sms-${Date.now()}`,
    recipient: recipientPhone,
    templateKey,
    body,
    status: 'Simulated Delivery',
    sentAt: new Date().toISOString()
  };
  logs.unshift(item);
  setStored(STORAGE_KEYS.SMS, logs);
  notifySync('sms_queued', item);
  return item;
}

// 9. Settings
export async function getSettings() {
  await initSeedData();
  const settings = getStored(STORAGE_KEYS.SETTINGS, {});
  const defaults = {
    downpaymentPercent: 50,
    traysPaymentPercent: 100,
    holdHours: 48,
    balanceDueDaysBeforeEvent: 7,
    extraPerHead: 250,
    guestsPerRoundTable: 5,
    minPaxFood: 75,
    minPaxEvent: 100,
    underMinFlat: 15000,
    rushBookingDays: 7,
    policyVersion: 1,
    paymentChannels: [
      {
        id: "chan_gcash",
        name: "GCash",
        accountName: "Dack's Catering Services",
        accountNumber: "0977 752 3458",
        notes: "Express send or QR transfer. Instant confirmation.",
        enabled: true
      },
      {
        id: "chan_maya",
        name: "Maya",
        accountName: "Dack's Catering Services",
        accountNumber: "0977 752 3458",
        notes: "Maya wallet or scan QR.",
        enabled: true
      },
      {
        id: "chan_bdo",
        name: "Bank Transfer",
        accountName: "Dack's Catering Services",
        accountNumber: "0048-2910-4491",
        notes: "BDO Current Account. Please add booking reference in remarks.",
        enabled: true
      }
    ],
    paymentNotes: "Please keep your transaction reference number and official deposit receipt for verification.",
    cancellationPolicy: "Cancellations made 30 days prior to event date receive a full 100% refund of the downpayment.\n\nCancellations made within 14 to 29 days receive a 50% refund.\n\n- Cancellations made under 14 days forfeit the 50% downpayment to cover perishable kitchen provisioning and blocked equipment.\n- One reschedule request is granted without penalty if submitted at least 14 days prior.\n[To be confirmed by Dack's]",
    damagePolicy: "Clients and organizers are expected to treat all catered equipment and venue styling installations with care.\n\n- Serving utensils, chaffing warmers, and banquet tables must remain in the designated event area.\n- Broken glassware, cracked chinaware, or burnt linens will be billed at standard commercial replacement value.\n- A joint turnover inventory inspection is conducted with the coordinator upon ingress and ingress conclusion.\n[To be confirmed by Dack's]",
    messengerUrl: 'https://m.me/dackscatering',
    demoMode: true
  };
  return { ...defaults, ...settings };
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  let nextPolicyVersion = cur.policyVersion || 1;
  if (
    (patch.cancellationPolicy !== undefined && patch.cancellationPolicy !== cur.cancellationPolicy) ||
    (patch.damagePolicy !== undefined && patch.damagePolicy !== cur.damagePolicy) ||
    patch.incrementPolicyVersion
  ) {
    nextPolicyVersion = (cur.policyVersion || 1) + 1;
  }
  const updated = { ...cur, ...patch, policyVersion: nextPolicyVersion };
  setStored(STORAGE_KEYS.SETTINGS, updated);
  notifySync('settings_updated', updated);
  return updated;
}

// 10. Organizer Session Management
export function getSession() {
  const raw = sessionStorage.getItem(STORAGE_KEYS.SESSION);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(user) {
  sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
  notifySync('admin_session_changed', user);
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEYS.SESSION);
  notifySync('admin_session_cleared');
}
export async function getAvailability(monthString) {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthString || '');
  if (!monthMatch) {
    throw new Error('Invalid calendar month. Please refresh and try again.');
  }

  const year = Number(monthMatch[1]);
  const month = Number(monthMatch[2]);
  if (month < 1 || month > 12) {
    throw new Error('Invalid calendar month. Please refresh and try again.');
  }

  const from = `${monthMatch[1]}-${monthMatch[2]}-01`;
  const to = `${monthMatch[1]}-${monthMatch[2]}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const response = await fetch(
    `/api/v1/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Unable to load calendar availability. Please try again.');
  }

  if (!data.availability || typeof data.availability !== 'object' || Array.isArray(data.availability)) {
    throw new Error('The availability response was invalid. Please try again.');
  }

  const availabilityMap = data.availability;

  const settings = await getSettings();

  (settings.blockedDates || []).forEach(bd => {
    const dStr = typeof bd === 'string' ? bd : bd.date;
    const reason = typeof bd === 'object'
      ? (bd.reason || 'Blocked by organizer')
      : 'Blocked by organizer';

    if (dStr) {
      availabilityMap[dStr] = {
        status: 'Blocked by organizer',
        note: reason,
        isBlocked: true
      };
    }
  });

  (settings.peakDates || []).forEach(dStr => {
    if (dStr && !availabilityMap[dStr]) {
      availabilityMap[dStr] = {
        status: 'Peak Date',
        isPeak: true,
        note: 'Weekend Prime Holiday Slot'
      };
    }
  });

  return availabilityMap;
}
export async function getAvailabilityByDate(itemId, dateStr) {
  await initSeedData();
  const inventory = getStored(STORAGE_KEYS.INVENTORY, []);
  const item = inventory.find(i => i.id === itemId);
  if (!item) return 0;
  const bookings = getStored(STORAGE_KEYS.BOOKINGS, []);
  const dayBookings = bookings.filter(b => (b.eventDate === dateStr || b.deliveryDate === dateStr) && b.status !== 'Cancelled');
  let reserved = 0;
  dayBookings.forEach(b => {
    (b.rentals || []).forEach(r => {
      if (r.id === itemId) reserved += (r.qty || 0);
    });
  });
  return Math.max(0, (item.availableQuantity || item.totalQuantity || 0) - reserved);
}

// Unified mockApi object bundle
export const mockApi = {
  getDraft,
  saveDraft,
  clearDraft,
  getDefaultDraft,
  getDraftQuote,
  getActiveHold,
  getAvailability,
  holdDate,
  releaseHold,
  releaseActiveHold,
  createBooking,
  getManualBookingCatalog,
  createManualBooking,
  previewManualBooking,
  getBooking,
  getBookingByRef,
  listBookings,
  getAdminCalendarData,
  getAdminBookingQuote,
  updateBookingQuote,
  updateBooking,
  updateBookingStatus,
  addPayment,
  listPendingPayments,
  getPaymentReceipt,
  reviewPayment,
  listInventory,
  updateInventory,
  getAvailabilityByDate,
  createQuote,
  getQuote,
  listVendors,
  saveTurnover,
  listSms,
  queueSms,
  getSettings,
  saveSettings,
  getSession,
  setSession,
  clearSession,
  onSyncMessage,
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
  listSavedMenus,
  saveMenu,
  deleteMenu,
  listInquiries,
  createInquiry
};

export const api = mockApi;
export default mockApi;
