/**
 * TIKIM Revision 12: Food Trays Page Controller (food-orders.js)
 * ViaMare-inspired alternating menu section with rAF parallax,
 * accessible dialog with focus trap, sticky subheader tabs with scroll-spy,
 * and unified single booking flow integration (studio.html?type=trays).
 */

import { draftStore } from '../draftStore.js';

let traysData = [];
let pricingConfig = null;
let activeCategory = 'Chicken';
let lastViewedCategory = 'Chicken';
let lastFocusedTriggerBtn = null;

let CATEGORY_PRICES = {};
const formatPeso = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
  }).format(amount);
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initScrollSpyAndParallax();
  initTraysDialog();
  initOrderBar();
  updateOrderBarUI();

  // Reactive draft and storage listener for state changes
  const syncTraysState = () => {
    updateDialogSubtotal();
    updateOrderBarUI();
    const overlay = document.getElementById('traysDialog');
    if (overlay && overlay.style.display !== 'none') {
      renderDialogDishes(activeCategory);
    }
  };
  draftStore.subscribe(syncTraysState);
  window.addEventListener('storage', syncTraysState);
  window.addEventListener('tikim:trays-updated', syncTraysState);
  window.addEventListener('tikim:draft-changed', syncTraysState);
});

async function loadData() {
  try {
    const response = await fetch('/api/v1/catalog');

    if (!response.ok) {
      throw new Error(`Catalog API returned HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Invalid catalog API response.');
    }

    const data = result.data;

    // Load tray products from the database.
    traysData = (data.trays || []).map(tray => ({
      ...tray,
      id: tray.code,
      slug: tray.code.replace(/^tray-/, ''),
      price: Number(tray.price)
    }));

    // Load category prices from the database.
    CATEGORY_PRICES = {};

    (data.trayCategories || []).forEach(category => {
      CATEGORY_PRICES[category.name] = Number(category.price_per_tray);
    });

  } catch (err) {
    console.error('Failed to load trays from catalog API:', err);
  }
}

function getDraftTrays() {
  try {
    const raw = localStorage.getItem('tikim.trays') || localStorage.getItem('tikim.trayCart');
    if (raw) return JSON.parse(raw);
    const draftRaw = localStorage.getItem('tikim.draft');
    if (draftRaw) {
      const draft = JSON.parse(draftRaw);
      if (Array.isArray(draft.trays)) return draft.trays;
    }
  } catch (e) {}
  return [];
}

function saveDraftTrays(trays) {
  localStorage.setItem('tikim.trays', JSON.stringify(trays));
  localStorage.setItem('tikim.trayCart', JSON.stringify(trays));
  window.dispatchEvent(new CustomEvent('tikim:trays-updated'));
}


/* --------------------------------------------------------------------------
   Scroll-Linked Parallax & Reveal Motion (ViaMare-style)
   -------------------------------------------------------------------------- */
function initScrollSpyAndParallax() {
  const rows = document.querySelectorAll('.tray-row');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let ticking = false;

  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateMotion();
        ticking = false;
      });
      ticking = true;
    }
  };

  const updateMotion = () => {
    const winHeight = window.innerHeight;

    // First section hero image parallax & scale (ViaMare baseline)
    const heroSection = document.getElementById('traysFirstSection');
    const heroImg = document.getElementById('traysHeroImg');
    if (heroSection && heroImg) {
      if (!prefersReduced) {
        const hRect = heroSection.getBoundingClientRect();
        if (hRect.top < winHeight && hRect.bottom > 0) {
          const progress = Math.max(0, Math.min(1, -hRect.top / (hRect.height || winHeight)));
          const scale = 1.12 - (0.12 * progress);
          const shiftY = -(8 * progress);
          heroImg.style.transform = `translate3d(0, ${shiftY.toFixed(2)}%, 0) scale(${scale.toFixed(3)})`;
        }
      } else {
        heroImg.style.transform = 'none';
      }
    }

    rows.forEach(row => {
      const rect = row.getBoundingClientRect();

      // Parallax and Reveal effect
      if (!prefersReduced) {
        const textContent = row.querySelector('.tray-text-content');
        const img = row.querySelector('.tray-img');

        // Reveal text lines
        if (rect.top < winHeight * 0.85) {
          if (textContent && !textContent.classList.contains('is-visible')) {
            textContent.classList.add('is-visible');
          }
        }

        // Parallax image shift & scale
        if (rect.top < winHeight && rect.bottom > 0 && img) {
          const progress = Math.max(0, Math.min(1, (winHeight - rect.top) / (winHeight + rect.height)));
          const shiftY = (progress - 0.5) * 16; // +-8%
          const scale = 1.08 - (progress * 0.08); // 1.08 -> 1.00
          img.style.transform = `translate3d(0, ${shiftY.toFixed(2)}%, 0) scale(${scale.toFixed(3)})`;
        }
      } else {
        // Reduced motion: ensure text visible immediately
        const textContent = row.querySelector('.tray-text-content');
        if (textContent) textContent.classList.add('is-visible');
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  updateMotion();
}

/* --------------------------------------------------------------------------
   "View Trays" Dialog with Focus Trap & Steppers
   -------------------------------------------------------------------------- */
function initTraysDialog() {
  const dialog = document.getElementById('traysDialog');
  const backdrop = document.getElementById('dialogBackdrop');
  const closeBtn = document.getElementById('btnCloseDialog');
  const doneBtn = document.getElementById('btnDialogDone');

  // Trigger buttons on rows
  document.querySelectorAll('.btn-view-trays').forEach(btn => {
    btn.addEventListener('click', () => {
      lastFocusedTriggerBtn = btn;
      const cat = btn.getAttribute('data-cat');
      openTraysDialog(cat);
    });
  });

  const closeDialog = () => {
    if (!dialog) return;
    dialog.classList.remove('open');
    if (lastFocusedTriggerBtn) {
      lastFocusedTriggerBtn.focus();
    }
  };

  if (closeBtn) closeBtn.addEventListener('click', closeDialog);
  if (doneBtn) doneBtn.addEventListener('click', closeDialog);
  if (backdrop) backdrop.addEventListener('click', closeDialog);

  // Keyboard navigation & Focus trap
  document.addEventListener('keydown', (e) => {
    if (!dialog || !dialog.classList.contains('open')) return;

    if (e.key === 'Escape') {
      closeDialog();
      return;
    }

    if (e.key === 'Tab') {
      const focusables = dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
  });
}

// Test harness bridge for modal dialog testing.
window.openTraysDialog = openTraysDialog;

function openTraysDialog(category) {
  lastViewedCategory = category;
  const dialog = document.getElementById('traysDialog');
  const title = document.getElementById('dialogCategoryTitle');
  const rate = document.getElementById('dialogCategoryRate');
  const list = document.getElementById('dialogDishesList');
  if (!dialog || !list) return;

  const price = CATEGORY_PRICES[category] || 800;
  if (title) title.textContent = `${category} Trays`;
  if (rate) rate.textContent = `${formatPeso(price)} per tray`;

  const filtered = traysData.filter(d => (d.category || '').toLowerCase() === category.toLowerCase());
  const currentTrays = getDraftTrays();

  list.innerHTML = filtered.map(dish => {
    const existing = currentTrays.find(t => t.id === dish.id || t.name === dish.name);
    const qty = existing ? (existing.qty || existing.quantity || 1) : 0;

    const slug = (dish.slug || dish.id || '').replace(/^tray-/, '');
    const cat = dish.category || category;

    return `
      <div class="tray-dish-row" data-id="${dish.id}">
        <div class="tray-dish-main-col">
          <div class="tray-dish-thumb-wrap">
            <img src="assets/img/trays/${slug}.jpg" alt="${dish.name}" class="tray-dish-thumb" width="72" height="72"
                 onload="this.style.display='block'; if(this.nextElementSibling) this.nextElementSibling.style.display='none';"
                 onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
            <div class="tray-dish-svg-fallback">
              ${renderTraySvg(cat)}
            </div>
          </div>
          <div class="tray-dish-info">
            <span class="tray-dish-name">${dish.name}</span>
            <span class="tray-dish-desc">${dish.description || 'Cooked fresh to order in generous banquet pan.'}</span>
          </div>
        </div>
        <div class="tray-dish-stepper-wrap">
          <div class="tray-stepper-ctrl">
            <button type="button" class="btn-stepper btn-tray-dec" data-id="${dish.id}" aria-label="Decrease quantity" ${qty === 0 ? 'disabled' : ''}>&minus;</button>
            <span class="stepper-val" id="qty-${dish.id}">${qty}</span>
            <button type="button" class="btn-stepper btn-tray-inc" data-id="${dish.id}" aria-label="Increase quantity">&plus;</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Bind steppers
  list.querySelectorAll('.btn-tray-inc').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      updateDishQuantity(id, 1, category, price);
    };
  });

  list.querySelectorAll('.btn-tray-dec').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      updateDishQuantity(id, -1, category, price);
    };
  });

  updateDialogSubtotal();
  dialog.classList.add('open');

  // Focus the first stepper button or close button
  setTimeout(() => {
    const firstBtn = dialog.querySelector('.btn-tray-inc') || dialog.querySelector('.trays-dialog-close');
    if (firstBtn) firstBtn.focus();
  }, 50);
}

function updateDishQuantity(dishId, delta, category, price) {
  let trays = getDraftTrays();
  const dish = traysData.find(d => d.id === dishId);
  if (!dish) return;

  const idx = trays.findIndex(t => t.id === dishId || t.name === dish.name);
  if (idx > -1) {
    const newQty = (trays[idx].qty || trays[idx].quantity || 1) + delta;
    if (newQty <= 0) {
      trays.splice(idx, 1);
    } else {
      trays[idx].qty = newQty;
      trays[idx].quantity = newQty;
    }
  } else if (delta > 0) {
    trays.push({
      id: dish.id,
      name: dish.name,
      category: dish.category || category,
      price: dish.price || price,
      qty: 1,
      quantity: 1
    });
  }

  saveDraftTrays(trays);

  // Update stepper display inside dialog
  const qtyEl = document.getElementById(`qty-${dishId}`);
  const rowEl = document.querySelector(`.tray-dish-row[data-id="${dishId}"]`);
  const decBtn = rowEl ? rowEl.querySelector('.btn-tray-dec') : null;

  const updatedItem = trays.find(t => t.id === dishId);
  const updatedQty = updatedItem ? updatedItem.qty : 0;

  if (qtyEl) qtyEl.textContent = String(updatedQty);
  if (decBtn) decBtn.disabled = (updatedQty === 0);

  updateDialogSubtotal();
  updateOrderBarUI();
}

function updateDialogSubtotal() {
  const subtotalEl = document.getElementById('dialogSubtotalVal');
  if (!subtotalEl) return;

  const trays = getDraftTrays();
  const total = trays.reduce((sum, t) => sum + (Number(t.price || 0) * Number(t.qty || 1)), 0);
  subtotalEl.textContent = formatPeso(total);
}

/* --------------------------------------------------------------------------
   Sticky In-Page Order Bar
   -------------------------------------------------------------------------- */
function initOrderBar() {
  const editBtn = document.getElementById('btnBarEdit');
  const bookBtn = document.getElementById('btnBarBook');

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openTraysDialog(lastViewedCategory);
    });
  }

  if (bookBtn) {
    bookBtn.addEventListener('click', () => {
      const trays = getDraftTrays();
      if (trays.length === 0) return;

      saveDraftTrays(trays);
      window.location.href = 'studio.html?type=trays';
    });

  }
}

function updateOrderBarUI() {
  const bar = document.getElementById('traysOrderBar');
  const countEl = document.getElementById('orderBarCount');
  const totalEl = document.getElementById('orderBarTotal');
  const mainEl = document.getElementById('main-content');
  if (!bar) return;

  const trays = getDraftTrays();
  const totalQty = trays.reduce((sum, t) => sum + Number(t.qty || 1), 0);
  const totalPrice = trays.reduce((sum, t) => sum + (Number(t.price || 0) * Number(t.qty || 1)), 0);

  if (totalQty > 0) {
    bar.style.display = 'block';
    if (mainEl) mainEl.classList.add('has-order-bar');
    if (countEl) countEl.textContent = `${totalQty} tray${totalQty === 1 ? '' : 's'}`;
    if (totalEl) totalEl.textContent = formatPeso(totalPrice);
  } else {
    bar.style.display = 'none';
    if (mainEl) mainEl.classList.remove('has-order-bar');
  }
}

/**
 * Renders top-down white-tray SVG illustration with abstract food shapes in category color.
 * No emojis or text inside the illustration per specification.
 */
export function renderTraySvg(category) {
  const cat = (category || '').toLowerCase();

  let foodShapes = '';
  if (cat.includes('chicken')) {
    foodShapes = `
      <ellipse cx="26" cy="28" rx="9" ry="7" transform="rotate(-15 26 28)" fill="#c98a3a"/>
      <ellipse cx="46" cy="27" rx="8" ry="7" transform="rotate(20 46 27)" fill="#b87828"/>
      <ellipse cx="36" cy="42" rx="10" ry="7" transform="rotate(5 36 42)" fill="#c98a3a"/>
      <circle cx="24" cy="44" r="5" fill="#a66a20"/>
      <circle cx="48" cy="42" r="5.5" fill="#c98a3a"/>
    `;
  } else if (cat.includes('pork')) {
    foodShapes = `
      <rect x="18" y="20" width="13" height="11" rx="3" fill="#8a4b2e"/>
      <rect x="37" y="19" width="14" height="12" rx="3" fill="#753d24"/>
      <rect x="17" y="36" width="14" height="12" rx="3" fill="#9e5636"/>
      <rect x="36" y="35" width="15" height="13" rx="3" fill="#8a4b2e"/>
      <circle cx="34" cy="30" r="4.5" fill="#a05234"/>
    `;
  } else if (cat.includes('beef')) {
    foodShapes = `
      <ellipse cx="28" cy="26" rx="11" ry="8" transform="rotate(-10 28 26)" fill="#5a2e1f"/>
      <ellipse cx="46" cy="28" rx="9" ry="8" transform="rotate(15 46 28)" fill="#482215"/>
      <ellipse cx="34" cy="42" rx="12" ry="8" transform="rotate(-5 34 42)" fill="#5a2e1f"/>
      <ellipse cx="48" cy="44" rx="6" ry="5" fill="#6d3927"/>
    `;
  } else if (cat.includes('pasta')) {
    foodShapes = `
      <path d="M 16 26 Q 26 18 36 26 T 56 26" stroke="#e3c27a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M 15 36 Q 28 28 38 38 T 57 34" stroke="#d6b265" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M 18 46 Q 30 52 42 44 T 55 46" stroke="#e3c27a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M 22 22 Q 34 38 48 24" stroke="#cfa652" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="36" cy="35" r="3.5" fill="#ab4b2e"/>
    `;
  } else if (cat.includes('fish')) {
    foodShapes = `
      <path d="M 18 30 C 20 20, 36 20, 38 30 C 38 38, 20 38, 18 30 Z" fill="#d9d2b8" stroke="#c4bca2" stroke-width="1"/>
      <path d="M 34 40 C 36 30, 54 30, 54 40 C 54 48, 36 48, 34 40 Z" fill="#e8e2ce" stroke="#c4bca2" stroke-width="1"/>
      <ellipse cx="44" cy="24" rx="9" ry="6" transform="rotate(25 44 24)" fill="#d9d2b8"/>
      <circle cx="27" cy="27" r="1.5" fill="#5f8f4a"/>
      <circle cx="31" cy="32" r="1.2" fill="#5f8f4a"/>
      <circle cx="43" cy="23" r="1.4" fill="#5f8f4a"/>
      <circle cx="42" cy="41" r="1.5" fill="#5f8f4a"/>
      <circle cx="48" cy="38" r="1.2" fill="#5f8f4a"/>
      <circle cx="36" cy="44" r="1.3" fill="#5f8f4a"/>
    `;
  } else {
    // Veggie default (#5f8f4a)
    foodShapes = `
      <circle cx="26" cy="26" r="7" fill="#5f8f4a"/>
      <circle cx="33" cy="23" r="6" fill="#4d773c"/>
      <circle cx="45" cy="27" r="7.5" fill="#5f8f4a"/>
      <circle cx="28" cy="42" r="8" fill="#4d773c"/>
      <circle cx="42" cy="41" r="8" fill="#5f8f4a"/>
      <ellipse cx="36" cy="34" rx="7" ry="4" transform="rotate(-25 36 34)" fill="#d87b32"/>
      <ellipse cx="48" cy="46" rx="5" ry="3" transform="rotate(30 48 46)" fill="#d87b32"/>
    `;
  }

  return `
    <svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="trayShadow" x="2" y="4" width="68" height="64" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#212e34" flood-opacity="0.12"/>
        </filter>
      </defs>
      <rect width="72" height="72" rx="8" fill="#f4f0ea"/>
      <rect x="6" y="8" width="60" height="56" rx="8" fill="#ffffff" stroke="#d5d0ca" stroke-width="1.5" filter="url(#trayShadow)"/>
      <rect x="10" y="12" width="52" height="48" rx="6" fill="#fcfbf9" stroke="#e8e4dc" stroke-width="1"/>
      <g>
        ${foodShapes}
      </g>
    </svg>
  `;
}

