/**
 * TIKIM Event Calendar Component
 * Custom interactive calendar with double-booking prevention, 48-hr hold display,
 * peak date highlights, and keyboard navigation.
 */

import { mockApi } from './mockApi.js';

export class TikimCalendar {
  constructor(container, options = {}) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = {
      selectedDate: options.selectedDate || '',
      minDate: options.minDate || new Date().toISOString().split('T')[0],
      onSelectDate: options.onSelectDate || options.onDateSelect || (() => {}),
      onDateSelect: options.onSelectDate || options.onDateSelect || (() => {}),
      ...options
    };

    let initialDate = new Date();
    if (this.options.selectedDate) {
      const parts = String(this.options.selectedDate).split('-');
      if (parts.length === 3) {
        initialDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    }
    this.currentYear = initialDate.getFullYear();
    this.currentMonth = initialDate.getMonth();
    this.availabilityMap = {};
    this.availabilityLoaded = false;
    this.availabilityRequestId = 0;
    this.selectedDate = this.options.selectedDate;

    this.renderSkeleton();
    window.addEventListener('tikim:availability-updated', () => this.loadMonthData());
    window.addEventListener('focus', () => this.loadMonthData());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.loadMonthData();
    });
    setInterval(() => {
      if (!document.hidden) this.loadMonthData();
    }, 60000);
    this.loadMonthData();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="tikim-calendar-wrap">
        <div class="calendar-header">
          <button type="button" class="cal-nav-btn" id="calPrevMonth" aria-label="Previous Month">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h3 class="cal-month-title" id="calMonthTitle" aria-live="polite">Loading...</h3>
          <button type="button" class="cal-nav-btn" id="calNextMonth" aria-label="Next Month">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <p id="calAvailabilityMessage" role="status" aria-live="polite" hidden style="margin:0 0 0.75rem; text-align:center; font-size:0.875rem; color:var(--color-rust);"></p>

        <div class="calendar-weekdays" role="row">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>

        <div class="calendar-days-grid" id="calDaysGrid" role="grid">
          <!-- Days populated dynamically -->
        </div>

        <div class="calendar-legend">
          <div class="legend-item"><span class="legend-dot dot-avail"></span> Available</div>
          <div class="legend-item"><span class="legend-dot dot-hold"></span> On Hold (48h)</div>
          <div class="legend-item"><span class="legend-dot dot-booked"></span> Booked</div>
          <div class="legend-item"><span class="legend-dot dot-blocked"></span> Blocked</div>
          <div class="legend-item"><span class="legend-dot dot-peak"></span> Peak Date</div>
        </div>
      </div>
    `;

    this.container.querySelector('#calPrevMonth').addEventListener('click', () => this.prevMonth());
    this.container.querySelector('#calNextMonth').addEventListener('click', () => this.nextMonth());
  }

  async loadMonthData() {
    const requestId = ++this.availabilityRequestId;
    this.availabilityLoaded = false;
    const monthStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}`;
    const titleEl = this.container.querySelector('#calMonthTitle');
    const messageEl = this.container.querySelector('#calAvailabilityMessage');
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    titleEl.textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;
    if (messageEl) {
      messageEl.hidden = false;
      messageEl.textContent = 'Loading availability...';
    }
    this.renderDaysGrid();

    try {
      const availabilityMap = await mockApi.getAvailability(monthStr);
      if (requestId !== this.availabilityRequestId) return;
      this.availabilityMap = availabilityMap;
      this.availabilityLoaded = true;
      if (messageEl) messageEl.hidden = true;
    } catch (e) {
      if (requestId !== this.availabilityRequestId) return;
      console.error('Could not load availability:', e);
      this.availabilityMap = {};
      if (messageEl) {
        messageEl.hidden = false;
        messageEl.textContent = 'Availability could not be loaded. Please try again.';
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'btn btn-xs btn-outline';
        retryButton.textContent = 'Retry';
        retryButton.style.marginLeft = '0.5rem';
        retryButton.addEventListener('click', () => this.loadMonthData());
        messageEl.appendChild(retryButton);
      }
    }

    this.renderDaysGrid();
  }

  prevMonth() {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.loadMonthData();
  }

  nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.loadMonthData();
  }

  renderDaysGrid() {
    const grid = this.container.querySelector('#calDaysGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const firstDayIndex = new Date(this.currentYear, this.currentMonth, 1).getDay();
    const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    // Leading empty slots for previous month
    for (let i = 0; i < firstDayIndex; i++) {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'cal-day-cell cal-day-empty';
      grid.appendChild(emptySlot);
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const rawStatus = this.availabilityMap[dateStr];
      let status = 'available';
      if (rawStatus) {
        if (typeof rawStatus === 'string') {
          status = rawStatus.toLowerCase();
        } else if (rawStatus.status) {
          const s = rawStatus.status.toLowerCase();
          if (s.includes('hold')) status = 'hold';
          else if (s.includes('block')) status = 'blocked';
          else if (s.includes('peak')) status = 'peak';
          else if (s.includes('booked')) status = 'booked';
          else if (s.includes('pending')) status = 'hold';
          else status = 'available';
        }
      }

      const isPast = dateStr < todayStr;
      const isSelected = dateStr === this.selectedDate;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-day-cell';
      cell.dataset.date = dateStr;
      cell.setAttribute('role', 'gridcell');

      let statusClass = `status-${status}`;
      let isClickable = true;

      if (isPast) {
        statusClass = 'status-past';
        isClickable = false;
        cell.disabled = true;
      } else if (status === 'booked' || status === 'blocked') {
        isClickable = false;
        cell.disabled = true;
      }
      if (!this.availabilityLoaded) {
        isClickable = false;
        cell.disabled = true;
      }

      cell.classList.add(statusClass);
      if (isSelected) cell.classList.add('selected');

      // Cell Content
      let peakBadge = status === 'peak' ? '<span class="cal-peak-star" title="Peak Date"><svg class="icon" width="10" height="10" aria-hidden="true" style="color:var(--rust); vertical-align:top;"><use href="assets/icons/sprite.svg#icon-wand"></use></svg></span>' : '';
      let holdStripes = status === 'hold' ? '<span class="cal-hold-badge">Hold</span>' : '';
      let dayNumber = `<span class="cal-day-num">${day}</span>`;

      cell.innerHTML = `${peakBadge}${dayNumber}${holdStripes}`;
      cell.setAttribute('aria-label', `${dateStr}, status: ${status}${isSelected ? ', selected' : ''}`);

      if (isClickable) {
        cell.addEventListener('click', () => {
          this.setSelectedDate(dateStr, status === 'peak');
        });
      }

      grid.appendChild(cell);
    }
  }

  setSelectedDate(dateStr, isPeak = false, triggerCallback = true) {
    this.selectedDate = dateStr;
    if (dateStr) {
      const parts = String(dateStr).split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (y !== this.currentYear || m !== this.currentMonth) {
          this.currentYear = y;
          this.currentMonth = m;
          this.loadMonthData();
        }
      }
    }

    const allCells = this.container.querySelectorAll('.cal-day-cell');
    allCells.forEach(c => {
      c.classList.toggle('selected', c.dataset.date === dateStr);
    });

    if (triggerCallback) {
      const cb = this.options.onSelectDate || this.options.onDateSelect;
      if (typeof cb === 'function') {
        cb(dateStr, isPeak);
      }
    }
  }

  getDate() {
    return this.selectedDate;
  }
}
