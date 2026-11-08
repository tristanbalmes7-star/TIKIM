/**
 * TIKIM Revision 11: Unified Booking Engine (studio.js)
 * Single booking flow serving "event" (6 steps), "food" (4 steps), and "trays" (3 steps).
 * Zero emojis, pure pricing, and robust data error boundaries.
 */

import {
  computeQuote,
  formatPeso,
  getPricingConfig,
  getPackageAddOns,
  computeDownpaymentAndBalance,
  setPricingConfig
} from '../pricing.js';
import { TikimCalendar } from '../calendar.js';
import { TikimFloorPlanner } from '../floorplan.js';
import { mockApi } from '../mockApi.js';
import { showToast, checkActiveQuoteAndHold } from '../layout.js';
import { draftStore, showConfirmDialog } from '../draftStore.js';
import { renderLayoutPreviewSvg, generateSafeThumbnail } from '../layoutPreview.js';
import { renderTraySvg } from './food-orders.js';
import { openPolicyModal } from '../policyHelper.js';

let pricingConfig = null;
let packagesData = [];
let menuData = [];
let addonsData = [];
let traysData = [];
let trayCategoriesData = [];

// Trays persistence helper (single source of truth in tikim.trays)
function getStoredTrays() {
  try {
    const raw = localStorage.getItem('tikim.trays') || localStorage.getItem('tikim.trayCart');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function setStoredTrays(trays) {
  try {
    localStorage.setItem('tikim.trays', JSON.stringify(trays));
    localStorage.setItem('tikim.trayCart', JSON.stringify(trays));
  } catch (e) {}
  window.dispatchEvent(new CustomEvent('tikim:trays-updated'));
}

// Studio state machine
let studioState = {
  type: 'event', // 'event' | 'food' | 'trays'
  packageId: null, // 'wedding', 'party', etc.
  level: 1, // 1 | 2 | 3
  pax: 100,
  date: '',
  venue: '',
  slotPicks: {}, // { [slotId]: dishId }
  selectedDishes: [], // strings of dish names
  extraDishes: [], // [{ name, category, pricePerHead }]
  specialDishes: [], // [{ name, category }]
  includedRice: 'Java rice',
  includedDrink: 'Iced tea',
  includedDessert: 'Fruit salad',
  addOns: [], // [{ id, label, quantity, price }]
  skipped: [],
  stageText: { name: '', character: '' },
  layoutId: null,
  floorPlan: null,
  layoutThumbnail: null,
  layout: null,
  layoutStatus: 'unconfirmed', // 'confirmed' | 'unconfirmed' | 'skipped'
  trays: [], // [{ id, name, category, price, qty }]
  details: {
    name: '',
    mobile: '',
    contactMethod: 'SMS', // 'SMS' | 'Messenger'
    messengerName: '',
    venue: '',
    time: '06:30 PM',
    fulfillment: 'Delivery',
    notes: ''
  }
};

let currentStepIndex = 1; // 1-indexed relative to active type
let stepSequence = []; // dynamically computed array of step IDs
let calendarInstance = null;
let floorPlannerInstance = null;

// Multi-category segmented toggle state for menu slots: slotIndex -> active category string
const slotActiveCategory = {};

// Centralized dataStore with document.baseURI path resolution, caching, and schema validation
export const dataStore = {
  cache: {},
  async load(path, validator = null) {
    if (this.cache[path]) return this.cache[path];
    const fullUrl = new URL(path, document.baseURI).href;
    let res;
    try {
      res = await fetch(fullUrl);
    } catch (networkErr) {
      console.error(`[dataStore] Network failure loading ${path} from ${fullUrl}:`, networkErr);
      throw new Error(`Network failure loading ${path}`);
    }
    if (!res.ok) {
      console.error(`[dataStore] HTTP ${res.status} loading ${path} from ${fullUrl}`);
      throw new Error(`HTTP ${res.status} loading ${path}`);
    }
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error(`[dataStore] Invalid JSON in ${path}:`, parseErr);
      throw new Error(`Invalid JSON in ${path}`);
    }
    if (validator && typeof validator === 'function') {
      const isValid = validator(data);
      if (!isValid) {
        console.error(`[dataStore] Schema validation failed for ${path}`, data);
        throw new Error(`Invalid data schema in ${path}`);
      }
    }
    this.cache[path] = data;
    return data;
  },
  invalidate(path = null) {
    if (path) delete this.cache[path];
    else this.cache = {};
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initStudio());
} else {
  initStudio();
}

async function initStudio() {
  if (!sessionStorage.getItem('bookingOrigin')) {
    let origin = 'index.html';
    if (document.referrer) {
      try {
        const refUrl = new URL(document.referrer, window.location.origin);
        if (refUrl.origin === window.location.origin) {
          origin = refUrl.pathname.replace(/^\//, '') || 'index.html';
        }
      } catch (e) {}
    }
    sessionStorage.setItem('bookingOrigin', origin);
  }

  const errBox = document.getElementById('menuErrorContainer');
  if (errBox) errBox.style.display = 'none';

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
  const pricingRules = data.pricing || {};

  // Map event packages from the database.
  const eventPackages = (data.eventPackages || []).map(pkg => ({
    ...pkg,
    id: pkg.code,
    price: Number(pkg.base_price),
    basePax: Number(pkg.base_guests),
    extraPerHead: Number(pkg.extra_guest_price),
    priceStatus: pkg.price_status
  }));

  // Map food packages into the existing pricing structure.
  const levels = (data.foodPackages || []).map(pkg => ({
    level: Number(pkg.level),
    name: pkg.name,
    perHead: Number(pkg.rate_per_guest),
    dishes: Number(pkg.dish_count),
    slots: pkg.slot_rules
  }));

  // Preserve existing add-on metadata while using database prices.
  const oldAddOns = pricingRules.addOns || [];

  const addOns = (data.addOns || []).map(addon => {
    const metadata = oldAddOns.find(item => item.id === addon.code) || {};

    return {
      ...metadata,
      id: addon.code,
      label: addon.label,
      type: addon.price_type,
      price: addon.unit_price === null ? null : Number(addon.unit_price),
      priceStatus: addon.price_status,
      occasions: addon.occasions || metadata.occasions || []
    };
  });

  // Build the pricing configuration used by Studio calculations.
  pricingConfig = {
    ...pricingRules,
    eventPackages,
    levels,
    addOns
  };

  setPricingConfig(pricingConfig);

  // Store catalog data for the existing Studio interface.
  packagesData = eventPackages;

  menuData = (data.dishes || []).map(dish => ({
    ...dish,
    id: dish.code
  }));

  addonsData = addOns;

  trayCategoriesData = data.trayCategories || [];

  traysData = (data.trays || []).map(tray => ({
    ...tray,
    id: tray.code,
    slug: tray.code.replace(/^tray-/, ''),
    price: Number(tray.price)
  }));

    window.__studio = {
      get studioState() { return studioState; },
      set studioState(v) { studioState = v; },
      get currentStepIndex() { return currentStepIndex; },
      get floorPlannerInstance() { return floorPlannerInstance; },
      goToStep,
      forceGoToStep: (idx) => {
        currentStepIndex = idx;
        renderActiveStep();
        renderTabTracker();
        recalculateQuote();
      },
      getStepInfo,
      getSlotDefinitions,
      toggleSlotDish,
      isStepValid,
      computeStepSequence,
      getStoredTrays,
      setStoredTrays,
      recalculateQuote,
      updateValidationUI,
      renderActiveStep,
      renderFloorplanStep
    };

    // Test harness bridge for automated verification.
    Object.defineProperty(window, 'studioState', {
      get() { return studioState; },
      set(v) { studioState = v; },
      configurable: true
    });
    Object.defineProperty(window, 'menuData', {
      get() { return menuData; },
      set(v) { menuData = v; },
      configurable: true
    });
    Object.defineProperty(window, 'packagesData', {
      get() { return packagesData; },
      set(v) { packagesData = v; },
      configurable: true
    });
    window.goToStep = goToStep;
    window.getSlotDefinitions = getSlotDefinitions;
    window.toggleSlotDish = toggleSlotDish;
    window.isStepValid = isStepValid;
    window.computeStepSequence = computeStepSequence;
    window.getStoredTrays = getStoredTrays;
    window.setStoredTrays = setStoredTrays;

    await loadDraftAndParams();
    bindGlobalEvents();
    renderActiveStep();
    recalculateQuote();

    // Internal reset handler triggered by draftStore.reset()
    const handleStudioReset = () => {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', 'studio.html');
      }
      startScreenCurrent = 1;
      startScreenType = 'event';
      startScreenChoice = { type: 'event', packageId: 'wedding', level: 1 };
      studioState = {
        type: null,
        packageId: null,
        level: 1,
        pax: 0,
        date: '',
        venue: '',
        selectedDishes: [],
        extraDishes: [],
        specialDishes: [],
        includedRice: 'Java rice',
        includedDrink: 'Iced tea',
        includedDessert: 'Fruit salad',
        addOns: [],
        skipped: [],
        stageText: { name: '', character: '' },
        layoutId: null,
        floorPlan: null,
        layoutThumbnail: null,
        trays: [],
        details: {
          name: '',
          mobile: '',
          contactMethod: 'SMS',
          messengerName: '',
          venue: '',
          time: '06:30 PM',
          fulfillment: 'Delivery',
          notes: ''
        }
      };
      currentStepIndex = 1;
      localStorage.removeItem('tikim.draftStep');
      localStorage.removeItem('tikim.trays');
      localStorage.removeItem('tikim.trayCart');
      renderActiveStep();
      recalculateQuote();
      renderTabTracker();
      updateValidationUI();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    draftStore.subscribe((draft) => {
      if (!draft || Object.keys(draft).length === 0) {
        handleStudioReset();
      }
    });
    window.addEventListener('tikim:draft-reset', handleStudioReset);
  } catch (err) {
    console.error('Failed to initialize booking studio:', err);
    if (errBox) errBox.style.display = 'block';
  }
}

function showReturnBookingModal(draft, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('returnBookingModal');
    const summaryEl = document.getElementById('returnBookingSummary');
    const diffPkgEl = document.getElementById('returnBookingDiffPkg');
    const startNewBtn = document.getElementById('btnReturnStartNew');
    const continueBtn = document.getElementById('btnReturnContinue');
    const pkgNameEl = document.getElementById('returnBookingPkgName');
    const stepInfoEl = document.getElementById('returnBookingStepInfo');
    const priceSoFarEl = document.getElementById('returnBookingPriceSoFar');

    if (!modal || !startNewBtn || !continueBtn) {
      resolve('continue');
      return;
    }

    let pkgName = 'Event Package';
    if (draft.type === 'event') {
      const p = packagesData.find(pkg => pkg.id === draft.packageId);
      pkgName = p ? p.name : 'Wedding Package';
    } else if (draft.type === 'food') {
      pkgName = `Food Package ${draft.level || 1}`;
    } else if (draft.type === 'trays') {
      pkgName = 'Food Trays';
    }

    let tempSeq = [];
    if (draft.type === 'food') {
      tempSeq = ['stepPackage', 'stepDate', 'stepMenu', 'stepDetails', 'stepReview'];
    } else if (draft.type === 'trays') {
      tempSeq = ['stepPackage', 'stepTrays', 'stepDetails', 'stepReview'];
    } else {
      tempSeq = ['stepPackage', 'stepDate', 'stepMenu', 'stepExtras', 'stepFloorplan', 'stepDetails', 'stepReview'];
    }
    const savedStep = Number(draft.step) || 3;
    const totalSteps = tempSeq.length;
    const stepNames = {
      stepPackage: 'Package',
      stepDate: 'Date and guests',
      stepMenu: 'Menu',
      stepExtras: 'Extras',
      stepFloorplan: 'Floor plan',
      stepTrays: 'Trays',
      stepDetails: 'Details',
      stepReview: 'Review'
    };
    const savedStepId = tempSeq[savedStep - 1] || 'stepMenu';
    const stepName = stepNames[savedStepId] || 'Menu';

    const quote = computeQuote({
      type: draft.type,
      eventType: draft.packageId || 'party',
      packageId: draft.packageId,
      pax: draft.pax || (draft.type === 'event' ? 100 : 75),
      level: draft.level || 1,
      dishes: draft.dishes || draft.menu || [],
      extraDishes: draft.extraDishes || [],
      specialDishes: draft.specialDishes || [],
      addOns: draft.addOns || draft.addons || [],
      trays: draft.trays || []
    }, pricingConfig);

    if (summaryEl) {
      summaryEl.textContent = `${pkgName}, step ${savedStep} of ${totalSteps} (${stepName}), ${formatPeso(quote.total)} so far.`;
    }
    if (pkgNameEl) pkgNameEl.textContent = pkgName;
    if (stepInfoEl) stepInfoEl.textContent = `Step ${savedStep} of ${totalSteps}: ${stepName}`;
    if (priceSoFarEl) priceSoFarEl.textContent = `${formatPeso(quote.total)} so far`;

    if (options.diffPackageName) {
      if (diffPkgEl) {
        diffPkgEl.style.display = 'block';
        diffPkgEl.textContent = `You were about to book the ${options.diffPackageName}.`;
      }
      continueBtn.textContent = 'Return to my booking';
      startNewBtn.textContent = `Start new with ${options.diffPackageName}`;
    } else {
      if (diffPkgEl) {
        diffPkgEl.style.display = 'none';
        diffPkgEl.textContent = '';
      }
      continueBtn.textContent = 'Yes, continue';
      startNewBtn.textContent = 'No, start new';
    }

    document.documentElement.style.scrollbarGutter = 'stable';
    document.body.style.overflow = 'hidden';
    modal.style.display = 'grid';
    continueBtn.focus({ preventScroll: true });

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = [continueBtn, startNewBtn];
        if (e.shiftKey && document.activeElement === focusable[0]) {
          e.preventDefault();
          focusable[1].focus({ preventScroll: true });
        } else if (!e.shiftKey && document.activeElement === focusable[1]) {
          e.preventDefault();
          focusable[0].focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener('keydown', handleKeydown);

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeydown);
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };

    continueBtn.onclick = () => {
      cleanup();
      resolve('continue');
    };

    startNewBtn.onclick = () => {
      cleanup();
      resolve('startNew');
    };
  });
}

async function loadDraftAndParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('type');
  const pkgParam = urlParams.get('package') || urlParams.get('event') || urlParams.get('pkg');
  const levelParam = urlParams.get('level');
  const dateParam = urlParams.get('date');

  let draft = draftStore.getDraft();
  const ttlDays = (pricingConfig && pricingConfig.draftTtlDays) || 14;
  if (draft && draft.updatedAt) {
    const ageMs = Date.now() - new Date(draft.updatedAt).getTime();
    if (ageMs > ttlDays * 24 * 60 * 60 * 1000) {
      await draftStore.reset();
      draft = {};
    }
  }

  const urlPkgId = pkgParam ? pkgParam.toLowerCase() : null;
  const urlLevel = levelParam ? (Number(levelParam) || 1) : null;
  const isTraysRoute = typeParam === 'trays';
  const isFoodRoute = typeParam === 'food' || (urlPkgId && urlPkgId.startsWith('food'));

  // Route-aware trays sync (Part 3: booking of another type clears trays)
  if (isTraysRoute) {
    studioState.trays = getStoredTrays();
  } else {
    localStorage.removeItem('tikim.trays');
    localStorage.removeItem('tikim.trayCart');
    studioState.trays = [];
  }

  const hasDraftAtStep3 = Boolean(
    draft &&
    draft.type &&
    (Number(draft.furthestStep) >= 3 || Number(draft.step) >= 3)
  );

  if (hasDraftAtStep3) {
    let diffPackageName = null;
    if (isFoodRoute) {
      const targetLvl = urlLevel || (urlPkgId && Number(urlPkgId.replace('food', ''))) || 1;
      if (draft.type !== 'food' || Number(draft.level) !== targetLvl) {
        diffPackageName = `Food Package ${targetLvl}`;
      }
    } else if (urlPkgId && !urlPkgId.startsWith('food')) {
      if (draft.packageId !== urlPkgId) {
        const p = packagesData.find(pkg => pkg.id === urlPkgId);
        diffPackageName = p ? p.name : 'New Package';
      }
    } else if (isTraysRoute && draft.type !== 'trays') {
      diffPackageName = 'Food Trays';
    }

    const decision = await showReturnBookingModal(draft, { diffPackageName });

    if (decision === 'continue') {
      studioState.type = draft.type;
      studioState.packageId = draft.packageId;
      studioState.level = Number(draft.level) || 1;
      studioState.pax = Number(draft.pax) || (draft.type === 'event' ? 100 : 75);
      studioState.date = draft.date || '';
      studioState.venue = draft.venue || '';
      studioState.slotPicks = (draft.slotPicks && typeof draft.slotPicks === 'object') ? { ...draft.slotPicks } : {};
      studioState.selectedDishes = Array.isArray(draft.dishes) ? [...draft.dishes] : (Array.isArray(draft.menu) ? [...draft.menu] : []);
      if (Object.keys(studioState.slotPicks).length > 0) {
        syncSelectedDishesFromSlots();
      } else if (studioState.selectedDishes.length > 0) {
        syncSlotsFromDishes();
      }
      studioState.extraDishes = Array.isArray(draft.extraDishes) ? [...draft.extraDishes] : [];
      studioState.specialDishes = Array.isArray(draft.specialDishes) ? [...draft.specialDishes] : [];
      studioState.addOns = Array.isArray(draft.addOns) ? [...draft.addOns] : (Array.isArray(draft.addons) ? [...draft.addons] : []);
      studioState.skipped = Array.isArray(draft.skipped) ? [...draft.skipped] : [];
      studioState.stageText = draft.stageText ? { ...draft.stageText } : { name: '', character: '' };
      studioState.layoutId = draft.layoutId || null;
      studioState.floorPlan = draft.floorPlan || null;
      studioState.layoutThumbnail = draft.layoutThumbnail || null;
      if (draft.type === 'trays') {
        const stored = getStoredTrays();
        studioState.trays = (stored && stored.length > 0) ? stored : (Array.isArray(draft.trays) ? [...draft.trays] : []);
      } else {
        studioState.trays = [];
        localStorage.removeItem('tikim.trays');
        localStorage.removeItem('tikim.trayCart');
      }
      studioState.details = draft.details ? { ...studioState.details, ...draft.details } : { ...studioState.details };
      studioState.furthestStep = Number(draft.furthestStep) || Number(draft.step) || 3;

      stepSequence = computeStepSequence();

      let holdExpired = false;
      if (studioState.date && studioState.type !== 'trays') {
        const activeHold = await mockApi.getActiveHold();
        if (!activeHold || activeHold.date !== studioState.date) {
          holdExpired = true;
          studioState.date = '';
          if (studioState.details) studioState.details.date = '';
          saveCurrentDraft(true);
        }
      }

      if (holdExpired) {
        currentStepIndex = 2;
        setTimeout(() => {
          showToast('Your date hold ran out. Please pick your date again.', 'warning');
        }, 300);
      } else {
        let savedStep = Number(draft.step) || 3;
        let targetStep = 2;
        for (let i = 1; i <= savedStep; i++) {
          const stepId = stepSequence[i - 1];
          if (i < savedStep) {
            if (!isStepValid(stepId)) {
              targetStep = i;
              break;
            }
          } else {
            targetStep = i;
          }
        }
        currentStepIndex = Math.min(Math.max(targetStep, 2), stepSequence.length);
      }
      return;
    } else {
      await draftStore.reset();
      draft = {};
      studioState.furthestStep = 0;
      studioState.slotPicks = {};
      studioState.selectedDishes = [];
      studioState.extraDishes = [];
      studioState.addOns = [];
      if (isTraysRoute) {
        studioState.type = 'trays';
        studioState.packageId = null;
        studioState.level = 1;
        studioState.trays = getStoredTrays();
        currentStepIndex = 2;
        return;
      } else if (isFoodRoute) {
        studioState.type = 'food';
        studioState.packageId = null;
        studioState.level = urlLevel || (urlPkgId && Number(urlPkgId.replace('food', ''))) || 1;
        studioState.pax = 0;
        studioState.date = '';
        studioState.trays = [];
        localStorage.removeItem('tikim.trays');
        localStorage.removeItem('tikim.trayCart');
        currentStepIndex = 2;
        return;
      } else if (urlPkgId) {
        studioState.type = 'event';
        studioState.packageId = urlPkgId;
        studioState.level = 1;
        studioState.pax = 0;
        studioState.date = '';
        studioState.trays = [];
        localStorage.removeItem('tikim.trays');
        localStorage.removeItem('tikim.trayCart');
        currentStepIndex = 2;
        return;
      } else {
        studioState.type = 'event';
        studioState.packageId = null;
        studioState.pax = 0;
        studioState.date = '';
        studioState.trays = [];
        localStorage.removeItem('tikim.trays');
        localStorage.removeItem('tikim.trayCart');
        currentStepIndex = 1;
        startScreenCurrent = 1;
        return;
      }
    }
  }

  // No draft at Step 3
  if (isTraysRoute) {
    studioState.type = 'trays';
    studioState.packageId = null;
    studioState.level = 1;
    studioState.trays = getStoredTrays();
    currentStepIndex = 2;
  } else if (isFoodRoute) {
    studioState.type = 'food';
    studioState.packageId = null;
    studioState.level = urlLevel || (urlPkgId && Number(urlPkgId.replace('food', ''))) || 1;
    studioState.pax = 0;
    studioState.date = '';
    studioState.trays = [];
    localStorage.removeItem('tikim.trays');
    localStorage.removeItem('tikim.trayCart');
    currentStepIndex = 2;
  } else if (urlPkgId) {
    studioState.type = 'event';
    studioState.packageId = urlPkgId;
    studioState.level = 1;
    studioState.pax = 0;
    studioState.date = '';
    studioState.trays = [];
    localStorage.removeItem('tikim.trays');
    localStorage.removeItem('tikim.trayCart');
    currentStepIndex = 2;
  } else {
    studioState.type = 'event';
    studioState.packageId = null;
    studioState.pax = 0;
    studioState.date = '';
    studioState.trays = [];
    localStorage.removeItem('tikim.trays');
    localStorage.removeItem('tikim.trayCart');
    currentStepIndex = 1;
    startScreenCurrent = 1;
  }
  if (dateParam) {
    studioState.date = dateParam;
    studioState.details.date = dateParam;
  }
}

function computeStepSequence() {
  if (studioState.type === 'food') {
    return ['stepPackage', 'stepDate', 'stepMenu', 'stepDetails', 'stepReview'];
  }
  if (studioState.type === 'trays') {
    return ['stepPackage', 'stepTrays', 'stepDetails', 'stepReview'];
  }
  return ['stepPackage', 'stepDate', 'stepMenu', 'stepExtras', 'stepFloorplan', 'stepDetails', 'stepReview'];
}

function isStepValid(stepId) {
  if (stepId === 'stepPackage') {
    return Boolean(studioState.type && (studioState.packageId || studioState.level || studioState.type === 'trays'));
  }
  if (stepId === 'stepDate') {
    const hasDate = Boolean(studioState.date && studioState.date.trim());
    const hasPax = studioState.type === 'event'
      ? (Number(studioState.pax) || 0) >= 100
      : (Number(studioState.pax) || 0) >= 1;
    return hasDate && hasPax;
  }
  if (stepId === 'stepMenu') {
    const slots = getSlotDefinitions(studioState.level || 1);
    for (const slot of slots) {
      if (!studioState.slotPicks || !studioState.slotPicks[slot.id]) return false;
    }
    const hasRiceAndDrink = Boolean(studioState.includedRice && studioState.includedDrink);
    if (studioState.type === 'event') {
      return hasRiceAndDrink && Boolean(studioState.includedDessert);
    }
    return hasRiceAndDrink;
  }
  if (stepId === 'stepExtras') return true;
  if (stepId === 'stepFloorplan') {
    const items = floorPlannerInstance?.items || studioState.floorPlan?.units || [];
    if (items.length > 0 && studioState.layoutStatus !== 'confirmed' && studioState.layoutStatus !== 'skipped') {
      return false;
    }
    return true;
  }
  if (stepId === 'stepTrays') {
    const trays = getStoredTrays();
    return Array.isArray(trays) && trays.length > 0 &&
      trays.reduce((sum, t) => sum + (t.qty || t.quantity || 0), 0) > 0;
  }
  if (stepId === 'stepDetails') {
    const nameVal = ((document.getElementById('custName')?.value || studioState.details.name) ?? '').trim();
    const mobileVal = ((document.getElementById('custMobile')?.value || studioState.details.mobile) ?? '').trim();
    const contactMethod = document.querySelector('input[name="contactMethod"]:checked')?.value || studioState.details.contactMethod || 'SMS';
    const messengerVal = ((document.getElementById('custMessengerName')?.value || studioState.details.messengerName) ?? '').trim();
    const venueVal = ((document.getElementById('custVenueAddress')?.value || studioState.details.venue || studioState.venue) ?? '').trim();
    const fulfillment = document.getElementById('fulfillmentSelect')?.value || studioState.details.fulfillment || 'Delivery';
    const trayDate = ((document.getElementById('trayDeliveryDate')?.value || studioState.date || studioState.details.date) ?? '').trim();

    if (!nameVal) return false;
    if (!mobileVal || !/^09\d{9}$/.test(mobileVal.replace(/\D/g, ''))) return false;
    if (contactMethod === 'Messenger' && !messengerVal) return false;

    if (studioState.type === 'trays') {
      if (!trayDate) return false;
      if (fulfillment === 'Delivery' && !venueVal) return false;
    } else {
      if (!venueVal) return false;
    }
    return true;
  }
  if (stepId === 'stepReview') {
    const chks = document.querySelectorAll('#agreementChecklistContainer input[type="checkbox"]');
    if (chks.length === 0) return true;
    for (const chk of chks) {
      if (!chk.checked) return false;
    }
    return true;
  }
  return true;
}

function showStepErrors(stepId) {
  document.querySelectorAll('.field-inline-error').forEach(el => el.remove());
  document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));

  if (stepId === 'stepDate') {
    if (!studioState.date) {
      showToast('Please select an available celebration date on the calendar.', 'warning');
      const cal = document.getElementById('studioCalendarContainer');
      if (cal) cal.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const minPax = studioState.type === 'event' ? 100 : 30;
    if (studioState.pax < minPax) {
      showToast(`Guest count must be at least ${minPax}.`, 'warning');
      document.getElementById('paxNumberInput')?.focus({ preventScroll: true });
      return;
    }
  }

  if (stepId === 'stepMenu') {
    const slots = getSlotDefinitions(studioState.level || 1);
    const missing = [];
    slots.forEach(slot => {
      if (!findAssignedDishForSlot(slot)) {
        missing.push(slot.title.replace(/,\s*choose\s*\d+/i, ''));
      }
    });
    if (missing.length > 0) {
      const msg = `Please choose: ${missing.join(', ')}`;
      const warning = document.getElementById('slotsMissingWarning');
      const warningText = document.getElementById('slotsMissingText');
      const valLine = document.getElementById('wizardValidationLine');
      if (warning) warning.style.display = 'flex';
      if (warningText) warningText.textContent = msg;
      if (valLine) {
        valLine.textContent = msg;
        valLine.style.display = 'inline';
      }
      showToast(msg, 'warning');
      const unfulfilled = document.querySelectorAll('.slot-stone-panel:not(.fulfilled)');
      unfulfilled.forEach(el => el.classList.add('is-invalid-slot'));
      if (unfulfilled.length > 0) {
        unfulfilled[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        unfulfilled[0].querySelector('.dish-tile-card')?.focus({ preventScroll: true });
      }
      const announcer = document.getElementById('studioAriaAnnouncer');
      if (announcer) {
        announcer.textContent = msg;
      }
      return;
    }
  }

  if (stepId === 'stepFloorplan') {
    const noteEl = document.getElementById('floorplanConfirmNote');
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.textContent = 'Please confirm your layout, or skip the floor plan';
    }
    showToast('Please confirm your layout, or skip the floor plan', 'warning');
    return;
  }

  if (stepId === 'stepTrays') {
    if (!studioState.trays || studioState.trays.length === 0) {
      showToast('Please select at least 1 food tray to proceed.', 'warning');
      return;
    }
  }

  if (stepId === 'stepDetails') {
    const nameEl = document.getElementById('custName');
    const mobileEl = document.getElementById('custMobile');
    const contactMethod = document.querySelector('input[name="contactMethod"]:checked')?.value || 'SMS';
    const messengerEl = document.getElementById('custMessengerName');
    const venueEl = document.getElementById('custVenueAddress');
    const fulfillment = document.getElementById('fulfillmentSelect')?.value || 'Delivery';
    const trayDateEl = document.getElementById('trayDeliveryDate');

    function attachInlineError(inputEl, msg) {
      if (!inputEl) return;
      inputEl.classList.add('is-invalid');
      const err = document.createElement('div');
      err.className = 'field-inline-error';
      err.textContent = msg;
      inputEl.parentNode.appendChild(err);
    }

    let firstInvalid = null;

    if (studioState.type === 'trays' && trayDateEl && !trayDateEl.value.trim()) {
      attachInlineError(trayDateEl, 'Please select a delivery/pickup date.');
      if (!firstInvalid) firstInvalid = trayDateEl;
    }

    if (!nameEl?.value.trim()) {
      attachInlineError(nameEl, 'Full name is required.');
      if (!firstInvalid) firstInvalid = nameEl;
    }

    const mobileVal = mobileEl?.value.trim() || '';
    if (!mobileVal || !/^09\d{9}$/.test(mobileVal.replace(/\D/g, ''))) {
      attachInlineError(mobileEl, 'A valid 11-digit Philippine mobile number starting with 09 is required.');
      if (!firstInvalid) firstInvalid = mobileEl;
    }

    if (contactMethod === 'Messenger' && !messengerEl?.value.trim()) {
      attachInlineError(messengerEl, 'Messenger account name is required when Messenger is selected.');
      if (!firstInvalid) firstInvalid = messengerEl;
    }

    if (studioState.type === 'trays') {
      if (fulfillment === 'Delivery' && !venueEl?.value.trim()) {
        attachInlineError(venueEl, 'Delivery address is required for tray delivery.');
        if (!firstInvalid) firstInvalid = venueEl;
      }
    } else {
      if (!venueEl?.value.trim()) {
        attachInlineError(venueEl, 'Event venue name or address is required.');
        if (!firstInvalid) firstInvalid = venueEl;
      }
    }

    if (firstInvalid) {
      showToast('Please complete all required fields.', 'warning');
      firstInvalid.focus({ preventScroll: true });
    }
  }

  if (stepId === 'stepReview') {
    showToast('Please check all agreement conditions to confirm your booking.', 'warning');
  }
}

function updateValidationUI() {
  const currentStepId = stepSequence[currentStepIndex - 1];
  const isValid = isStepValid(currentStepId);

  // Next is ALWAYS clickable per Revision 13 Part 2.3
  const nextBtn = document.getElementById('btnWizardNext');
  if (nextBtn) {
    nextBtn.removeAttribute('disabled');
    nextBtn.disabled = false;
    nextBtn.style.pointerEvents = 'auto';
  }

  const reserveBtn = document.getElementById('btnReserveDateHold');
  if (reserveBtn && currentStepId === 'stepReview') {
    reserveBtn.disabled = !isValid;
  }

  renderTabTracker();
}

function announceStep(index, total, title) {
  const announcer = document.getElementById('studioAriaAnnouncer');
  if (announcer) {
    announcer.textContent = `Step ${index} of ${total}: ${title}`;
  }
}

function formatReadableDate(d) {
  if (!d) return '';
  const parts = String(d).split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (m >= 1 && m <= 12) {
      return `${months[m - 1]} ${day}, ${y}`;
    }
  }
  return d;
}

function getStepInfo(stepId, num) {
  switch (stepId) {
    case 'stepPackage': {
      let val = 'Event Package';
      if (studioState.type === 'event') {
        const pkg = packagesData.find(p => p.id === studioState.packageId);
        val = pkg ? pkg.name : 'Wedding Package';
      } else if (studioState.type === 'food') {
        val = `Food Package ${studioState.level || 1}`;
      } else if (studioState.type === 'trays') {
        val = 'Food Trays';
      }
      return {
        name: studioState.type === 'trays' ? 'Choose' : 'Package',
        value: val
      };
    }
    case 'stepDate': {
      let dateStr = '';
      if (studioState.date) {
        dateStr = formatReadableDate(studioState.date);
      }
      const paxVal = Number(studioState.pax) || (studioState.type === 'event' ? 100 : 75);
      const val = dateStr ? `${dateStr} · ${paxVal} guests` : `${paxVal} guests`;
      return {
        name: 'Date and guests',
        value: val
      };
    }
    case 'stepMenu': {
      const slots = getSlotDefinitions(studioState.level || 1);
      const totalDishes = slots.length;
      let count = 0;
      if (studioState.slotPicks) {
        for (const slot of slots) {
          if (studioState.slotPicks[slot.id]) count++;
        }
      }
      return {
        name: 'Menu',
        value: `${count} of ${totalDishes} dishes`
      };
    }
    case 'stepExtras': {
      const count = Array.isArray(studioState.addOns) ? studioState.addOns.length : 0;
      return {
        name: 'Extras',
        value: `${count} add-on${count === 1 ? '' : 's'}`
      };
    }
    case 'stepFloorplan': {
      const val = studioState.layoutStatus === 'confirmed'
        ? 'Layout confirmed'
        : (studioState.layoutStatus === 'skipped' ? 'Skipped' : 'Optional');
      return {
        name: 'Floor plan',
        value: val
      };
    }
    case 'stepTrays': {
      const trays = getStoredTrays();
      const count = trays.reduce((sum, t) => sum + (Number(t.qty) || Number(t.quantity) || 0), 0);
      return {
        name: 'Trays',
        value: `${count} tray${count === 1 ? '' : 's'}`
      };
    }
    case 'stepDetails': {
      return {
        name: 'Details',
        value: 'Details complete'
      };
    }
    case 'stepReview': {
      return {
        name: 'Review',
        value: 'Ready to reserve'
      };
    }
    default:
      return { name: 'Step', value: '' };
  }
}

function renderTabTracker(options = {}) {
  const trackerBand = document.getElementById('studioTabTracker');
  const scrollContainer = document.getElementById('trackerTabsScroll') || document.getElementById('trackerTabsList');
  const counterEl = document.getElementById('trackerStepCounter');
  if (!trackerBand || !scrollContainer || !counterEl) return;

  const trackerH = trackerBand.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--tracker-band-h', `${trackerH}px`);

  stepSequence = computeStepSequence();
  const totalSteps = stepSequence.length;

  counterEl.textContent = `Step ${currentStepIndex} of ${totalSteps}`;

  let html = '';
  for (let i = 1; i <= currentStepIndex; i++) {
    const stepId = stepSequence[i - 1];
    const info = getStepInfo(stepId, i);
    const isCurrent = i === currentStepIndex;

    if (isCurrent) {
      html += `
        <div class="tracker-tab is-current" role="tab" aria-selected="true" aria-current="step" tabindex="0" data-step-index="${i}">
          <div class="tracker-tab-header">
            <span class="tracker-tab-badge">${i}</span>
            <span class="tracker-tab-title">${info.name}</span>
          </div>
          <div class="tracker-tab-value">${info.value || ''}</div>
        </div>
      `;
    } else {
      html += `
        <button type="button" class="tracker-tab is-completed" role="tab" aria-selected="false" data-step-index="${i}">
          <div class="tracker-tab-header">
            <span class="tracker-tab-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4fa49d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="tracker-tab-title">${info.name}</span>
          </div>
          <div class="tracker-tab-value">${info.value}</div>
        </button>
      `;
    }
  }

  scrollContainer.innerHTML = html;

  scrollContainer.querySelectorAll('.tracker-tab.is-completed').forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = Number(tab.getAttribute('data-step-index'));
      if (idx && idx < currentStepIndex) {
        goToStep(idx);
      }
    });
  });

  if (options.scrollTabIntoView) {
    const currTabEl = scrollContainer.querySelector('.tracker-tab.is-current');
    if (currTabEl) {
      const scrollLeft = currTabEl.offsetLeft - (scrollContainer.clientWidth / 2) + (currTabEl.offsetWidth / 2);
      scrollContainer.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }
}

function goToStep(index, pushHistory = true) {
  stepSequence = computeStepSequence();
  if (index < 1 || index > stepSequence.length) return;

  if (index > currentStepIndex) {
    for (let i = currentStepIndex - 1; i < index - 1; i++) {
      const stepId = stepSequence[i];
      if (!isStepValid(stepId)) {
        showStepErrors(stepId);
        return;
      }
    }
  }

  currentStepIndex = index;
  if (index === 1) {
    startScreenCurrent = 1;
  }

  if (pushHistory) {
    history.pushState({ stepIndex: currentStepIndex }, '', window.location.href);
  }

  if (currentStepIndex >= 3 && (!studioState.furthestStep || studioState.furthestStep < 3)) {
    studioState.furthestStep = currentStepIndex;
    saveCurrentDraft(true);
  } else {
    saveCurrentDraft(false);
  }

  renderActiveStep();
  recalculateQuote();
  updateValidationUI();

  const currentStepId = stepSequence[currentStepIndex - 1];
  const paneMap = {
    stepPackage: 'paneStep0',
    stepDate: 'paneDateGuests',
    stepMenu: 'paneMenu',
    stepExtras: 'paneExtras',
    stepFloorplan: 'paneFloorplan',
    stepTrays: 'paneTrays',
    stepDetails: 'paneDetails',
    stepReview: 'paneReview'
  };
  const activePane = document.getElementById(paneMap[currentStepId]);
  if (activePane) {
    activePane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const heading = activePane.querySelector('.pane-title') || activePane.querySelector('h1, h2, h3');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
      const stepTitle = heading.textContent.trim();
      announceStep(currentStepIndex, stepSequence.length, stepTitle);
    }
  }
}

function renderActiveStep() {
  renderTabTracker({ scrollTabIntoView: true });
  stepSequence = computeStepSequence();

  document.querySelectorAll('.wizard-step-pane').forEach(p => p.style.display = 'none');

  const currentStepId = stepSequence[currentStepIndex - 1];
  const paneMap = {
    stepPackage: 'paneStep0',
    stepDate: 'paneDateGuests',
    stepMenu: 'paneMenu',
    stepExtras: 'paneExtras',
    stepFloorplan: 'paneFloorplan',
    stepTrays: 'paneTrays',
    stepDetails: 'paneDetails',
    stepReview: 'paneReview'
  };

  const targetPaneId = paneMap[currentStepId] || 'paneStep0';
  const targetPane = document.getElementById(targetPaneId);
  if (targetPane) targetPane.style.display = 'block';

  if (currentStepId === 'stepPackage') renderStartReservationPane();
  if (currentStepId === 'stepDate') renderDateGuestsStep();
  if (currentStepId === 'stepMenu') renderMenuStep();
  if (currentStepId === 'stepExtras') renderExtrasStep();
  if (currentStepId === 'stepFloorplan') renderFloorplanStep();
  if (currentStepId === 'stepTrays') renderTraysStep();
  if (currentStepId === 'stepDetails') renderDetailsStep();
  if (currentStepId === 'stepReview') renderReviewStep();

  const sidebar = document.getElementById('liveQuoteSidebar');
  const mobileBar = document.getElementById('mobileQuoteBottomBar');
  const layoutContainer = document.getElementById('studioLayoutContainer');
  const isReview = currentStepId === 'stepReview';
  const isFloorplan = currentStepId === 'stepFloorplan';
  const isFirstStep = currentStepIndex === 1 || currentStepId === 'stepPackage';
  const showQuote = !isFirstStep && !isReview && !isFloorplan;

  if (sidebar) sidebar.style.display = showQuote ? '' : 'none';
  if (mobileBar) mobileBar.style.display = showQuote ? '' : 'none';

  if (layoutContainer) {
    if (isReview || isFloorplan) {
      layoutContainer.classList.add(isReview ? 'is-review-mode' : 'is-floorplan-mode');
      layoutContainer.classList.remove(isReview ? 'is-floorplan-mode' : 'is-review-mode');
      layoutContainer.classList.remove('has-quote-rail');
    } else if (showQuote) {
      layoutContainer.classList.remove('is-review-mode', 'is-floorplan-mode');
      layoutContainer.classList.add('has-quote-rail');
    } else {
      layoutContainer.classList.remove('is-review-mode', 'is-floorplan-mode');
      layoutContainer.classList.remove('has-quote-rail');
    }
  }

  updateFooterNav(true, currentStepIndex < stepSequence.length && currentStepId !== 'stepPackage');
  updateValidationUI();
}

function updateFooterNav(showPrev, showNext) {
  const prevBtn = document.getElementById('btnWizardPrev');
  const nextBtn = document.getElementById('btnWizardNext');
  if (prevBtn) {
    prevBtn.style.display = 'inline-flex';
    prevBtn.textContent = '\u2190 Back';
  }
  if (nextBtn) {
    if (currentStepIndex === stepSequence.length || currentStepIndex === 1) {
      nextBtn.style.display = 'none';
    } else {
      nextBtn.style.display = 'inline-flex';
      nextBtn.textContent = 'Next Step \u2192';
    }
  }
}

/* --------------------------------------------------------------------------
   Step 0: Two-Screen Reservation Chooser (Part 3)
   -------------------------------------------------------------------------- */
let startScreenCurrent = 1; // 1 | 2
let startScreenType = 'event'; // 'event' | 'food'
let startScreenChoice = { type: 'event', packageId: 'wedding', level: 1 };

function renderStartReservationPane() {
  const container = document.getElementById('studioChooserContainer');
  if (!container) return;

  // Sync with URL hash if on step 0
  if (!studioState.type) {
    if (window.location.hash === '#package') {
      startScreenCurrent = 2;
    } else {
      startScreenCurrent = 1;
    }
  }

  const s1 = document.getElementById('startScreen1');
  const s2 = document.getElementById('startScreen2');

  if (startScreenCurrent === 1) {
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    bindScreen1Cards();
  } else {
    if (s1) s1.style.display = 'none';
    if (s2) s2.style.display = 'block';
    renderScreen2();
  }
}

function switchStartScreen(screenNum, updateHash = true) {
  startScreenCurrent = screenNum;
  if (updateHash) {
    if (screenNum === 2) {
      if (window.location.hash !== '#package') {
        window.history.pushState(null, '', '#package');
      }
    } else {
      if (window.location.hash !== '#type') {
        window.history.pushState(null, '', '#type');
      }
    }
  }
  const s1 = document.getElementById('startScreen1');
  const s2 = document.getElementById('startScreen2');
  if (screenNum === 1) {
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';
    bindScreen1Cards();
  } else {
    if (s1) s1.style.display = 'none';
    if (s2) s2.style.display = 'block';
    renderScreen2();
  }
}

function bindScreen1Cards() {
  const cardEvent = document.getElementById('cardBookingEvent');
  const cardFood = document.getElementById('cardBookingFood');
  const cardTrays = document.getElementById('cardBookingTrays');

  if (cardEvent) {
    cardEvent.onclick = () => {
      startScreenType = 'event';
      studioState.type = 'event';
      studioState.pax = 0;
      studioState.date = '';
      studioState.trays = [];
      localStorage.removeItem('tikim.trays');
      localStorage.removeItem('tikim.trayCart');
      studioState.slotPicks = {};
      studioState.selectedDishes = [];
      studioState.extraDishes = [];
      studioState.addOns = [];
      if (!studioState.packageId) studioState.packageId = 'wedding';
      startScreenChoice = { type: 'event', packageId: studioState.packageId, level: 1 };
      switchStartScreen(2, true);
      renderTabTracker();
      recalculateQuote();
    };
  }

  if (cardFood) {
    cardFood.onclick = () => {
      startScreenType = 'food';
      studioState.type = 'food';
      studioState.pax = 0;
      studioState.date = '';
      studioState.trays = [];
      localStorage.removeItem('tikim.trays');
      localStorage.removeItem('tikim.trayCart');
      studioState.slotPicks = {};
      studioState.selectedDishes = [];
      studioState.extraDishes = [];
      studioState.addOns = [];
      startScreenChoice = { type: 'food', packageId: null, level: studioState.level || 1 };
      switchStartScreen(2, true);
      renderTabTracker();
      recalculateQuote();
    };
  }

  if (cardTrays) {
    cardTrays.onclick = () => {
      studioState.type = 'trays';
      studioState.packageId = null;
      studioState.level = 1;
      studioState.trays = getStoredTrays();
      currentStepIndex = 2;
      renderActiveStep();
      recalculateQuote();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
}

function renderScreen2() {
  const backBtn = document.getElementById('btnBackToType');
  const heading = document.getElementById('screen2Heading');
  const listEl = document.getElementById('screen2RowsList');
  const previewPanel = document.getElementById('previewPanelCard');

  if (backBtn) {
    backBtn.onclick = () => {
      switchStartScreen(1, true);
    };
  }

  if (heading) {
    heading.textContent = startScreenType === 'event'
      ? 'Pick your event package'
      : 'Pick your food package';
  }

  if (startScreenType === 'event') {
    renderEventRows(listEl, previewPanel);
  } else {
    renderFoodRows(listEl, previewPanel);
  }
}

function renderEventRows(listEl, previewPanel) {
  if (!listEl) return;

  const eventPackages = [
    { id: 'wedding', name: 'Wedding Package', price: 55000, est: false, paxLabel: '100 guests and up', extraRate: 280 },
    { id: 'party', name: 'Party Package', price: 55000, est: false, paxLabel: '100 guests and up', extraRate: 250 },
    { id: 'birthday', name: 'Birthday Package', price: 50000, est: true, paxLabel: '100 guests and up', extraRate: 250 },
    { id: 'corporate', name: 'Corporate Package', price: 41000, est: true, paxLabel: '100 guests and up', extraRate: 250 },
    { id: 'reunion', name: 'Reunion Package', price: 47000, est: true, paxLabel: '100 guests and up', extraRate: 250 },
    { id: 'other', name: 'Special Occasion Package', price: 46000, est: true, paxLabel: '100 guests and up', extraRate: 250 }
  ];

  const currentPkgId = (startScreenChoice && startScreenChoice.packageId) || 'wedding';

  listEl.innerHTML = eventPackages.map(pkg => {
    const isSelected = pkg.id === currentPkgId;
    return `
      <div class="screen2-row ${isSelected ? 'is-selected' : ''}"
           role="radio"
           aria-checked="${isSelected}"
           tabindex="${isSelected ? '0' : '-1'}"
           data-id="${pkg.id}">
        <div class="screen2-row-left">
          <div class="screen2-radio-circle" aria-hidden="true"></div>
          <div class="screen2-row-info">
            <span class="screen2-row-name">${pkg.name}</span>
            <span class="screen2-row-pax">${pkg.paxLabel}</span>
          </div>
        </div>
        <div class="screen2-row-price-wrap">
          <span class="screen2-row-price">&#8369;${pkg.price.toLocaleString()}</span>
          ${pkg.est ? '<span class="screen2-est-badge">est.</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  const rowEls = Array.from(listEl.querySelectorAll('.screen2-row'));

  const selectPkg = (pkgId) => {
    startScreenChoice = { type: 'event', packageId: pkgId, level: 1 };
    rowEls.forEach(r => {
      const match = r.dataset.id === pkgId;
      r.classList.toggle('is-selected', match);
      r.setAttribute('aria-checked', match ? 'true' : 'false');
      r.setAttribute('tabindex', match ? '0' : '-1');
    });
    renderEventPreview(pkgId, previewPanel);
    const chosen = eventPackages.find(p => p.id === pkgId);
    announceToLiveRegion(`Selected ${chosen ? chosen.name : 'Event Package'}`);
  };

  rowEls.forEach((row, idx) => {
    const pkgId = row.dataset.id;
    row.onclick = () => selectPkg(pkgId);
    row.onmouseenter = () => renderEventPreview(pkgId, previewPanel);
    row.onfocus = () => renderEventPreview(pkgId, previewPanel);
    row.onmouseleave = () => {
      const activeId = (startScreenChoice && startScreenChoice.packageId) || 'wedding';
      renderEventPreview(activeId, previewPanel);
    };

    row.onkeydown = (e) => {
      let targetIdx = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        targetIdx = (idx + 1) % rowEls.length;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        targetIdx = (idx - 1 + rowEls.length) % rowEls.length;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectPkg(pkgId);
        return;
      }
      if (targetIdx >= 0) {
        const targetRow = rowEls[targetIdx];
        const targetId = targetRow.dataset.id;
        selectPkg(targetId);
        targetRow.focus({ preventScroll: true });
      }
    };
  });

  renderEventPreview(currentPkgId, previewPanel);
}

function renderEventPreview(pkgId, panelEl) {
  if (!panelEl) return;

  const pkgObj = packagesData.find(p => p.id === pkgId) || packagesData[0];
  const name = pkgObj ? pkgObj.name : 'Wedding Package';
  const priceNum = pkgObj ? pkgObj.price : 55000;
  const extraRate = pkgId === 'wedding' ? 280 : 250;
  const inclusions = (pkgObj && Array.isArray(pkgObj.inclusions) && pkgObj.inclusions.length)
    ? pkgObj.inclusions
    : [
        'Catering service',
        'Stage set up (styro name, character, couch, entrance arc)',
        'Presidential table',
        'Photobooth (3 hours unlimited shots)',
        'Invitation (20 pcs)',
        'Basic lights and sounds',
        'Cake and 1 dozen cupcakes',
        'Photographer',
        'Host'
      ];

  panelEl.innerHTML = `
    <h3 class="preview-pkg-title">${name}</h3>
    <div class="preview-pkg-price">&#8369;${priceNum.toLocaleString()}</div>
    <div class="preview-price-sub">for 100 guests, then &#8369;${extraRate} per extra guest</div>
    <div class="preview-fact-line">
      <svg class="preview-fact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Pick Food Package 1, 2 or 3 for your menu</span>
    </div>
    <div class="preview-fact-line">
      <svg class="preview-fact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>50% downpayment holds your date for 48 hours</span>
    </div>
    <div class="preview-inclusions-wrap">
      <span class="preview-inclusions-label">Full Inclusions</span>
      <ul class="preview-inclusions-list">
        ${inclusions.map(inc => `
          <li class="preview-inclusion-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>${inc}</span>
          </li>
        `).join('')}
      </ul>
    </div>
    <button type="button" class="btn-screen2-continue" id="btnScreen2Continue">Continue</button>
  `;

  bindScreen2Continue();
}

function renderFoodRows(listEl, previewPanel) {
  if (!listEl) return;

  const foodPackages = [
    { level: 1, name: 'Food Package 1', perHead: 250, dishes: 4 },
    { level: 2, name: 'Food Package 2', perHead: 270, dishes: 5 },
    { level: 3, name: 'Food Package 3', perHead: 300, dishes: 6 }
  ];

  const currentLevel = (startScreenChoice && startScreenChoice.level) || 1;

  listEl.innerHTML = foodPackages.map(lvl => {
    const isSelected = lvl.level === currentLevel;
    return `
      <div class="screen2-row ${isSelected ? 'is-selected' : ''}"
           role="radio"
           aria-checked="${isSelected}"
           tabindex="${isSelected ? '0' : '-1'}"
           data-level="${lvl.level}">
        <div class="screen2-row-left">
          <div class="screen2-radio-circle" aria-hidden="true"></div>
          <div class="screen2-row-info">
            <span class="screen2-row-name">${lvl.name}</span>
            <span class="screen2-row-pax">${lvl.dishes} dishes</span>
          </div>
        </div>
        <div class="screen2-row-price-wrap">
          <span class="screen2-row-price">&#8369;${lvl.perHead} per guest</span>
        </div>
      </div>
    `;
  }).join('');

  const rowEls = Array.from(listEl.querySelectorAll('.screen2-row'));

  const selectLvl = (level) => {
    startScreenChoice = { type: 'food', packageId: null, level };
    rowEls.forEach(r => {
      const match = Number(r.dataset.level) === level;
      r.classList.toggle('is-selected', match);
      r.setAttribute('aria-checked', match ? 'true' : 'false');
      r.setAttribute('tabindex', match ? '0' : '-1');
    });
    renderFoodPreview(level, previewPanel);
    announceToLiveRegion(`Selected Food Package ${level}`);
  };

  rowEls.forEach((row, idx) => {
    const lvl = Number(row.dataset.level);
    row.onclick = () => selectLvl(lvl);
    row.onmouseenter = () => renderFoodPreview(lvl, previewPanel);
    row.onfocus = () => renderFoodPreview(lvl, previewPanel);
    row.onmouseleave = () => {
      const activeLvl = (startScreenChoice && startScreenChoice.level) || 1;
      renderFoodPreview(activeLvl, previewPanel);
    };

    row.onkeydown = (e) => {
      let targetIdx = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        targetIdx = (idx + 1) % rowEls.length;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        targetIdx = (idx - 1 + rowEls.length) % rowEls.length;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectLvl(lvl);
        return;
      }
      if (targetIdx >= 0) {
        const targetRow = rowEls[targetIdx];
        const targetLvl = Number(targetRow.dataset.level);
        selectLvl(targetLvl);
        targetRow.focus({ preventScroll: true });
      }
    };
  });

  renderFoodPreview(currentLevel, previewPanel);
}

function renderFoodPreview(level, panelEl) {
  if (!panelEl) return;

  const lvlObj = (pricingConfig && pricingConfig.levels && pricingConfig.levels.find(l => l.level === level)) || {
    level,
    name: `Food Package ${level}`,
    perHead: level === 3 ? 300 : (level === 2 ? 270 : 250),
    dishes: level === 3 ? 6 : (level === 2 ? 5 : 4)
  };

  let slotRule = 'Pick: 1 chicken or fish, 1 beef or pork, 1 pasta, 1 vegetable';
  if (level === 2) {
    slotRule = 'Pick: 1 chicken, 1 fish, 1 beef or pork, 1 pasta, 1 vegetable';
  } else if (level === 3) {
    slotRule = 'Pick: 1 chicken, 1 fish, 1 beef, 1 pork, 1 pasta, 1 vegetable';
  }

  panelEl.innerHTML = `
    <h3 class="preview-pkg-title">${lvlObj.name}</h3>
    <div class="preview-pkg-price">&#8369;${lvlObj.perHead} per guest</div>
    <div class="preview-price-sub">${lvlObj.dishes} heritage dishes</div>
    <div class="preview-fact-line">
      <svg class="preview-fact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${slotRule}</span>
    </div>
    <div class="preview-fact-line">
      <svg class="preview-fact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>Also included: Java or plain rice, 1 drink, 1 dessert, utensils, waiters, food attendants, ice, tables and chairs, basic set up</span>
    </div>
    <div class="preview-fact-line">
      <svg class="preview-fact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>75 guests and up: &#8369;${lvlObj.perHead} per guest. Under 75 guests: flat &#8369;15,000 for the whole event.</span>
    </div>
    <button type="button" class="btn-screen2-continue" id="btnScreen2Continue">Continue</button>
  `;

  bindScreen2Continue();
}

function bindScreen2Continue() {
  const btn = document.getElementById('btnScreen2Continue');
  if (!btn) return;

  btn.onclick = () => {
    if (!startScreenChoice) return;

    studioState.type = startScreenChoice.type;
    studioState.packageId = startScreenChoice.packageId;
    studioState.level = startScreenChoice.level || 1;

    if (studioState.type === 'event') {
      studioState.pax = studioState.pax || 0;
    } else if (studioState.type === 'food') {
      studioState.pax = studioState.pax || 0;
    }

    currentStepIndex = 2;
    renderActiveStep();
    recalculateQuote();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

function openStartScreen2WithChoice(choice) {
  studioState.type = choice.type;
  startScreenType = choice.type;
  startScreenChoice = { ...choice };
  startScreenCurrent = 2;
  renderActiveStep();
  switchStartScreen(2, true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function announceToLiveRegion(msg) {
  const announcer = document.getElementById('studioAriaAnnouncer');
  if (announcer) {
    announcer.textContent = msg;
  }
}

/* --------------------------------------------------------------------------
   Step 1: Date & Guests
   -------------------------------------------------------------------------- */
async function handleCalendarDateSelection(d, isPeak = false) {
  const previousDate = studioState.date;
  studioState.date = d;
  studioState.details.date = d;
  updateDateDisplay(d, isPeak);
  if (d) {
    try {
      await mockApi.holdDate(d, 'draft-current');
    } catch (e) {
      studioState.date = previousDate;
      studioState.details.date = previousDate;
      if (calendarInstance) {
        calendarInstance.setSelectedDate(previousDate || '', false, false);
        calendarInstance.loadMonthData();
      }
      updateDateDisplay(previousDate || '');
      showToast(e.message || 'Unable to reserve this date. Please choose another date.', 'warning');
      return;
    }
  }
  recalculateQuote();
  saveCurrentDraft();
  renderTabTracker();
  updateValidationUI();
}

function updateDateDisplay(d, isPeak = false) {
  const display = document.getElementById('dateValText');
  const alertBox = document.getElementById('selectedDateDisplay');
  if (!display) return;
  if (!d) {
    display.textContent = 'No date chosen yet';
    if (alertBox) alertBox.classList.remove('has-chosen-date');
    return;
  }

  const readable = formatReadableDate(d);
  display.innerHTML = `<strong>${readable}</strong>${isPeak ? ' <span class="badge badge-rust" style="margin-left:0.5rem; font-size:0.75rem;">Peak Date</span>' : ''}`;
  if (alertBox) alertBox.classList.add('has-chosen-date');
}

function renderDateGuestsStep() {
  const title = document.getElementById('paneTitleDate');
  const hint = document.getElementById('paxPolicyHint');
  const liveRate = document.getElementById('paxLiveRateNote');
  const slider = document.getElementById('paxRangeInput');
  const numInput = document.getElementById('paxNumberInput');
  const snapMsg = document.getElementById('paxSnapWarning');

  const isEvent = studioState.type === 'event';
  const pkgObj = packagesData.find(p => p.id === studioState.packageId) || packagesData[0];
  const isWedding = studioState.packageId === 'wedding';
  const extraRate = isWedding ? 280 : 250;

  if (title) {
    title.textContent = 'Pick your date and guests';
  }

  if (isEvent) {
    if (hint) hint.textContent = 'This package is for 100 guests and up.';
    if (slider) {
      slider.min = '100';
      slider.value = String(Math.max(100, studioState.pax));
    }
    if (numInput) {
      numInput.min = '100';
      numInput.value = String(Math.max(100, studioState.pax));
    }
    if (liveRate) {
      liveRate.innerHTML = `+&#8369;${extraRate} per guest after 100`;
    }
  } else {
    // Food booking
    if (hint) hint.textContent = '75 guests and up: per guest. Under 75 guests: flat \u20B115,000 for the whole event.';
    if (slider) {
      slider.min = '10';
      slider.value = String(studioState.pax || 75);
    }
    if (numInput) {
      numInput.min = '1';
      numInput.value = String(studioState.pax || 75);
    }
    const rate = studioState.level === 3 ? 300 : (studioState.level === 2 ? 270 : 250);
    if (liveRate) {
      liveRate.innerHTML = `&#8369;${rate} per guest (75+ guests) · Under 75: flat &#8369;15,000`;
    }
  }

  // Update date display immediately
  updateDateDisplay(studioState.date);

  // Mount calendar if not already mounted
  if (!calendarInstance) {
    const calEl = document.getElementById('studioCalendarContainer');
    if (calEl) {
      calendarInstance = new TikimCalendar('#studioCalendarContainer', {
        selectedDate: studioState.date || '',
        onSelectDate: (d, isPeak) => handleCalendarDateSelection(d, isPeak),
        onDateSelect: (d, isPeak) => handleCalendarDateSelection(d, isPeak)
      });
    }
  } else if (studioState.date) {
    calendarInstance.setSelectedDate(studioState.date, false, false);
  }

  // Update venue input
  const venueEl = document.getElementById('venueInput');
  if (venueEl) {
    venueEl.value = studioState.venue || studioState.details.venue || '';
    venueEl.oninput = () => {
      studioState.venue = venueEl.value;
      studioState.details.venue = venueEl.value;
      saveCurrentDraft();
    };
  }
}

/* --------------------------------------------------------------------------
   Step 2: Menu Customization (Redesign with Stone Panels & Segmented Toggles)
   -------------------------------------------------------------------------- */
function renderMenuStep() {

  const isEvent = studioState.type === 'event';
  const levelSelector = document.getElementById('menuLevelSelector');
  const foodTitle = document.getElementById('foodFixedPackageTitle');

  if (isEvent) {
    if (levelSelector) {
      levelSelector.style.display = 'inline-flex';
      levelSelector.querySelectorAll('.menu-level-tab').forEach(tab => {
        const lvl = Number(tab.getAttribute('data-level'));
        tab.classList.toggle('active', lvl === studioState.level);
      });
    }
    if (foodTitle) foodTitle.style.display = 'none';
  } else {
    if (levelSelector) levelSelector.style.display = 'none';
    if (foodTitle) {
      foodTitle.style.display = 'block';
      const dishCount = studioState.level === 3 ? 6 : (studioState.level === 2 ? 5 : 4);
      foodTitle.textContent = `Food Package ${studioState.level} (${dishCount} dishes)`;
    }
  }

  // Populate saved menus dropdown
  populateSavedMenusDropdown();

  // Render Stone-coloured slot panels
  renderSlotPanels();

  // Render Staples (Rice, Drinks, Desserts)
  renderStaplesSection();

  // Render Extra Dishes Accordion
  renderExtraDishesAccordion();

  // Update progress quota display
  updateMenuQuotaDisplay();
}

async function populateSavedMenusDropdown() {
  const select = document.getElementById('loadSavedMenuSelect');
  if (!select) return;

  const saved = await mockApi.listSavedMenus();
  select.innerHTML = '<option value="">Load a saved menu...</option>' +
    saved.map(m => `<option value="${m.id}">${m.name} (Food Package ${m.level})</option>`).join('');

  select.onchange = async () => {
    const id = select.value;
    if (!id) return;
    const found = saved.find(m => m.id === id);
    if (!found) return;
    const ok = await showConfirmDialog({
      title: 'Load saved menu?',
      desc: `Load saved menu "${found.name}"? This will replace your current picks.`,
      confirmText: 'Load menu'
    });
    if (ok) {
      studioState.level = found.level || studioState.level;
      studioState.selectedDishes = Array.isArray(found.dishes) ? [...found.dishes] : [];
      renderMenuStep();
      recalculateQuote();
      saveCurrentDraft();
      showToast(`Loaded "${found.name}"`, 'success');
    }
  };
}

function getSlotDefinitions(level) {
  const lvl = Number(level) || 1;
  if (lvl === 2) {
    return [
      { id: 'slot-chicken', title: 'Chicken, choose 1', categories: ['chicken'] },
      { id: 'slot-fish', title: 'Fish, choose 1', categories: ['fish'] },
      { id: 'slot-beef-pork', title: 'Beef or pork, choose 1', categories: ['beef', 'pork'] },
      { id: 'slot-pasta', title: 'Pasta, choose 1', categories: ['pasta'] },
      { id: 'slot-vegetables', title: 'Vegetables, choose 1', categories: ['vegetables'] }
    ];
  }
  if (lvl === 3) {
    return [
      { id: 'slot-chicken', title: 'Chicken, choose 1', categories: ['chicken'] },
      { id: 'slot-fish', title: 'Fish, choose 1', categories: ['fish'] },
      { id: 'slot-beef', title: 'Beef, choose 1', categories: ['beef'] },
      { id: 'slot-pork', title: 'Pork, choose 1', categories: ['pork'] },
      { id: 'slot-pasta', title: 'Pasta, choose 1', categories: ['pasta'] },
      { id: 'slot-vegetables', title: 'Vegetables, choose 1', categories: ['vegetables'] }
    ];
  }
  // Level 1 default
  return [
    { id: 'slot-chicken-fish', title: 'Chicken or fish, choose 1', categories: ['chicken', 'fish'] },
    { id: 'slot-beef-pork', title: 'Beef or pork, choose 1', categories: ['beef', 'pork'] },
    { id: 'slot-pasta', title: 'Pasta, choose 1', categories: ['pasta'] },
    { id: 'slot-vegetables', title: 'Vegetables, choose 1', categories: ['vegetables'] }
  ];
}

function findAssignedDishForSlot(slot) {
  if (!studioState.slotPicks) return null;
  const dishId = studioState.slotPicks[slot.id];
  if (!dishId) return null;
  const dishObj = menuData.find(d => d.id === dishId || d.slug === dishId || d.name === dishId);
  return dishObj ? dishObj.name : null;
}

function syncSelectedDishesFromSlots() {
  const slots = getSlotDefinitions(studioState.level || 1);
  const dishNames = [];
  studioState.slotPicks = studioState.slotPicks || {};
  slots.forEach(slot => {
    const dishId = studioState.slotPicks[slot.id];
    if (dishId) {
      const dishObj = menuData.find(d => d.id === dishId || d.slug === dishId || d.name === dishId);
      if (dishObj) dishNames.push(dishObj.name);
    }
  });
  studioState.selectedDishes = dishNames;
}

function syncSlotsFromDishes() {
  const slots = getSlotDefinitions(studioState.level || 1);
  studioState.slotPicks = studioState.slotPicks || {};
  if (Object.keys(studioState.slotPicks).length === 0 && Array.isArray(studioState.selectedDishes)) {
    studioState.selectedDishes.forEach(dishName => {
      const dishObj = menuData.find(d => d.name === dishName || d.id === dishName);
      if (!dishObj) return;
      const cat = (dishObj.category || dishObj.course || '').toLowerCase();
      const slot = slots.find(s => s.categories.includes(cat) && !studioState.slotPicks[s.id]);
      if (slot) {
        studioState.slotPicks[slot.id] = dishObj.id;
      }
    });
  }
}

function renderSlotPanels() {
  const container = document.getElementById('menuSlotsContainer');
  if (!container) return;

  const slots = getSlotDefinitions(studioState.level);
  let html = '';

  slots.forEach(slot => {
    const assignedDish = findAssignedDishForSlot(slot);
    const isFulfilled = Boolean(assignedDish);

    // Active category for segmented toggle
    const currentCat = slotActiveCategory[slot.id] || slot.categories[0];

    // Filter available dishes matching the active subcategory
    const availableDishes = menuData.filter(d => {
      const cat = (d.category || d.course || '').toLowerCase();
      return cat === currentCat.toLowerCase();
    });

    // Render Segmented toggle if multiple categories allowed
    let toggleHtml = '';
    if (slot.categories.length > 1) {
      toggleHtml = `
        <div class="slot-segmented-toggle" role="tablist">
          ${slot.categories.map(cat => {
            const label = cat.charAt(0).toUpperCase() + cat.slice(1);
            const active = cat.toLowerCase() === currentCat.toLowerCase() ? 'active' : '';
            return `<button type="button" class="slot-seg-btn ${active}" data-slot="${slot.id}" data-cat="${cat}">${label}</button>`;
          }).join('')}
        </div>
      `;
    }

    html += `
      <div class="slot-stone-panel ${isFulfilled ? 'fulfilled' : ''}" id="slotPanel-${slot.id}">
        <div class="slot-panel-header">
          <h3 class="slot-panel-title">
            <span class="slot-panel-check" style="${isFulfilled ? 'background:#212e34; color:#faf7f2;' : 'background:rgba(33,46,52,0.2); color:transparent;'}">\u2713</span>
            ${slot.title}
          </h3>
          ${isFulfilled ? `<span class="slot-status-text" style="font-size:0.82rem; font-weight:700; color:#212e34;">Selected: ${assignedDish}</span>` : '<span class="slot-status-text" style="font-size:0.82rem; color:#64748b;">Not chosen yet</span>'}
        </div>

        ${toggleHtml}

        <div class="slot-dish-grid">
          ${availableDishes.map(dish => {
            const isSelected = Boolean(studioState.slotPicks && studioState.slotPicks[slot.id] === dish.id);
            return `
              <div class="dish-tile-card ${isSelected ? 'selected is-selected' : ''}" data-dish="${dish.id}" data-slot="${slot.id}" tabindex="0" role="button" aria-pressed="${isSelected}">
                <div class="dish-tile-header">
                  <span class="dish-tile-name">${dish.name}</span>
                  <span class="dish-tile-check" aria-hidden="true"></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind segmented toggles
  container.querySelectorAll('.slot-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const slotId = btn.getAttribute('data-slot');
      const cat = btn.getAttribute('data-cat');
      slotActiveCategory[slotId] = cat;
      renderSlotPanels();
    });
  });

  // Bind dish tiles with click and keyboard support
  container.querySelectorAll('.dish-tile-card').forEach(tile => {
    const handleToggle = () => {
      const dishId = tile.getAttribute('data-dish');
      const slotId = tile.getAttribute('data-slot');
      toggleSlotDish(slotId, dishId);
    };
    tile.addEventListener('click', handleToggle);
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    });
  });
}

// In-place UI update without re-creating control DOM nodes (Part 2)
function updateSlotPanelUI(slotId) {
  const panel = document.getElementById(`slotPanel-${slotId}`);
  if (!panel) return;

  const currentPick = studioState.slotPicks ? studioState.slotPicks[slotId] : null;
  const isFulfilled = Boolean(currentPick);

  panel.classList.toggle('fulfilled', isFulfilled);

  const checkEl = panel.querySelector('.slot-panel-check');
  if (checkEl) {
    if (isFulfilled) {
      checkEl.style.background = '#212e34';
      checkEl.style.color = '#faf7f2';
    } else {
      checkEl.style.background = 'rgba(33,46,52,0.2)';
      checkEl.style.color = 'transparent';
    }
  }

  const statusText = panel.querySelector('.slot-status-text');
  if (statusText) {
    if (isFulfilled) {
      const dishObj = menuData.find(d => d.id === currentPick || d.slug === currentPick);
      const name = dishObj ? dishObj.name : currentPick;
      statusText.style.fontWeight = '700';
      statusText.style.color = '#212e34';
      statusText.textContent = `Selected: ${name}`;
    } else {
      statusText.style.fontWeight = '400';
      statusText.style.color = '#64748b';
      statusText.textContent = 'Not chosen yet';
    }
  }

  panel.querySelectorAll(`.dish-tile-card[data-slot="${slotId}"]`).forEach(tile => {
    const dId = tile.getAttribute('data-dish');
    const isSelected = Boolean(currentPick && dId === currentPick);
    tile.classList.toggle('selected', isSelected);
    tile.classList.toggle('is-selected', isSelected);
    tile.setAttribute('aria-pressed', String(isSelected));
  });
}

function toggleSlotDish(slotId, dishId) {
  studioState.slotPicks = studioState.slotPicks || {};
  const currentPick = studioState.slotPicks[slotId];

  if (currentPick === dishId) {
    delete studioState.slotPicks[slotId];
  } else {
    studioState.slotPicks[slotId] = dishId;
    if (currentPick) {
      const oldDish = menuData.find(d => d.id === currentPick || d.slug === currentPick);
      const newDish = menuData.find(d => d.id === dishId || d.slug === dishId);
      if (oldDish && newDish) {
        showToast(`Replaced "${oldDish.name}" with "${newDish.name}"`, 'info');
      }
    }
  }

  syncSelectedDishesFromSlots();
  updateSlotPanelUI(slotId);
  updateMenuQuotaDisplay();
  recalculateQuote();
  renderTabTracker();
  updateValidationUI();
  saveCurrentDraft();
}

function updateMenuQuotaDisplay() {
  const quotaText = document.getElementById('menuQuotaText');
  const warning = document.getElementById('slotsMissingWarning');
  const warningText = document.getElementById('slotsMissingText');

  const slots = getSlotDefinitions(studioState.level);
  const missingSlots = [];

  slots.forEach(slot => {
    if (!studioState.slotPicks || !studioState.slotPicks[slot.id]) {
      missingSlots.push(slot.title);
    }
  });

  const filledCount = slots.length - missingSlots.length;
  if (quotaText) {
    quotaText.innerHTML = `${filledCount} of ${slots.length} dishes chosen ${filledCount === slots.length ? '\u2713' : ''}`;
  }

  if (warning && warningText) {
    if (missingSlots.length > 0) {
      warning.style.display = 'flex';
      warningText.textContent = `Missing required slots: ${missingSlots.join(', ')}`;
    } else {
      warning.style.display = 'none';
    }
  }
}

function renderStaplesSection() {
  const grid = document.getElementById('staplesGrid');
  if (!grid) return;

  const riceOptions = ['Java rice', 'Plain rice'];
  const drinkOptions = ['Iced tea', 'Lemonade', 'Blue lemonade', 'Cucumber lemonade', 'Pineapple juice'];
  const dessertOptions = ['Fruit salad', 'Buko pandan', 'Coffee jelly'];

  grid.innerHTML = `
    <div class="staple-box">
      <div class="staple-label">Rice (Choose 1)</div>
      <div style="display:flex; flex-direction:column; gap:0.4rem;">
        ${riceOptions.map(r => `
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; cursor:pointer;">
            <input type="radio" name="stapleRice" value="${r}" ${studioState.includedRice === r ? 'checked' : ''}>
            <span>${r}</span>
          </label>
        `).join('')}
      </div>
    </div>

    <div class="staple-box">
      <div class="staple-label">Drink (Choose 1)</div>
      <div style="display:flex; flex-direction:column; gap:0.4rem;">
        ${drinkOptions.map(dr => `
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; cursor:pointer;">
            <input type="radio" name="stapleDrink" value="${dr}" ${studioState.includedDrink === dr ? 'checked' : ''}>
            <span>${dr}</span>
          </label>
        `).join('')}
      </div>
    </div>

    <div class="staple-box">
      <div class="staple-label">Dessert (Choose 1)</div>
      <div style="display:flex; flex-direction:column; gap:0.4rem;">
        ${dessertOptions.map(de => `
          <label style="display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; cursor:pointer;">
            <input type="radio" name="stapleDessert" value="${de}" ${studioState.includedDessert === de ? 'checked' : ''}>
            <span>${de}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;

  grid.querySelectorAll('input[name="stapleRice"]').forEach(r => {
    r.onchange = () => { studioState.includedRice = r.value; saveCurrentDraft(); };
  });
  grid.querySelectorAll('input[name="stapleDrink"]').forEach(r => {
    r.onchange = () => { studioState.includedDrink = r.value; saveCurrentDraft(); };
  });
  grid.querySelectorAll('input[name="stapleDessert"]').forEach(r => {
    r.onchange = () => { studioState.includedDessert = r.value; saveCurrentDraft(); };
  });
}

function renderExtraDishesAccordion() {
  const container = document.getElementById('extraDishesListContainer');
  const hint = document.getElementById('extraDishesHint');
  if (!container) return;

  const pax = studioState.pax || 100;
  const ratePerPax = 30;
  const totalExtra = pax * ratePerPax;

  if (hint) {
    hint.textContent = `Every extra heritage dish is +${formatPeso(ratePerPax)} per guest for ${pax} guests = ${formatPeso(totalExtra)}. Special dishes are quoted on request.`;
  }

  // Filter dishes that are not in selected dishes
  const eligibleExtras = menuData.filter(d => !studioState.selectedDishes.includes(d.name));

  container.innerHTML = eligibleExtras.map(dish => {
    const isExtra = studioState.extraDishes.some(e => e.name === dish.name);
    const isSpecial = (dish.category || '').toLowerCase().includes('special');
    return `
      <label class="extra-dish-row control-row" style="display:flex; justify-content:space-between; align-items:center; background:#faf7f2; padding:0.5rem 0.75rem; border-radius:6px; border:1px solid rgba(33,46,52,0.15); cursor:pointer;">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <input type="checkbox" class="extra-dish-chk" data-name="${dish.name}" data-cat="${dish.category}" ${isExtra ? 'checked' : ''}>
          <span class="control-label" style="font-weight:600; font-size:16px; color:#212e34;">${dish.name}</span>
        </div>
        <span class="extra-dish-price-chip" style="font-size:0.82rem; font-weight:700; color:var(--color-rust);">
          ${isSpecial ? 'Price on request' : `+${formatPeso(ratePerPax)}/guest (${formatPeso(totalExtra)})`}
        </span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('.extra-dish-chk').forEach(chk => {
    chk.onchange = () => {
      const name = chk.getAttribute('data-name');
      const cat = chk.getAttribute('data-cat');
      if (chk.checked) {
        studioState.extraDishes.push({ name, category: cat, pricePerHead: ratePerPax });
      } else {
        studioState.extraDishes = studioState.extraDishes.filter(e => e.name !== name);
      }
      recalculateQuote();
      saveCurrentDraft();
    };
  });
}

/* --------------------------------------------------------------------------
   Step 3: Extras Step (Event only)
   -------------------------------------------------------------------------- */
function renderExtrasStep() {
  const occasion = studioState.packageId || 'party';
  const pkgObj = packagesData.find(p => p.id === occasion) || packagesData[0];
  const occTitle = document.getElementById('currentOccasionName');
  if (occTitle) occTitle.textContent = pkgObj ? pkgObj.name : 'Event';

  // Package inclusions list with skip toggles
  const incContainer = document.getElementById('inclusionsChecklistList');
  if (incContainer && pkgObj) {
    const nonCatering = (pkgObj.inclusions || []).filter(inc => !inc.startsWith('Catering service'));
    incContainer.innerHTML = nonCatering.map((inc, idx) => {
      const isSkipped = studioState.skipped.includes(inc);
      return `
        <div class="inclusion-row ${isSkipped ? 'skipped' : ''}">
          <div class="inc-info ${isSkipped ? 'skipped-text' : ''}">
            <span>&bull;</span>
            <span>${inc}</span>
          </div>
          <button type="button" class="skip-toggle-btn ${isSkipped ? 'is-skipped' : ''}" data-inc="${inc}">
            ${isSkipped ? 'Skipped' : 'Skip'}
          </button>
        </div>
      `;
    }).join('');

    incContainer.querySelectorAll('.skip-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const inc = btn.getAttribute('data-inc');
        if (studioState.skipped.includes(inc)) {
          studioState.skipped = studioState.skipped.filter(s => s !== inc);
        } else {
          studioState.skipped.push(inc);
        }
        renderExtrasStep();
        saveCurrentDraft();
      };
    });
  }

  // Themed Styro Name & Character Fields (Tailored per package)
  const extrasConfig = (pricingConfig && pricingConfig.extrasFields && pricingConfig.extrasFields[occasion]) || {
    boardName: "Name on the styro board (optional)",
    theme: "Character theme (optional)"
  };
  const styroNameLabel = document.getElementById('styroNameLabel');
  const characterThemeLabel = document.getElementById('characterThemeLabel');
  if (styroNameLabel) styroNameLabel.textContent = extrasConfig.boardName;
  if (characterThemeLabel) characterThemeLabel.textContent = extrasConfig.theme;

  const styroNameEl = document.getElementById('styroNameInput');
  const characterThemeEl = document.getElementById('characterThemeInput');
  if (styroNameEl) {
    styroNameEl.value = (studioState.stageText && studioState.stageText.name) || '';
    styroNameEl.oninput = () => {
      studioState.stageText = studioState.stageText || {};
      studioState.stageText.name = styroNameEl.value;
      saveCurrentDraft();
    };
  }
  if (characterThemeEl) {
    characterThemeEl.value = (studioState.stageText && studioState.stageText.character) || '';
    characterThemeEl.oninput = () => {
      studioState.stageText = studioState.stageText || {};
      studioState.stageText.character = characterThemeEl.value;
      saveCurrentDraft();
    };
  }

  // Priced Add-ons grid
  const addonsGrid = document.getElementById('occasionAddonsGrid');
  if (addonsGrid) {
    const available = getPackageAddOns(occasion, pricingConfig);
    addonsGrid.innerHTML = available.map(add => {
      const chosen = studioState.addOns.find(a => a.id === add.id);
      const isChecked = Boolean(chosen);
      const qty = chosen ? (chosen.quantity || 1) : 1;
      const isUnit = add.type === 'per_unit';

      return `
        <div class="modal-addon-item" style="background:#faf7f2; border:1px solid rgba(33,46,52,0.15); border-radius:8px; padding:0.75rem; margin-bottom:0.5rem; display:flex; justify-content:space-between; align-items:center;">
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
            <input type="checkbox" class="studio-addon-chk" data-id="${add.id}" ${isChecked ? 'checked' : ''}>
            <span style="font-weight:700; font-size:0.88rem; color:#212e34;">${add.label}</span>
          </label>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span style="font-size:0.85rem; font-weight:700; color:var(--color-rust);">
              ${add.price ? formatPeso(add.price) : 'On request'}
            </span>
            ${(isChecked && isUnit) ? `
              <div style="display:flex; align-items:center; gap:0.3rem;">
                <button type="button" class="btn btn-xs btn-outline btn-addon-dec" data-id="${add.id}">&minus;</button>
                <span style="font-size:0.85rem; font-weight:700; min-width:18px; text-align:center;">${qty}</span>
                <button type="button" class="btn btn-xs btn-outline btn-addon-inc" data-id="${add.id}">&plus;</button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    addonsGrid.querySelectorAll('.studio-addon-chk').forEach(chk => {
      chk.onchange = () => {
        const id = chk.getAttribute('data-id');
        const found = (pricingConfig.addOns || []).find(a => a.id === id);
        if (chk.checked) {
          studioState.addOns.push({ id, label: found ? found.label : id, quantity: 1, price: found ? found.price : 0 });
        } else {
          studioState.addOns = studioState.addOns.filter(a => a.id !== id);
        }
        renderExtrasStep();
        recalculateQuote();
        saveCurrentDraft();
      };
    });

    addonsGrid.querySelectorAll('.btn-addon-inc').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const target = studioState.addOns.find(a => a.id === id);
        if (target) target.quantity = (target.quantity || 1) + 1;
        renderExtrasStep();
        recalculateQuote();
        saveCurrentDraft();
      };
    });

    addonsGrid.querySelectorAll('.btn-addon-dec').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const target = studioState.addOns.find(a => a.id === id);
        if (target && target.quantity > 1) {
          target.quantity -= 1;
        } else {
          studioState.addOns = studioState.addOns.filter(a => a.id !== id);
        }
        renderExtrasStep();
        recalculateQuote();
        saveCurrentDraft();
      };
    });
  }
}

/* --------------------------------------------------------------------------
   Step: Floor Plan (Event only, optional - Revision 17B Part 5)
   -------------------------------------------------------------------------- */
function updateFloorplanBar() {
  const summaryEl = document.getElementById('floorplanSeatSummary');
  const btnConfirm = document.getElementById('btnConfirmLayout');
  const btnEdit = document.getElementById('btnEditLayout');
  const noteEl = document.getElementById('floorplanConfirmNote');

  const items = floorPlannerInstance?.items || studioState.layout?.units || studioState.floorPlan?.units || [];
  const itemCount = items.length;
  const seatCount = items.reduce((sum, item) => sum + (item.seats || 0), 0);

  if (summaryEl) {
    summaryEl.textContent = `${itemCount} items, ${seatCount} seats for ${studioState.pax} guests`;
  }

  if (studioState.layoutStatus === 'confirmed') {
    if (btnConfirm) btnConfirm.style.display = 'none';
    if (btnEdit) btnEdit.style.display = 'inline-flex';
    if (noteEl) {
      noteEl.style.display = 'block';
      noteEl.textContent = "Layout confirmed. It will be sent to Dack's with your booking.";
    }
  } else if (studioState.layoutStatus === 'unconfirmed') {
    if (btnConfirm) btnConfirm.style.display = 'inline-flex';
    if (btnEdit) btnEdit.style.display = 'none';
    if (noteEl) {
      noteEl.style.display = itemCount > 0 ? 'block' : 'none';
      noteEl.textContent = "Unconfirmed changes";
    }
  } else if (studioState.layoutStatus === 'skipped') {
    if (btnConfirm) btnConfirm.style.display = 'inline-flex';
    if (btnEdit) btnEdit.style.display = 'none';
    if (noteEl) noteEl.style.display = 'none';
  }

  renderTabTracker();
}

function renderFloorplanStep() {
  const mount = document.getElementById('studioFloorplanMount');
  if (!mount) return;

  if (!floorPlannerInstance) {
    floorPlannerInstance = new TikimFloorPlanner('#studioFloorplanMount', {
      pax: studioState.pax,
      isMini: false,
      isStudio: true,
      initialItems: studioState.layout?.units || studioState.floorPlan?.units || null,
      onLayoutChange: (layout) => {
        studioState.floorPlan = layout;
        if (studioState.layoutStatus === 'confirmed') {
          studioState.layoutStatus = 'unconfirmed';
        }
        updateFloorplanBar();
        saveCurrentDraft();
      }
    });
  }
  window.floorPlannerInstance = floorPlannerInstance;

  const btnConfirm = document.getElementById('btnConfirmLayout');
  const btnEdit = document.getElementById('btnEditLayout');
  const btnSkip = document.getElementById('btnSkipFloorplan');

  if (btnConfirm) {
    btnConfirm.onclick = async () => {
      const items = floorPlannerInstance?.items || [];
      const layoutData = {
        units: JSON.parse(JSON.stringify(items)),
        venueWidth: floorPlannerInstance.venueWidth,
        venueHeight: floorPlannerInstance.venueHeight,
        venuePreset: floorPlannerInstance.currentPreset,
        confirmedAt: new Date().toISOString()
      };
      const thumbRes = await generateSafeThumbnail(layoutData, 320);
      layoutData.thumbnail = thumbRes.dataUrl;
      studioState.layout = layoutData;
      studioState.layoutStatus = 'confirmed';
      updateFloorplanBar();
      saveCurrentDraft();
      showToast('Layout confirmed. It will be sent to Dack\'s with your booking.');
    };
  }

  if (btnEdit) {
    btnEdit.onclick = () => {
      studioState.layoutStatus = 'unconfirmed';
      updateFloorplanBar();
      saveCurrentDraft();
    };
  }

  if (btnSkip) {
    btnSkip.onclick = () => {
      studioState.layoutStatus = 'skipped';
      studioState.layout = null;
      updateFloorplanBar();
      saveCurrentDraft();
      goToStep(currentStepIndex + 1);
    };
  }

  updateFloorplanBar();
  updateStudioFloorplanPriceChip();
}

/* --------------------------------------------------------------------------
   Step: Food Trays (Trays type only - All 28 dishes in 6 sections)
   -------------------------------------------------------------------------- */
function renderTraysStep() {
  const container = document.getElementById('traysCatalogContainer');
  const runningTotal = document.getElementById('traysRunningTotal');
  if (!container) return;

  const stored = getStoredTrays();
  if (stored && stored.length > 0) {
    studioState.trays = stored;
  } else if (!Array.isArray(studioState.trays)) {
    studioState.trays = [];
  }

  const sections = [
  { key: 'Chicken', title: 'Chicken' },
  { key: 'Pork', title: 'Pork' },
  { key: 'Beef', title: 'Beef' },
  { key: 'Pasta', title: 'Pasta' },
  { key: 'Fish', title: 'Fish' },
  { key: 'Veggie', title: 'Veggie' }
].map(section => {
  const category = trayCategoriesData.find(
    item => item.name === section.key
  );

  return {
    ...section,
    price: Number(category?.price_per_tray ?? 0)
  };
});

  let html = '';
  sections.forEach(sec => {
    const dishes = traysData.filter(d => (d.category || '').toLowerCase() === sec.key.toLowerCase());
    html += `
      <div class="trays-section" id="trays-section-${sec.key.toLowerCase()}">
        <div class="trays-section-header">
          <h3 class="trays-section-title">${sec.title}</h3>
          <span class="trays-section-rate">&#8369;${sec.price.toLocaleString()} per tray</span>
        </div>
        <div class="trays-section-dishes">
          ${dishes.map(dish => {
            const item = studioState.trays.find(t => t.id === dish.id || t.name === dish.name);
            const qty = item ? (item.qty || item.quantity || 0) : 0;
            const slug = dish.id.replace(/^tray-/, '');
            return `
              <div class="tray-catalog-row" data-id="${dish.id}">
                <div class="tray-catalog-info">
                  <div class="tray-thumb-wrap">
                    <img src="assets/img/trays/${slug}.jpg" alt="${dish.name}" class="tray-thumb" width="56" height="56"
                         onload="this.style.display='block'; if(this.nextElementSibling) this.nextElementSibling.style.display='none';"
                         onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                    <div class="tray-svg-fallback" style="display:none; width:56px; height:56px;">
                      ${renderTraySvg(sec.key)}
                    </div>
                  </div>
                  <div class="tray-text">
                    <span class="tray-name">${dish.name}</span>
                    <span class="tray-price">&#8369;${sec.price.toLocaleString()} / tray</span>
                  </div>
                </div>
                <div class="tray-stepper-ctrl">
                  <button type="button" class="btn-tray-step btn-tray-step-dec" data-id="${dish.id}" aria-label="Decrease quantity" ${qty === 0 ? 'disabled' : ''}>&minus;</button>
                  <span class="tray-stepper-qty" id="tray-qty-${dish.id}">${qty}</span>
                  <button type="button" class="btn-tray-step btn-tray-step-inc" data-id="${dish.id}" aria-label="Increase quantity">&plus;</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind steppers with in-place updates without losing scroll or focus
  container.querySelectorAll('.btn-tray-step-inc').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      updateStudioTrayQuantity(id, 1);
    };
  });

  container.querySelectorAll('.btn-tray-step-dec').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id');
      updateStudioTrayQuantity(id, -1);
    };
  });

  updateStudioTraysTotal();
}

function updateStudioTrayQuantity(dishId, delta) {
  const dish = traysData.find(d => d.id === dishId);
  if (!dish) return;

  studioState.trays = getStoredTrays();
  const idx = studioState.trays.findIndex(t => t.id === dishId || t.name === dish.name);

  if (idx > -1) {
    const newQty = (studioState.trays[idx].qty || studioState.trays[idx].quantity || 1) + delta;
    if (newQty <= 0) {
      studioState.trays.splice(idx, 1);
    } else {
      studioState.trays[idx].qty = newQty;
      studioState.trays[idx].quantity = newQty;
    }
  } else if (delta > 0) {
    studioState.trays.push({
      id: dish.id,
      name: dish.name,
      category: dish.category,
      price: dish.price,
      qty: 1,
      quantity: 1
    });
  }

  setStoredTrays(studioState.trays);

  // In-place DOM update without re-rendering container
  const qtyEl = document.getElementById(`tray-qty-${dishId}`);
  const rowEl = document.querySelector(`.tray-catalog-row[data-id="${dishId}"]`);
  const decBtn = rowEl ? rowEl.querySelector('.btn-tray-step-dec') : null;
  const updatedItem = studioState.trays.find(t => t.id === dishId);
  const updatedQty = updatedItem ? updatedItem.qty : 0;

  if (qtyEl) qtyEl.textContent = String(updatedQty);
  if (decBtn) decBtn.disabled = (updatedQty === 0);

  updateStudioTraysTotal();
  recalculateQuote();
  renderTabTracker();
  updateValidationUI();
  saveCurrentDraft();
}

function updateStudioTraysTotal() {
  const runningTotal = document.getElementById('traysRunningTotal');
  const total = (studioState.trays || []).reduce((sum, t) => sum + (Number(t.price || 0) * Number(t.qty || 1)), 0);
  if (runningTotal) runningTotal.textContent = formatPeso(total);
}

/* --------------------------------------------------------------------------
   Step: Details (Shared for all 3 types)
   -------------------------------------------------------------------------- */
function renderDetailsStep() {
  const nameInput = document.getElementById('custName');
  const mobileInput = document.getElementById('custMobile');
  const messengerGroup = document.getElementById('messengerNameGroup');
  const messengerInput = document.getElementById('custMessengerName');
  const timeSelect = document.getElementById('eventTime');
  const venueAddress = document.getElementById('custVenueAddress');
  const requests = document.getElementById('custRequests');
  const fulfillmentGroup = document.getElementById('fulfillmentGroup');

  if (nameInput) nameInput.value = studioState.details.name || '';
  if (mobileInput) mobileInput.value = studioState.details.mobile || '';
  if (messengerInput) messengerInput.value = studioState.details.messengerName || '';
  if (timeSelect) timeSelect.value = studioState.details.time || '06:30 PM';
  if (venueAddress) venueAddress.value = studioState.details.venue || studioState.venue || '';
  if (requests) requests.value = studioState.details.notes || '';

  // Radio contact channel
  document.querySelectorAll('input[name="contactMethod"]').forEach(r => {
    r.checked = (r.value === studioState.details.contactMethod);
    r.onchange = () => {
      studioState.details.contactMethod = r.value;
      if (messengerGroup) {
        messengerGroup.style.display = r.value === 'Messenger' ? 'block' : 'none';
      }
      saveCurrentDraft();
    };
  });

  if (messengerGroup) {
    messengerGroup.style.display = studioState.details.contactMethod === 'Messenger' ? 'block' : 'none';
  }

  // Fulfillment selector and date for trays
  if (fulfillmentGroup) {
    fulfillmentGroup.style.display = studioState.type === 'trays' ? 'block' : 'none';
  }

  const trayDateGroup = document.getElementById('trayDateGroup');
  const trayDateInput = document.getElementById('trayDeliveryDate');
  if (trayDateGroup) {
    trayDateGroup.style.display = studioState.type === 'trays' ? 'block' : 'none';
  }
  if (trayDateInput) {
    trayDateInput.value = studioState.date || studioState.details.date || '';
  }
}

/* --------------------------------------------------------------------------
   Step: Review & Reserve (Shared for all 3 types)
   -------------------------------------------------------------------------- */
function renderReviewStep() {
  const badge = document.getElementById('reviewTypeBadge');
  const pkgAndDate = document.getElementById('reviewPackageAndDate');
  const paxItem = document.getElementById('reviewPaxItem');
  const paxVal = document.getElementById('reviewPax');
  const contactVal = document.getElementById('reviewContactInfo');
  const venueTime = document.getElementById('reviewVenueTime');
  const checklist = document.getElementById('agreementChecklistContainer');
  const reserveBtnText = document.getElementById('btnReserveText');

  const isEvent = studioState.type === 'event';
  const isFood = studioState.type === 'food';
  const isTrays = studioState.type === 'trays';

  if (badge) {
    badge.textContent = isEvent ? 'Event Package' : (isFood ? 'Food Package' : 'Food Trays');
  }

  const pkgObj = packagesData.find(p => p.id === studioState.packageId) || packagesData[0];
  const dateStr = studioState.date ? formatReadableDate(studioState.date) : 'Target date pending';

  if (pkgAndDate) {
    if (isEvent) {
      pkgAndDate.textContent = `${pkgObj ? pkgObj.name : 'Event'} · ${dateStr}`;
    } else if (isFood) {
      pkgAndDate.textContent = `Food Package ${studioState.level} · ${dateStr}`;
    } else {
      const trays = getStoredTrays();
      const totalTrays = trays.reduce((sum, t) => sum + (t.qty || t.quantity || 0), 0);
      pkgAndDate.textContent = `Food Trays (${totalTrays} items) · ${dateStr}`;
    }
  }

  if (paxItem && paxVal) {
    if (isTrays) {
      paxItem.style.display = 'none';
    } else {
      paxItem.style.display = 'flex';
      paxVal.textContent = `${studioState.pax} Guests`;
    }
  }

  if (contactVal) {
    const methodStr = studioState.details.contactMethod === 'Messenger'
      ? `Messenger (${studioState.details.messengerName || 'pending'})`
      : 'Phone/SMS';
    contactVal.textContent = `${studioState.details.name || 'Valued Client'} · ${studioState.details.mobile || 'No mobile'} (${methodStr})`;
  }

  if (venueTime) {
    venueTime.textContent = `${studioState.details.venue || 'To be specified'} · ${studioState.details.time || '06:30 PM'}`;
  }

  // Event optional styled text display in review
  const boardNameItem = document.getElementById('reviewBoardNameItem');
  const boardNameLabel = document.getElementById('reviewBoardNameLabel');
  const boardNameVal = document.getElementById('reviewBoardNameVal');
  const themeItem = document.getElementById('reviewThemeItem');
  const themeLabel = document.getElementById('reviewThemeLabel');
  const themeVal = document.getElementById('reviewThemeVal');

  if (boardNameItem && themeItem) {
    if (isEvent) {
      boardNameItem.style.display = 'flex';
      themeItem.style.display = 'flex';
      const extrasConfig = (pricingConfig && pricingConfig.extrasFields && pricingConfig.extrasFields[studioState.packageId || 'party']) || {
        boardName: 'Name on Board',
        theme: 'Theme or colours'
      };
      if (boardNameLabel) boardNameLabel.textContent = extrasConfig.boardName.replace(/\s*\(optional\)/i, '');
      if (boardNameVal) boardNameVal.textContent = (studioState.stageText && studioState.stageText.name && studioState.stageText.name.trim()) ? studioState.stageText.name.trim() : 'Not provided';
      if (themeLabel) themeLabel.textContent = extrasConfig.theme.replace(/\s*\(optional\)/i, '');
      if (themeVal) themeVal.textContent = (studioState.stageText && studioState.stageText.character && studioState.stageText.character.trim()) ? studioState.stageText.character.trim() : 'Not provided';
    } else {
      boardNameItem.style.display = 'none';
      themeItem.style.display = 'none';
    }
  }

  // Floor plan preview (Part 5.1 & 6)
  const thumbSection = document.getElementById('reviewLayoutThumbSection');
  const previewMount = document.getElementById('reviewLayoutPreviewMount');
  if (thumbSection && previewMount) {
    if (isEvent && studioState.layout && studioState.layoutStatus === 'confirmed') {
      thumbSection.style.display = 'block';
      previewMount.innerHTML = renderLayoutPreviewSvg(studioState.layout, { maxHeight: '280px' });
    } else {
      thumbSection.style.display = 'none';
    }
  }

  // Itemized quotation & live totals in Review step (Part 6 & Part 2)
  const reviewQuote = computeQuote({
    type: studioState.type,
    eventType: studioState.packageId || 'party',
    packageId: studioState.packageId,
    pax: studioState.pax,
    level: studioState.level || 1,
    packageObj: pkgObj,
    dishes: studioState.selectedDishes,
    extraDishes: studioState.extraDishes,
    specialDishes: studioState.specialDishes,
    addOns: studioState.addOns,
    trays: studioState.trays
  });
  const reviewDpInfo = computeDownpaymentAndBalance(reviewQuote.knownTotal, studioState.type, pricingConfig);

  const reviewLinesEl = document.getElementById('reviewQuoteLines');
  if (reviewLinesEl) {
    reviewLinesEl.innerHTML = (reviewQuote.lines || []).map(line => `
      <div class="review-total-row" style="margin-bottom: 0.4rem;">
        <span>${line.name} ${line.formula ? `<small style="color: #64748b;">(${line.formula})</small>` : ''}</span>
        <strong style="font-weight: 500; color: #212e34;">${formatPeso(line.amount)}</strong>
      </div>
    `).join('');
  }

  const reviewTotalEl = document.getElementById('reviewTotalVal');
  const reviewDpLabelEl = document.getElementById('reviewDpLabel');
  const reviewDpValEl = document.getElementById('reviewDpVal');
  const reviewBalanceValEl = document.getElementById('reviewBalanceVal');

  if (reviewTotalEl) reviewTotalEl.textContent = formatPeso(reviewQuote.knownTotal);
  if (reviewDpLabelEl) reviewDpLabelEl.textContent = reviewDpInfo.label;
  if (reviewDpValEl) reviewDpValEl.textContent = formatPeso(reviewDpInfo.downpayment);
  if (reviewBalanceValEl) reviewBalanceValEl.textContent = formatPeso(reviewDpInfo.balance);

  // Checklist per type
  if (checklist) {
    if (isTrays) {
      checklist.innerHTML = `
        <fieldset class="fieldset" style="border:none; padding:0; margin:0;">
          <legend class="sr-only">Food Tray Agreement Checklist</legend>
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree1" required>
              <label for="chkAgree1">I verify that my tray selections and quantities are accurate.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree2" required>
              <label for="chkAgree2">I confirm the delivery date, time, and recipient contact details.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree3" required>
              <label for="chkAgree3">I understand that 100% full payment is required to prepare and dispatch food tray orders.</label>
            </div>
          <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--color-slate-15, #e2e8f0); display: flex; gap: 1.25rem; font-size: 11px; flex-wrap: wrap;">
            <button type="button" class="btn-read-cancel-policy" style="background: none; border: none; padding: 0; color: var(--color-rust); text-decoration: underline; cursor: pointer; font-size: 11px; font-weight: 600;">
              Read Cancellation Policy
            </button>
            <button type="button" class="btn-read-damage-policy" style="background: none; border: none; padding: 0; color: var(--color-rust); text-decoration: underline; cursor: pointer; font-size: 11px; font-weight: 600;">
              Read Damage &amp; Loss Policy
            </button>
          </div>
        </fieldset>
      `;
      if (reserveBtnText) reserveBtnText.textContent = 'Submit Food Tray Order';
    } else if (isFood) {
      checklist.innerHTML = `
        <fieldset class="fieldset" style="border:none; padding:0; margin:0;">
          <legend class="sr-only">Food Package Agreement Checklist</legend>
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree1" required>
              <label for="chkAgree1">I verify that the chosen menu dishes reflect my requirements.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree2" required>
              <label for="chkAgree2">I verify that the guest count and target celebration date are correct.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree3" required>
              <label for="chkAgree3">I acknowledge that a 50% downpayment confirms the date hold within 48 hours.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree4" required>
              <label for="chkAgree4">I understand the remaining balance is due at least 7 days before event day.</label>
            </div>
          </div>
          <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--color-slate-15, #e2e8f0); display: flex; gap: 1.25rem; font-size: 11px; flex-wrap: wrap;">
            <button type="button" class="btn-read-cancel-policy" style="background: none; border: none; padding: 0; color: var(--color-rust); text-decoration: underline; cursor: pointer; font-size: 11px; font-weight: 600;">
              Read Cancellation Policy
            </button>
            <button type="button" class="btn-read-damage-policy" style="background: none; border: none; padding: 0; color: var(--color-rust); text-decoration: underline; cursor: pointer; font-size: 11px; font-weight: 600;">
              Read Damage &amp; Loss Policy
            </button>
          </div>
        </fieldset>
      `;
      if (reserveBtnText) reserveBtnText.textContent = 'Reserve My Date (Start 48-Hour Hold)';
    } else {
      // Event package checklist
      checklist.innerHTML = `
        <fieldset class="fieldset" style="border:none; padding:0; margin:0;">
          <legend class="sr-only">Event Reservation Agreement Checklist</legend>
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree1" required>
              <label for="chkAgree1">I confirm that the selected package, menu items, and add-ons reflect my event requirements.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree2" required>
              <label for="chkAgree2">I verify that the celebration date, guest count, and schedule are accurate.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree3" required>
              <label for="chkAgree3">I acknowledge that a 50% downpayment confirms the date within 48 hours.</label>
            </div>
            <div class="choice choice--check">
              <input type="checkbox" id="chkAgree4" required>
              <label for="chkAgree4">I understand the remaining balance is due at least 7 days before the event.</label>
            </div>
          </div>
          <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--color-slate-15, #e2e8f0); display: flex; gap: 1.25rem; font-size: 11px; flex-wrap: wrap;">
            <button type="button" class="btn-read-cancel-policy" style="background: none; border: none; padding: 0; color: var(--color-rust); text-decoration: underline; cursor: pointer; font-size: 11px; font-weight: 600;">
              Read Cancellation Policy
            </button>
            <button type="button" class="btn-read-damage-policy" style="background: none; border: none; padding: 0; color: var(--color-rust); text-decoration: underline; cursor: pointer; font-size: 11px; font-weight: 600;">
              Read Damage &amp; Loss Policy
            </button>
          </div>
        </fieldset>
      `;
      if (reserveBtnText) reserveBtnText.textContent = 'Reserve My Date (Start 48-Hour Hold)';
    }

    checklist.querySelectorAll('.btn-read-cancel-policy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const settings = await mockApi.getSettings();
        openPolicyModal({
          title: 'Cancellation & Refund Policy',
          policyText: settings.cancellationPolicy,
          version: settings.policyVersion
        });
      });
    });

    checklist.querySelectorAll('.btn-read-damage-policy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const settings = await mockApi.getSettings();
        openPolicyModal({
          title: 'Equipment Care, Damage & Loss Policy',
          policyText: settings.damagePolicy,
          version: settings.policyVersion
        });
      });
    });
  }
}


/* --------------------------------------------------------------------------
   Live Quote Computation
   -------------------------------------------------------------------------- */
function recalculateQuote() {
  const quoteLinesEl = document.getElementById('quoteLinesList');
  const subtotalVal = document.getElementById('quoteSubtotalVal');
  const grandTotalVal = document.getElementById('quoteGrandTotalVal');
  const dpVal = document.getElementById('quoteDownpaymentVal');
  const dpLabel = document.getElementById('dpLabel');
  const balanceVal = document.getElementById('quoteBalanceVal');
  const estimateNotice = document.getElementById('quoteEstimateNotice');
  const paxBadge = document.getElementById('quoteLivePaxBadge');

  const mobileTotalVal = document.getElementById('mobileQuoteTotalVal');
  const mobileDpVal = document.getElementById('mobileQuoteDpVal');
  const mobileSheetBody = document.getElementById('mobileQuoteSheetBody');
  const mobileSheetFooter = document.getElementById('mobileQuoteSheetFooter');

  if (!studioState.type) {
    if (subtotalVal) subtotalVal.textContent = '\u20B10';
    if (grandTotalVal) grandTotalVal.textContent = '\u20B10';
    if (dpVal) dpVal.textContent = '\u20B10';
    if (balanceVal) balanceVal.textContent = '\u20B10';
    if (mobileTotalVal) mobileTotalVal.textContent = '\u20B10';
    if (mobileDpVal) mobileDpVal.textContent = '(50% DP: \u20B10)';
    return;
  }

  const isTrays = studioState.type === 'trays';
  const isFood = studioState.type === 'food';
  const isEvent = studioState.type === 'event';
  const totalTrays = studioState.trays.reduce((sum, t) => sum + (t.qty || t.quantity || 1), 0);

  // Effective pax: if event or food without date or pax, pax is 0 until date/pax set
  const effectivePax = isTrays ? 0 : ((studioState.date && studioState.pax) ? studioState.pax : 0);

  const pkgObj = packagesData.find(p => p.id === studioState.packageId) || packagesData[0];
  const quote = computeQuote({
    type: studioState.type,
    eventType: studioState.packageId || 'party',
    packageId: studioState.packageId,
    pax: effectivePax,
    level: studioState.level || 1,
    packageObj: pkgObj,
    dishes: studioState.selectedDishes,
    extraDishes: studioState.extraDishes,
    specialDishes: studioState.specialDishes,
    addOns: studioState.addOns,
    trays: studioState.trays
  });

  if (paxBadge) {
    paxBadge.textContent = isTrays ? `${totalTrays} Trays` : `${studioState.pax || 0} Guests`;
  }

  // Revision 18A Part 2.2: Directly render pure quote.lines with clear labels
  let linesHtml = '';
  (quote.lines || []).forEach(line => {
    linesHtml += `
      <div class="quote-line-row">
        <div class="quote-line-info">
          <span class="quote-line-name">${line.name}</span>
          ${line.formula ? `<span class="quote-line-formula" style="color: #64748b;">${line.formula}</span>` : ''}
        </div>
        <span class="quote-line-amt">${formatPeso(line.amount)}</span>
      </div>
    `;
  });
  if (quoteLinesEl) quoteLinesEl.innerHTML = linesHtml;

  // Revision 17B Part 2: Single central downpayment calculation function
  const dpInfo = computeDownpaymentAndBalance(quote.knownTotal, studioState.type, pricingConfig);
  const formattedSubtotal = formatPeso(quote.subtotal || quote.knownTotal);
  const formattedTotal = formatPeso(quote.knownTotal);
  const formattedDp = formatPeso(dpInfo.downpayment);
  const formattedBalance = formatPeso(dpInfo.balance);

  if (subtotalVal) subtotalVal.textContent = formattedSubtotal;
  if (grandTotalVal) grandTotalVal.textContent = formattedTotal;

  if (dpLabel) dpLabel.textContent = dpInfo.label;
  if (dpVal) dpVal.textContent = formattedDp;
  if (balanceVal) balanceVal.textContent = formattedBalance;

  if (estimateNotice) {
    estimateNotice.style.display = quote.flags?.usesEstimates ? 'block' : 'none';
  }

  if (mobileTotalVal) mobileTotalVal.textContent = formattedTotal;
  if (mobileDpVal) {
    mobileDpVal.textContent = isTrays
      ? '(Pay in full)'
      : `(${dpInfo.label}: ${formattedDp})`;
  }

  if (mobileSheetBody) {
    mobileSheetBody.innerHTML = (quote.lines || []).map(line => `
      <div class="quote-line-row">
        <div class="quote-line-info" style="display: flex; flex-direction: column; gap: 2px;">
          <span class="quote-line-name">${line.name}</span>
          ${line.formula ? `<span class="quote-line-formula" style="color: #64748b;">${line.formula}</span>` : ''}
        </div>
        <span class="quote-line-amt">${formatPeso(line.amount)}</span>
      </div>
    `).join('');
  }

  if (mobileSheetFooter) {
    mobileSheetFooter.innerHTML = `
      <div style="display:flex; justify-content:space-between; color:#64748b;">
        <span>Subtotal:</span>
        <span>${formattedSubtotal}</span>
      </div>
      <div style="display:flex; justify-content:space-between; color:#212e34;">
        <span style="font-weight: 500;">Total:</span>
        <span style="color:#ab4b2e; font-weight: 700; font-size: 32px;">${formattedTotal}</span>
      </div>
      <div style="display:flex; justify-content:space-between; color:#2f6f69; margin-top:0.25rem;">
        <span>${dpInfo.label}:</span>
        <span>${formattedDp}</span>
      </div>
      <div style="display:flex; justify-content:space-between; color:#212e34;">
        <span>Remaining Balance:</span>
        <span>${formattedBalance}</span>
      </div>
      <div style="color:#2f6f69; text-align:center; margin-top:0.35rem;">
        48-Hour Free Hold (Locks date upon submission)
      </div>
      ${quote.flags?.usesEstimates ? `
        <div style="color:#ab4b2e; font-style:italic; text-align:center;">
          Includes estimated prices, to be confirmed by Dack's
        </div>
      ` : ''}
    `;
  }

  updateStudioFloorplanPriceChip();
}

// Update the compact reservation price chip in the floor plan step.
function updateStudioFloorplanPriceChip() {
  const chip = document.getElementById('studioFloorplanPriceChip');
  if (!chip) return;
  const pkgObj = packagesData.find(p => p.id === studioState.packageId) || packagesData[0];
  const quote = computeQuote({
    type: studioState.type,
    eventType: studioState.packageId || 'party',
    packageId: studioState.packageId,
    pax: studioState.pax,
    level: studioState.level || 1,
    packageObj: pkgObj,
    dishes: studioState.selectedDishes,
    extraDishes: studioState.extraDishes,
    specialDishes: studioState.specialDishes,
    addOns: studioState.addOns,
    trays: studioState.trays
  });
  const dpInfo = computeDownpaymentAndBalance(quote.knownTotal, studioState.type, pricingConfig);
  chip.textContent = `Total ${formatPeso(quote.knownTotal)} \u00B7 Downpayment ${formatPeso(dpInfo.downpayment)}`;
}

function openQuoteBreakdownModal(quote) {
  const modal = document.getElementById('quoteBreakdownModal');
  const body = document.getElementById('quoteBreakdownBody');
  if (!modal || !body) return;

  body.innerHTML = (quote.lines || []).map(line => `
    <div class="breakdown-row">
      <div class="breakdown-info">
        <span class="breakdown-name">${line.name}</span>
        ${line.formula ? `<span class="breakdown-formula">${line.formula}</span>` : ''}
      </div>
      <span class="breakdown-amt">${formatPeso(line.amount)}</span>
    </div>
  `).join('');

  modal.style.display = 'flex';
}

function closeQuoteBreakdownModal() {
  const modal = document.getElementById('quoteBreakdownModal');
  if (modal) modal.style.display = 'none';
}

function saveCurrentDraft(immediate = false) {
  // Part 6: NOTHING is saved before Step 3. While the user is on Step 1 or Step 2 nothing is written to storage (state lives in memory only).
  if (currentStepIndex < 3 && (!studioState.furthestStep || studioState.furthestStep < 3)) {
    return;
  }
  if (!studioState.type) return;

  studioState.furthestStep = Math.max(currentStepIndex, Number(studioState.furthestStep) || 3);

  const draft = {
    type: studioState.type,
    packageId: studioState.packageId,
    level: studioState.level,
    pax: studioState.pax,
    date: studioState.date,
    venue: studioState.venue,
    dishes: studioState.selectedDishes,
    menu: studioState.selectedDishes,
    extraDishes: studioState.extraDishes,
    specialDishes: studioState.specialDishes,
    addOns: studioState.addOns,
    addons: studioState.addOns,
    skipped: studioState.skipped,
    stageText: studioState.stageText,
    layoutId: studioState.layoutId,
    floorPlan: studioState.floorPlan,
    layoutThumbnail: studioState.layoutThumbnail,
    trays: studioState.trays,
    details: studioState.details,
    step: currentStepIndex,
    furthestStep: studioState.furthestStep,
    pricingVersion: (pricingConfig && pricingConfig.pricingVersion) || 1
  };
  draftStore.updateDraft(draft, immediate);
}

function bindGlobalEvents() {
  const prevBtn = document.getElementById('btnWizardPrev');
  const nextBtn = document.getElementById('btnWizardNext');
  const reviewBackBtn = document.getElementById('btnReviewBack');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentStepIndex === 1) {
        if (startScreenCurrent === 2) {
          switchStartScreen(1, true);
        } else {
          const origin = sessionStorage.getItem('bookingOrigin') || 'index.html';
          window.location.href = origin;
        }
      } else if (currentStepIndex === 2) {
        currentStepIndex = 1;
        startScreenCurrent = (studioState.type === 'trays') ? 1 : 2;
        startScreenType = studioState.type || 'event';
        startScreenChoice = {
          type: studioState.type,
          packageId: studioState.packageId,
          level: studioState.level || 1
        };
        renderActiveStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        goToStep(currentStepIndex - 1);
      }
    });
  }

  if (reviewBackBtn) {
    reviewBackBtn.addEventListener('click', () => {
      if (currentStepIndex > 1) {
        goToStep(currentStepIndex - 1);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const currentStepId = stepSequence[currentStepIndex - 1];
      if (!isStepValid(currentStepId)) {
        showStepErrors(currentStepId);
        return;
      }
      if (currentStepIndex < stepSequence.length) {
        goToStep(currentStepIndex + 1);
      }
    });
  }

  // Prevent Enter key in text fields from submitting early
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit' && e.target.type !== 'button') {
      e.preventDefault();
    }
  });

  // Browser Back/Forward navigation between wizard steps
  window.addEventListener('popstate', (e) => {
    if (e.state && typeof e.state.stepIndex === 'number') {
      goToStep(e.state.stepIndex, false);
    }
  });

  // URL Hash navigation between start screens (#type and #package)
  window.addEventListener('hashchange', () => {
    if (!studioState.type) {
      if (window.location.hash === '#package') {
        if (startScreenCurrent !== 2) switchStartScreen(2, false);
      } else {
        if (startScreenCurrent !== 1) switchStartScreen(1, false);
      }
    }
  });

  // Mobile Quote Sheet
  const openSheetBtn = document.getElementById('btnOpenMobileQuoteSheet');
  const closeSheetBtn = document.getElementById('btnCloseMobileQuoteSheet');
  const sheetBackdrop = document.getElementById('mobileQuoteSheetBackdrop');
  const quoteSheet = document.getElementById('mobileQuoteSheet');

  if (openSheetBtn && quoteSheet) {
    openSheetBtn.addEventListener('click', () => {
      quoteSheet.style.display = 'flex';
    });
  }
  if (closeSheetBtn && quoteSheet) {
    closeSheetBtn.addEventListener('click', () => {
      quoteSheet.style.display = 'none';
    });
  }
  if (sheetBackdrop && quoteSheet) {
    sheetBackdrop.addEventListener('click', () => {
      quoteSheet.style.display = 'none';
    });
  }

  // Mobile Recap Toggle
  const recapToggle = document.getElementById('btnToggleMobileRecap');
  const chipsContainer = document.getElementById('recapChipsContainer');
  if (recapToggle && chipsContainer) {
    recapToggle.addEventListener('click', () => {
      const expanded = chipsContainer.classList.toggle('is-expanded');
      recapToggle.setAttribute('aria-expanded', String(expanded));
    });
  }

  // Details form live validation
  const detailsInputs = ['custName', 'custMobile', 'custMessengerName', 'trayDeliveryDate', 'custVenueAddress'];
  detailsInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        el.classList.remove('is-invalid');
        const nextErr = el.parentNode.querySelector('.field-inline-error');
        if (nextErr) nextErr.remove();

        if (id === 'custName') studioState.details.name = el.value.trim();
        if (id === 'custMobile') studioState.details.mobile = el.value.trim();
        if (id === 'custMessengerName') studioState.details.messengerName = el.value.trim();
        if (id === 'trayDeliveryDate') {
          studioState.date = el.value;
          studioState.details.date = el.value;
        }
        if (id === 'custVenueAddress') {
          studioState.details.venue = el.value.trim();
          studioState.venue = el.value.trim();
        }
        updateValidationUI();
        saveCurrentDraft();
      });
    }
  });

  const eventTimeEl = document.getElementById('eventTime');
  if (eventTimeEl) {
    eventTimeEl.addEventListener('change', () => {
      studioState.details.time = eventTimeEl.value;
      updateValidationUI();
      saveCurrentDraft();
    });
  }

  const fulfillmentEl = document.getElementById('fulfillmentSelect');
  if (fulfillmentEl) {
    fulfillmentEl.addEventListener('change', () => {
      studioState.details.fulfillment = fulfillmentEl.value;
      updateValidationUI();
      saveCurrentDraft();
    });
  }

  // Agreement checklist items change (Part 2: update only Reserve state without scrolling)
  const agreementContainer = document.getElementById('agreementChecklistContainer');
  if (agreementContainer) {
    agreementContainer.addEventListener('change', () => {
      const currentStepId = stepSequence[currentStepIndex - 1];
      const isValid = isStepValid(currentStepId);
      const reserveBtn = document.getElementById('btnReserveDateHold');
      if (reserveBtn && currentStepId === 'stepReview') {
        reserveBtn.disabled = !isValid;
      }
    });
  }

  // Stepper events for Guests
  const slider = document.getElementById('paxRangeInput');
  const numInput = document.getElementById('paxNumberInput');
  const incBtn = document.getElementById('btnIncPax');
  const decBtn = document.getElementById('btnDecPax');
  const quick10 = document.getElementById('btnQuick10Pax');
  const snapMsg = document.getElementById('paxSnapWarning');

  function updatePax(newVal, enforceMin = true) {
    const isEvent = studioState.type === 'event';
    const minVal = isEvent ? 100 : 1;

    let val = Number(newVal) || (isEvent ? 100 : 75);
    if (enforceMin && isEvent && val < 100) {
      val = 100;
      if (snapMsg) {
        snapMsg.style.display = 'block';
        setTimeout(() => { if (snapMsg) snapMsg.style.display = 'none'; }, 3500);
      }
    } else if (val < minVal) {
      val = minVal;
    }

    studioState.pax = val;
    if (slider && slider.value !== String(val)) slider.value = String(val);
    if (numInput && numInput.value !== String(val)) numInput.value = String(val);

    const unitEl = document.querySelector('.pax-unit');
    if (unitEl && isEvent) {
      unitEl.textContent = val >= 100 ? `${val} and counting` : 'Guests';
    }

    const liveRateEl = document.getElementById('paxLiveRateNote');
    if (liveRateEl && isEvent) {
      const isWedding = studioState.packageId === 'wedding';
      const extraRate = isWedding ? 280 : 250;
      liveRateEl.innerHTML = `+&#8369;${extraRate} per guest after 100`;
    }

    recalculateQuote();
    saveCurrentDraft();
  }

  if (slider) slider.oninput = () => updatePax(slider.value, true);
  if (numInput) {
    numInput.oninput = () => updatePax(numInput.value, false);
    numInput.onblur = () => updatePax(numInput.value, true);
  }
  if (incBtn) incBtn.onclick = () => updatePax((studioState.pax || 100) + 1, true);
  if (decBtn) decBtn.onclick = () => updatePax((studioState.pax || 100) - 1, true);
  if (quick10) quick10.onclick = () => updatePax((studioState.pax || 100) + 10, true);

  // Menu level selector tabs (event booking)
  const menuLevelContainer = document.getElementById('menuLevelSelector');
  if (menuLevelContainer) {
    menuLevelContainer.querySelectorAll('.menu-level-tab').forEach(tab => {
      tab.onclick = () => {
        const lvl = Number(tab.getAttribute('data-level'));
        studioState.level = lvl;
        renderMenuStep();
        updateValidationUI();
        recalculateQuote();
        saveCurrentDraft();
      };
    });
  }

  // Retry button for menu
const retryBtn = document.getElementById('btnRetryMenuLoad');
if (retryBtn) {
  retryBtn.onclick = async () => {
    try {
      const response = await fetch('/api/v1/catalog');

      if (!response.ok) {
        throw new Error(`Catalog API returned HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!result.success || !result.data) {
        throw new Error('Invalid catalog API response.');
      }

      menuData = (result.data.dishes || []).map(dish => ({
        ...dish,
        id: dish.code
      }));

      const errBox = document.getElementById('menuErrorContainer');
      if (errBox) errBox.style.display = 'none';

      renderMenuStep();
      updateValidationUI();
      recalculateQuote();
    } catch (e) {
      console.error('Menu retry failed:', e);
      showToast('Retry failed. Please check connection.', 'warning');
    }
  };
}

  // Quote breakdown modal close handlers (Part 2.5)
  const closeBreakdownBtn = document.getElementById('btnCloseBreakdownModal');
  const dismissBreakdownBtn = document.getElementById('btnDismissBreakdownModal');
  const breakdownModal = document.getElementById('quoteBreakdownModal');
  if (closeBreakdownBtn) closeBreakdownBtn.onclick = () => closeQuoteBreakdownModal();
  if (dismissBreakdownBtn) dismissBreakdownBtn.onclick = () => closeQuoteBreakdownModal();
  if (breakdownModal) {
    breakdownModal.onclick = (e) => {
      if (e.target === breakdownModal) closeQuoteBreakdownModal();
    };
  }

  // Review back button
  const btnRevBack = document.getElementById('btnReviewBack');
  if (btnRevBack) {
    btnRevBack.onclick = () => {
      if (currentStepIndex > 1) goToStep(currentStepIndex - 1);
    };
  }

  // Confirmation screen button bindings (Part 1)
  const btnConfirmBack = document.getElementById('btnConfirmationBack');
  if (btnConfirmBack) {
    btnConfirmBack.onclick = () => {
      window.location.href = sessionStorage.getItem('bookingOrigin') || 'index.html';
    };
  }
  const btnConfirmHome = document.getElementById('btnConfirmBackHome');
  if (btnConfirmHome) {
    btnConfirmHome.onclick = (e) => {
      e.preventDefault();
      window.location.href = 'index.html';
    };
  }

  // Confirm reservation / Order submission with double booking protection
  const reserveBtn = document.getElementById('btnReserveDateHold');
  if (reserveBtn) {
    reserveBtn.onclick = async () => {
      if (!isStepValid('stepReview')) {
        showToast('Please check all agreement conditions to confirm your booking.', 'warning');
        return;
      }

      reserveBtn.disabled = true;
      reserveBtn.textContent = 'Processing reservation...';

      try {
        const isTrays = studioState.type === 'trays';
        const isFood = studioState.type === 'food';
        const isEvent = studioState.type === 'event';
        const pkgObj = packagesData.find(p => p.id === studioState.packageId) || packagesData[0];
        const totalTrays = studioState.trays.reduce((sum, t) => sum + (t.qty || t.quantity || 1), 0);

        const quote = computeQuote({
          type: studioState.type,
          eventType: studioState.packageId || 'party',
          packageId: studioState.packageId,
          pax: studioState.pax,
          level: studioState.level || 1,
          dishes: studioState.selectedDishes,
          extraDishes: studioState.extraDishes,
          specialDishes: studioState.specialDishes,
          addOns: studioState.addOns,
          trays: studioState.trays
        });

        const newBooking = await mockApi.createBooking({
          type: studioState.type,
          packageId: studioState.packageId,
          packageName: isEvent ? (pkgObj?.name || 'Event') : `Food Package ${studioState.level}`,
          level: studioState.level,
          pax: studioState.pax,
          eventDate: studioState.date || mockApi.getRelativeDateString(14),
          eventTime: studioState.details.time,
          customerName: studioState.details.name || 'Valued Client',
          mobile: studioState.details.mobile || '0917-000-0000',
          contactMethod: studioState.details.contactMethod,
          messengerName: studioState.details.messengerName,
          venue: studioState.details.venue,
          notes: studioState.details.notes,
          dishes: studioState.selectedDishes,
          extraDishes: studioState.extraDishes,
          specialDishes: studioState.specialDishes,
          addOns: studioState.addOns,
          skipped: studioState.skipped,
          stageText: studioState.stageText,
          layoutId: studioState.layoutId,
          floorPlan: studioState.floorPlan,
          layoutThumbnail: studioState.layout?.thumbnail || studioState.layoutThumbnail,
          layout: studioState.layoutStatus === 'confirmed' ? studioState.layout : null,
          trays: studioState.trays,
          total: quote.knownTotal,
          subtotal: quote.subtotal,
          downpaymentRequired: computeDownpaymentAndBalance(quote.knownTotal, studioState.type, pricingConfig).downpayment,
          balance: computeDownpaymentAndBalance(quote.knownTotal, studioState.type, pricingConfig).balance
        });

        const bookingType = newBooking.type;
        const isTraysBooking = bookingType === 'trays';
        const isEventBooking = bookingType === 'event';
        const isFoodBooking = bookingType === 'food';
        const responseTotal = newBooking.total;
        const bookingTotal = responseTotal !== null &&
          responseTotal !== undefined &&
          Number.isFinite(Number(responseTotal))
          ? Number(responseTotal)
          : quote.knownTotal;
        const dpInfo = computeDownpaymentAndBalance(bookingTotal, bookingType, pricingConfig);

        // Clear active draft after successful booking (keep tikim.lastBooking for track page)
        localStorage.setItem('tikim.lastBooking', JSON.stringify(newBooking));
        localStorage.removeItem('tikim.trays');
        localStorage.removeItem('tikim.trayCart');
        window.dispatchEvent(new CustomEvent('tikim:trays-updated'));
        studioState.type = null;
        studioState.trays = [];
        await draftStore.reset();

        // Hide tab tracker, layout container, mobile quote bar
        const tracker = document.getElementById('studioTabTracker');
        if (tracker) tracker.style.display = 'none';
        const layoutWrap = document.querySelector('.studio-layout-container');
        if (layoutWrap) layoutWrap.style.display = 'none';
        const mobileBar = document.getElementById('mobileQuoteBottomBar');
        if (mobileBar) mobileBar.style.display = 'none';

        // Render Confirmation Screen (Part 1)
        const confirmScreen = document.getElementById('bookingConfirmationScreen');
        const refCodeEl = document.getElementById('confirmRefCode');
        const summaryTypeEl = document.getElementById('confirmSummaryType');
        const summaryDateEl = document.getElementById('confirmSummaryDate');
        const summaryGuestsEl = document.getElementById('confirmSummaryGuests');
        const summaryTotalEl = document.getElementById('confirmSummaryTotal');
        const summaryDpEl = document.getElementById('confirmSummaryDownpayment');
        const summaryDpLabelEl = document.getElementById('confirmSummaryDpLabel');
        const summaryDeadlineEl = document.getElementById('confirmSummaryDeadline');
        const confirmLeadEl = confirmScreen?.querySelector('.confirmation-lead');
        const paymentInstructionEl = confirmScreen?.querySelector('.confirmation-steps-list li');
        const btnTrack = document.getElementById('btnConfirmTrackBooking');

        if (refCodeEl) refCodeEl.textContent = newBooking.ref;
        if (summaryTypeEl) {
          summaryTypeEl.textContent = newBooking.packageName ||
            (isEventBooking ? (pkgObj?.name || 'Event Package') :
              (isFoodBooking ? `Food Package ${newBooking.level || studioState.level}` : 'Food Trays'));
        }
        if (summaryDateEl) summaryDateEl.textContent = newBooking.eventDate || newBooking.deliveryDate || studioState.date || 'Target date pending';
        if (summaryGuestsEl) {
          summaryGuestsEl.textContent = isTraysBooking ? `${totalTrays} trays` : `${newBooking.pax || studioState.pax} guests`;
        }
        if (summaryTotalEl) summaryTotalEl.textContent = formatPeso(bookingTotal);
        if (summaryDpEl) {
          summaryDpEl.textContent = formatPeso(newBooking.downpaymentRequired ?? dpInfo.downpayment);
        }
        if (summaryDpLabelEl) {
          summaryDpLabelEl.textContent = isTraysBooking ? 'Full Payment (100%)' : dpInfo.label;
        }
        if (summaryDeadlineEl) {
          const deadlineTile = summaryDeadlineEl.closest('.summary-tile');
          if (deadlineTile) deadlineTile.style.display = isTraysBooking ? 'none' : '';
          if (!isTraysBooking) summaryDeadlineEl.textContent = '48 Hours Remaining';
        }
        if (confirmLeadEl) {
          confirmLeadEl.textContent = isTraysBooking
            ? 'Full payment (100%) is required to complete your food tray order.'
            : 'Your 48-hour free date hold is active. Please complete the downpayment to confirm your celebration.';
        }
        if (paymentInstructionEl) {
          paymentInstructionEl.innerHTML = isTraysBooking
            ? '<strong>Submit full payment:</strong> Pay 100% of the total using the payment options shown on the booking tracker.'
            : '<strong>Submit downpayment:</strong> Transfer 50% via GCash or BDO within 48 hours to confirm your reservation hold.';
        }
        if (btnTrack) {
          btnTrack.href = `track.html?ref=${encodeURIComponent(newBooking.ref)}`;
        }

        // Copy reference button
        const btnCopy = document.getElementById('btnCopyRefCode');
        if (btnCopy) {
          btnCopy.onclick = () => {
            navigator.clipboard.writeText(newBooking.ref).then(() => {
              showToast('Reference number copied to clipboard', 'success');
            }).catch(() => {
              showToast(`Reference: ${newBooking.ref}`, 'info');
            });
          };
        }

        if (confirmScreen) {
          confirmScreen.style.display = 'grid';
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        console.error('Failed to create booking:', err);
        showToast('Reservation error. Please try again.', 'error');
        reserveBtn.disabled = false;
        reserveBtn.textContent = 'Reserve My Date (Start 48-Hour Hold)';
      }
    };
  }

  // Reservation confirmation modal bindings
  const confirmModal = document.getElementById('reservationConfirmModal');
  const btnCancelConfirm = document.getElementById('btnCancelConfirmModal');
  const btnDismissConfirm = document.getElementById('btnDismissConfirmModal');
  const btnProceedConfirm = document.getElementById('btnProceedConfirmModal');

  if (btnCancelConfirm) btnCancelConfirm.onclick = () => closeStartReservationModal();
  if (btnDismissConfirm) btnDismissConfirm.onclick = () => closeStartReservationModal();
  if (btnProceedConfirm) btnProceedConfirm.onclick = () => confirmStartReservation();
  if (confirmModal) {
    confirmModal.onclick = (e) => {
      if (e.target === confirmModal) closeStartReservationModal();
    };
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('reservationConfirmModal');
      if (modal && modal.classList.contains('open')) {
        closeStartReservationModal();
      }
      closeQuoteBreakdownModal();
    }
  });

  // Print button
  const printBtn = document.getElementById('btnPrintStudioQuote');
  if (printBtn) {
    printBtn.onclick = () => window.print();
  }

  // Trays synchronization across pages and tabs
  const handleTraysSync = () => {
    studioState.trays = getStoredTrays();
    const currentStepId = stepSequence[currentStepIndex - 1];
    if (currentStepId === 'stepTrays') {
      const container = document.getElementById('traysCatalogContainer');
      if (container) {
        traysData.forEach(dish => {
          const item = studioState.trays.find(t => t.id === dish.id || t.name === dish.name);
          const qty = item ? (item.qty || item.quantity || 0) : 0;
          const qtyEl = document.getElementById(`tray-qty-${dish.id}`);
          const rowEl = document.querySelector(`.tray-catalog-row[data-id="${dish.id}"]`);
          const decBtn = rowEl ? rowEl.querySelector('.btn-tray-step-dec') : null;
          if (qtyEl) qtyEl.textContent = String(qty);
          if (decBtn) decBtn.disabled = (qty === 0);
        });
        updateStudioTraysTotal();
      }
    }
    recalculateQuote();
    renderTabTracker();
  };

  window.addEventListener('storage', (e) => {
    if (e.key === 'tikim.trays' || e.key === 'tikim.trayCart') {
      handleTraysSync();
    }
  });
  window.addEventListener('tikim:trays-updated', handleTraysSync);
  window.addEventListener('tikim:draft-changed', handleTraysSync);
}
