// Timezone-safe production calendar for organizer administration.
import { mockApi } from './mockApi.js';
import { formatPeso } from './pricing.js';

export function parseYmd(ymdStr) {
  if (!ymdStr || typeof ymdStr !== 'string') return null;
  const parts = ymdStr.trim().split('-');
  if (parts.length < 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return new Date(y, m, d, 12, 0, 0);
}

export function formatYmd(dateObj) {
  if (!dateObj) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export class AdminMasterCalendar {
  constructor(mountElement, options = {}) {
    this.mount = typeof mountElement === 'string' ? document.querySelector(mountElement) : mountElement;
    this.options = options;
    this.onOpenDrawer = options.onOpenDrawer || (() => {});
    this.onStateChanged = options.onStateChanged || (() => {});

    const today = new Date();
    this.viewMode = 'month'; // 'month' or 'week'
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
    this.currentDay = today.getDate();
    this.selectedDateStr = formatYmd(today);

    this.bookings = [];
    this.availability = {};
    this.settings = {};
    this.holds = [];
    this.loading = false;
    this.error = null;

    this.init();
  }

  async init() {
    this.renderSkeleton();
    await this.refreshData();
  }

  async refreshData() {
    const range = this.getDisplayedDateRange();
    this.loading = true;
    this.error = null;
    this.setStatus('Loading calendar data...');
    try {
      const [calendarData, settings] = await Promise.all([
        mockApi.getAdminCalendarData(range.from, range.to),
        mockApi.getSettings()
      ]);
      this.bookings = calendarData.bookings || [];
      this.availability = calendarData.availability || {};
      this.settings = settings || {};
      this.loading = false;
      this.render();
      this.setStatus('');
    } catch (err) {
      this.loading = false;
      this.error = err.message || 'Unable to load calendar data.';
      this.setStatus(this.error, true);
      console.error('Failed to refresh admin calendar data:', err);
    }
  }

  getDisplayedDateRange() {
    if (this.viewMode === 'week') {
      const base = new Date(this.currentYear, this.currentMonth, this.currentDay, 12);
      const start = new Date(base);
      start.setDate(base.getDate() - base.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: formatYmd(start), to: formatYmd(end) };
    }

    return {
      from: `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-01`,
      to: formatYmd(new Date(this.currentYear, this.currentMonth + 1, 0, 12))
    };
  }

  setStatus(message, isError = false) {
    const status = this.mount?.querySelector('#adminCalendarStatus');
    if (!status) return;
    status.textContent = message;
    status.style.display = message ? 'block' : 'none';
    status.style.color = isError ? 'var(--color-rust)' : 'var(--color-slate-60)';
  }

  renderSkeleton() {
    this.mount.innerHTML = `
      <div class="admin-calendar-wrapper">
        <div id="adminCalendarStatus" role="status" style="display:none; padding:0.75rem 1rem; font-size:12px; text-align:center;"></div>
        <div class="cal-toolbar">
          <div class="cal-toolbar-left">
            <div class="cal-nav-group">
              <button type="button" class="btn btn-xs btn-outline" id="calBtnPrev" aria-label="Previous">&larr;</button>
              <button type="button" class="btn btn-xs btn-outline" id="calBtnToday">Today</button>
              <button type="button" class="btn btn-xs btn-outline" id="calBtnNext" aria-label="Next">&rarr;</button>
            </div>
            <h2 class="cal-header-title" id="calHeaderTitle" aria-live="polite">Calendar</h2>
          </div>
          <div class="cal-toolbar-right">
            <div class="cal-view-toggle">
              <button type="button" class="cal-toggle-btn active" id="calBtnMonthView">Month</button>
              <button type="button" class="cal-toggle-btn" id="calBtnWeekView">Week</button>
            </div>
          </div>
        </div>

        <div class="cal-main-layout">
          <div class="cal-grid-col" id="calGridContainer">
            <!-- Grid rendered here -->
          </div>
          <div class="cal-side-panel" id="calDaySidePanel" style="display: none;">
            <!-- Day details rendered here -->
          </div>
        </div>

        <div class="cal-legend-bar">
          <div class="cal-legend-item"><span class="legend-swatch swatch-event"></span> Event (Confirmed)</div>
          <div class="cal-legend-item"><span class="legend-swatch swatch-food"></span> Food Package</div>
          <div class="cal-legend-item"><span class="legend-swatch swatch-trays"></span> Food Trays (Delivery)</div>
          <div class="cal-legend-item"><span class="legend-swatch swatch-hold"></span> 48h Hold</div>
          <div class="cal-legend-item"><span class="legend-swatch swatch-blocked"></span> Blocked Date</div>
          <div class="cal-legend-item"><span class="legend-swatch swatch-peak"></span> Peak Date</div>
          <div class="cal-legend-item"><span class="legend-swatch swatch-conflict"></span> Conflict Warning</div>
        </div>
      </div>
    `;

    this.mount.querySelector('#calBtnPrev').addEventListener('click', () => this.navigatePrev());
    this.mount.querySelector('#calBtnNext').addEventListener('click', () => this.navigateNext());
    this.mount.querySelector('#calBtnToday').addEventListener('click', () => this.navigateToday());

    this.mount.querySelector('#calBtnMonthView').addEventListener('click', () => {
      this.viewMode = 'month';
      this.mount.querySelector('#calBtnMonthView').classList.add('active');
      this.mount.querySelector('#calBtnWeekView').classList.remove('active');
      this.refreshData();
    });

    this.mount.querySelector('#calBtnWeekView').addEventListener('click', () => {
      this.viewMode = 'week';
      this.mount.querySelector('#calBtnWeekView').classList.add('active');
      this.mount.querySelector('#calBtnMonthView').classList.remove('active');
      this.refreshData();
    });
  }

  navigatePrev() {
    if (this.viewMode === 'month') {
      this.currentMonth--;
      if (this.currentMonth < 0) {
        this.currentMonth = 11;
        this.currentYear--;
      }
    } else {
      const cur = new Date(this.currentYear, this.currentMonth, this.currentDay - 7, 12);
      this.currentYear = cur.getFullYear();
      this.currentMonth = cur.getMonth();
      this.currentDay = cur.getDate();
    }
    this.refreshData();
  }

  navigateNext() {
    if (this.viewMode === 'month') {
      this.currentMonth++;
      if (this.currentMonth > 11) {
        this.currentMonth = 0;
        this.currentYear++;
      }
    } else {
      const cur = new Date(this.currentYear, this.currentMonth, this.currentDay + 7, 12);
      this.currentYear = cur.getFullYear();
      this.currentMonth = cur.getMonth();
      this.currentDay = cur.getDate();
    }
    this.render();
  }

  navigateToday() {
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
    this.currentDay = today.getDate();
    this.selectedDateStr = formatYmd(today);
    this.render();
    this.openSidePanel(this.selectedDateStr);
  }

  render() {
    const titleEl = this.mount.querySelector('#calHeaderTitle');
    const gridContainer = this.mount.querySelector('#calGridContainer');
    if (!titleEl || !gridContainer) return;

    if (this.viewMode === 'month') {
      titleEl.textContent = `${MONTH_NAMES[this.currentMonth]} ${this.currentYear}`;
      this.renderMonthGrid(gridContainer);
    } else {
      const weekDates = this.getWeekDates();
      const first = weekDates[0];
      const last = weekDates[6];
      titleEl.textContent = `${MONTH_NAMES[first.getMonth()].slice(0, 3)} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getDate()}, ${last.getFullYear()}`;
      this.renderWeekGrid(gridContainer, weekDates);
    }

    if (this.selectedDateStr) {
      this.openSidePanel(this.selectedDateStr);
    }
  }

  getWeekDates() {
    const base = new Date(this.currentYear, this.currentMonth, this.currentDay, 12);
    const dayOfWeek = base.getDay(); // 0 is Sunday
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.currentYear, this.currentMonth, this.currentDay - dayOfWeek + i, 12);
      week.push(d);
    }
    return week;
  }

  renderMonthGrid(container) {
    const firstDayIndex = new Date(this.currentYear, this.currentMonth, 1, 12).getDay();
    const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0, 12).getDate();
    const todayStr = formatYmd(new Date());

    let html = `
      <div class="cal-weekdays-row">
        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
      </div>
      <div class="cal-month-days-grid" role="grid" tabindex="0">
    `;

    // Empty leading slots
    for (let i = 0; i < firstDayIndex; i++) {
      html += `<div class="cal-cell cal-cell-empty" role="gridcell"></div>`;
    }

    let activeMonthBookings = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayBookings = this.getBookingsForDate(dStr);
      if (dayBookings.length > 0) activeMonthBookings += dayBookings.length;

      const isToday = dStr === todayStr;
      const isSelected = dStr === this.selectedDateStr;
      const isBlocked = this.isDateBlocked(dStr);
      const isPeak = this.isDatePeak(dStr);
      const hasConflict = dayBookings.length > 1;

      let cellClasses = ['cal-cell', 'cal-day-box'];
      if (isToday) cellClasses.push('is-today');
      if (isSelected) cellClasses.push('is-selected');
      if (isBlocked) cellClasses.push('is-blocked');
      if (isPeak) cellClasses.push('is-peak');
      if (hasConflict) cellClasses.push('is-conflict');

      html += `
        <div class="${cellClasses.join(' ')}" data-date="${dStr}" tabindex="0" role="gridcell" aria-label="${dStr}, ${dayBookings.length} bookings">
          <div class="cal-day-cell-header">
            <span class="cal-day-num">${day}</span>
            <div class="cal-cell-badges">
              ${isPeak ? '<span class="chip-badge chip-peak" title="Peak Date">Peak</span>' : ''}
              ${isBlocked ? '<span class="chip-badge chip-blocked" title="Blocked">Blocked</span>' : ''}
              ${this.isDateOnHold(dStr) ? '<span class="chip-badge chip-hold" title="On Hold">Hold</span>' : ''}
              ${hasConflict ? `<span class="chip-badge chip-conflict" title="Conflict Warning">${dayBookings.length} Events</span>` : ''}
            </div>
          </div>
          <div class="cal-cell-events-list">
            ${dayBookings.map(b => this.renderBookingChip(b)).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`;

    if (activeMonthBookings === 0 && daysInMonth > 0) {
      html += `
        <div class="cal-month-empty-state">
          No bookings scheduled for this month. All dates open.
        </div>
      `;
    }

    container.innerHTML = html;
    this.bindGridEvents(container);
  }

  renderWeekGrid(container, weekDates) {
    const todayStr = formatYmd(new Date());

    let html = `
      <div class="cal-weekdays-row">
        ${weekDates.map(d => `<span>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${d.getDate()}</span>`).join('')}
      </div>
      <div class="cal-week-grid" role="grid" tabindex="0">
    `;

    weekDates.forEach(d => {
      const dStr = formatYmd(d);
      const dayBookings = this.getBookingsForDate(dStr);
      const isToday = dStr === todayStr;
      const isSelected = dStr === this.selectedDateStr;
      const isBlocked = this.isDateBlocked(dStr);
      const isPeak = this.isDatePeak(dStr);
      const hasConflict = dayBookings.length > 1;

      let cellClasses = ['cal-cell', 'cal-day-box', 'cal-week-col'];
      if (isToday) cellClasses.push('is-today');
      if (isSelected) cellClasses.push('is-selected');
      if (isBlocked) cellClasses.push('is-blocked');
      if (isPeak) cellClasses.push('is-peak');
      if (hasConflict) cellClasses.push('is-conflict');

      html += `
        <div class="${cellClasses.join(' ')}" data-date="${dStr}" tabindex="0" role="gridcell" aria-label="${dStr}">
          <div class="cal-day-cell-header">
            <span class="cal-day-num">${d.getDate()}</span>
            <div class="cal-cell-badges">
              ${isPeak ? '<span class="chip-badge chip-peak">Peak</span>' : ''}
              ${isBlocked ? '<span class="chip-badge chip-blocked">Blocked</span>' : ''}
              ${this.isDateOnHold(dStr) ? '<span class="chip-badge chip-hold">Hold</span>' : ''}
              ${hasConflict ? `<span class="chip-badge chip-conflict">${dayBookings.length} Events</span>` : ''}
            </div>
          </div>
          <div class="cal-cell-events-list">
            ${dayBookings.map(b => this.renderBookingChip(b, true)).join('')}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
    this.bindGridEvents(container);
  }

  renderBookingChip(booking, verbose = false) {
    const type = booking.type || (booking.typeBadge?.includes('Tray') ? 'trays' : (booking.typeBadge?.includes('Food') ? 'food' : 'event'));
    const isHold = booking.status === 'Hold' || booking.status === 'Hold (48 Hours)';
    
    let typeClass = 'chip-event';
    let typeLabel = 'Event';
    if (type === 'food') {
      typeClass = 'chip-food';
      typeLabel = 'Food';
    } else if (type === 'trays' || type === 'food_order') {
      typeClass = 'chip-trays';
      typeLabel = 'Trays';
    }

    if (isHold) {
      typeClass = 'chip-hold';
      typeLabel = 'Hold';
    }

    let holdNote = '';
    if (isHold && booking.holdExpiresAt) {
      const diffMs = new Date(booking.holdExpiresAt).getTime() - Date.now();
      if (diffMs > 0) {
        const hrs = Math.ceil(diffMs / (1000 * 60 * 60));
        holdNote = ` (${hrs}h left)`;
      }
    }

    const title = `${booking.ref} · ${booking.customerName || booking.customer?.name || 'Customer'} · ${booking.status}${holdNote}`;

    return `
      <div class="booking-chip ${typeClass}" title="${title}" data-booking-id="${booking.id}">
        <span class="chip-type-tag">${typeLabel}</span>
        <span class="chip-ref">${booking.ref}</span>
        ${verbose ? `<span class="chip-client">${booking.customerName || ''}</span>` : ''}
        ${holdNote ? `<span class="chip-hold-timer">${holdNote}</span>` : ''}
      </div>
    `;
  }

  bindGridEvents(container) {
    const cells = container.querySelectorAll('.cal-day-box');

    cells.forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.date;
        this.selectDate(dateStr);
      });

      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const dateStr = cell.dataset.date;
          this.selectDate(dateStr);
        } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          this.handleArrowKey(cell, e.key);
        }
      });
    });
  }

  handleArrowKey(currentCell, key) {
    const allCells = Array.from(this.mount.querySelectorAll('.cal-day-box'));
    const idx = allCells.indexOf(currentCell);
    if (idx === -1) return;

    let targetIdx = idx;
    if (key === 'ArrowLeft') targetIdx = Math.max(0, idx - 1);
    else if (key === 'ArrowRight') targetIdx = Math.min(allCells.length - 1, idx + 1);
    else if (key === 'ArrowUp') targetIdx = Math.max(0, idx - 7);
    else if (key === 'ArrowDown') targetIdx = Math.min(allCells.length - 1, idx + 7);

    const targetCell = allCells[targetIdx];
    if (targetCell) {
      targetCell.focus();
      this.selectDate(targetCell.dataset.date);
    }
  }

  selectDate(dateStr) {
    this.selectedDateStr = dateStr;
    const allCells = this.mount.querySelectorAll('.cal-day-box');
    allCells.forEach(c => c.classList.toggle('is-selected', c.dataset.date === dateStr));
    this.openSidePanel(dateStr);
  }

  openSidePanel(dateStr) {
    const panel = this.mount.querySelector('#calDaySidePanel');
    if (!panel) return;

    const parsed = parseYmd(dateStr);
    const dayName = parsed ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parsed.getDay()] : '';
    const dateFormatted = parsed ? `${dayName}, ${MONTH_NAMES[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}` : dateStr;

    const dayBookings = this.getBookingsForDate(dateStr);
    const isBlocked = this.isDateBlocked(dateStr);
    const blockReason = this.getBlockReason(dateStr);
    const isPeak = this.isDatePeak(dateStr);

    panel.style.display = 'flex';
    panel.innerHTML = `
      <div class="side-panel-header">
        <div>
          <h3 class="side-panel-date">${dateFormatted}</h3>
          <span class="side-panel-count">${dayBookings.length} booking${dayBookings.length === 1 ? '' : 's'} scheduled</span>
        </div>
        <button type="button" class="panel-close-btn" id="btnCloseSidePanel">&times;</button>
      </div>

      <!-- Date Management Controls (Block / Peak) -->
      <div class="side-panel-controls-card">
        <h4 style="font-size:12px; font-weight:700; color:var(--color-slate); margin:0 0 0.5rem;">Date Schedule Controls</h4>
        
        <div style="margin-bottom:0.75rem;">
          ${isBlocked ? `
            <div style="background:rgba(171,75,46,0.1); border-left:3px solid var(--color-rust); padding:0.5rem 0.75rem; border-radius:4px; font-size:12px; margin-bottom:0.5rem;">
              <strong style="color:var(--color-rust);">Date Blocked:</strong> ${blockReason}
            </div>
            <button type="button" class="btn btn-xs btn-outline btn-block" id="btnUnblockDateBtn">
              Unblock Date (Make Available)
            </button>
          ` : `
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
              <input type="text" id="blockReasonInput" class="form-input" placeholder="Block reason (maintenance, private, holiday...)" style="font-size:12px; padding:0.4rem 0.6rem;">
              <button type="button" class="btn btn-xs btn-outline btn-block" id="btnBlockDateBtn">
                Block This Date
              </button>
            </div>
          `}
        </div>

        <div style="border-top:1px dashed #e2e8f0; padding-top:0.75rem; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; font-weight:600;">Peak Date Status</span>
          <button type="button" class="btn btn-xs ${isPeak ? 'btn-rust' : 'btn-outline'}" id="btnTogglePeakDateBtn">
            ${isPeak ? '★ Marked as Peak' : 'Mark as Peak'}
          </button>
        </div>
      </div>

      <!-- Bookings List -->
      <div class="side-panel-bookings-list">
        <h4 style="font-size:12px; font-weight:700; color:var(--color-slate-60); text-transform:uppercase; margin:0 0 0.5rem;">Bookings on this Day</h4>
        ${dayBookings.length === 0 ? `
          <div style="font-size:12px; color:var(--color-slate-60); padding:1rem 0; text-align:center;">
            No reservations on this date.
          </div>
        ` : dayBookings.map(b => `
          <div class="side-panel-booking-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <strong>${b.ref}</strong>
                <div style="font-size:12px; color:var(--color-slate); font-weight:600;">${b.customerName || b.customer?.name || 'Customer'}</div>
              </div>
              <span class="badge ${b.status === 'Confirmed' || b.status === 'Fully Paid' ? 'badge-teal' : (b.status === 'Hold' || b.status === 'Hold (48 Hours)' ? 'badge-rust' : 'badge-outline')}">${b.status}</span>
            </div>
            <div style="font-size:11px; color:var(--color-slate-60); margin:0.35rem 0;">
              ${b.packageName || b.tag || 'Catering'} · ${b.pax ? `${b.pax} Guests` : 'Food Order'} · Total: ${formatPeso(b.total)}
            </div>
            <button type="button" class="btn btn-xs btn-primary btn-drawer-link" data-id="${b.id}" style="margin-top:0.35rem; width:100%;">
              Open Booking Drawer &rarr;
            </button>
          </div>
        `).join('')}
      </div>
    `;

    panel.querySelector('#btnCloseSidePanel')?.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    panel.querySelectorAll('.btn-drawer-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = this.bookings.find(item => item.id === btn.dataset.id);
        if (b && typeof this.onOpenDrawer === 'function') {
          this.onOpenDrawer(b);
        }
      });
    });

    const blockBtn = panel.querySelector('#btnBlockDateBtn');
    if (blockBtn) {
      blockBtn.addEventListener('click', async () => {
        const reasonInput = panel.querySelector('#blockReasonInput');
        const reason = (reasonInput ? reasonInput.value : '').trim() || 'Blocked by organizer';
        await this.setBlockDate(dateStr, true, reason);
      });
    }

    const unblockBtn = panel.querySelector('#btnUnblockDateBtn');
    if (unblockBtn) {
      unblockBtn.addEventListener('click', async () => {
        await this.setBlockDate(dateStr, false);
      });
    }

    const peakBtn = panel.querySelector('#btnTogglePeakDateBtn');
    if (peakBtn) {
      peakBtn.addEventListener('click', async () => {
        await this.togglePeakDate(dateStr);
      });
    }
  }

  async setBlockDate(dateStr, shouldBlock, reason = '') {
    const settings = await mockApi.getSettings();
    let blocked = settings.blockedDates || [];

    if (shouldBlock) {
      const existingIdx = blocked.findIndex(b => (typeof b === 'string' ? b : b.date) === dateStr);
      if (existingIdx !== -1) {
        blocked[existingIdx] = { date: dateStr, reason };
      } else {
        blocked.push({ date: dateStr, reason });
      }
    } else {
      blocked = blocked.filter(b => (typeof b === 'string' ? b : b.date) !== dateStr);
    }

    settings.blockedDates = blocked;
    await mockApi.saveSettings(settings);
    this.settings = settings;
    this.render();
    this.openSidePanel(dateStr);
    this.onStateChanged();
  }

  async togglePeakDate(dateStr) {
    const settings = await mockApi.getSettings();
    let peakDates = settings.peakDates || [];

    if (peakDates.includes(dateStr)) {
      peakDates = peakDates.filter(d => d !== dateStr);
    } else {
      peakDates.push(dateStr);
    }

    settings.peakDates = peakDates;
    await mockApi.saveSettings(settings);
    this.settings = settings;
    this.render();
    this.openSidePanel(dateStr);
    this.onStateChanged();
  }

  getBookingsForDate(dateStr) {
    const now = Date.now();
    return this.bookings.filter(b => {
      const bDate = b.eventDate || b.deliveryDate;
      if (bDate !== dateStr) return false;
      if (!this.availability[dateStr]) return false;
      if (b.status === 'Cancelled') return false;

      // Filter expired holds
      if (b.status === 'Hold' && b.holdExpiresAt) {
        const expiry = new Date(b.holdExpiresAt).getTime();
        if (expiry < now) return false;
      }
      return true;
    });
  }

  isDateOnHold(dateStr) {
    return this.availability[dateStr]?.status === 'On Hold';
  }

  isDateBlocked(dateStr) {
    const blocked = this.settings.blockedDates || [];
    return blocked.some(b => (typeof b === 'string' ? b : b.date) === dateStr);
  }

  getBlockReason(dateStr) {
    const blocked = this.settings.blockedDates || [];
    const item = blocked.find(b => (typeof b === 'string' ? b : b.date) === dateStr);
    if (!item) return '';
    return typeof item === 'string' ? 'Blocked by organizer' : (item.reason || 'Blocked by organizer');
  }

  isDatePeak(dateStr) {
    const peaks = this.settings.peakDates || [];
    return peaks.includes(dateStr);
  }
}
