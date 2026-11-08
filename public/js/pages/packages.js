/**
 * TIKIM Packages Page Logic
 * Renders Package Deal posters with dynamic tier selection, catering packages,
 * interactive booking computation modal with add-ons compiler, and leader-dots board.
 */

import { computeQuote, getPackageAddOns, setPricingConfig } from '../pricing.js';
import { showToast, checkActiveQuoteAndHold, openMyEventDrawer } from '../layout.js';

let pricingData = null;
const packageLevels = {
  wedding: 1,
  party: 1,
  birthday: 1,
  corporate: 1,
  reunion: 1,
  other: 1
};

const LABELS = {
  wedding: "For weddings",
  party: "For parties",
  birthday: "For birthdays",
  corporate: "For corporate events",
  reunion: "For clan reunions",
  other: "For special milestones"
};

const CATERING_LABELS = {
  1: "Essential buffet",
  2: "Classic feast",
  3: "Grand spread"
};

const TIER_DISH_RULES = {
  1: "(1 Chicken or Fish, 1 Beef or Pork, 1 Pasta, 1 Vegetables)",
  2: "(1 Chicken, 1 Fish, 1 Beef or Pork, 1 Pasta, 1 Vegetables)",
  3: "(1 Chicken, 1 Fish, 1 Beef, 1 Pork, 1 Pasta, 1 Vegetables)"
};

async function init() {
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

    // Convert database event packages to the pricing engine's format.
    const eventPackages = (data.eventPackages || []).map(pkg => ({
      ...pkg,
      id: pkg.code,
      price: Number(pkg.base_price),
      basePax: Number(pkg.base_guests),
      extraPerHead: Number(pkg.extra_guest_price),
      priceStatus: pkg.price_status
    }));

    // Convert database food packages to the existing tier format.
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

    // Combine database catalog records with the existing pricing rules.
    pricingData = {
      ...pricingRules,
      eventPackages,
      levels,
      addOns
    };

    // Make the database-backed configuration available to computeQuote().
    setPricingConfig(pricingData);

    // Check saved draft for any pre-selected event and level.
    try {
      const rawDraft = localStorage.getItem('tikim.draft');

      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        const ev = (draft.event || draft.eventType || draft.packageId || '').toLowerCase();

        if (ev && packageLevels[ev] !== undefined && draft.level) {
          packageLevels[ev] = Number(draft.level) || 1;
        }
      }
    } catch (e) {}

    renderEventPosters();
    renderCateringPosters();
    renderAddonsBoard();
    setupAddonModal();
    handleDeepLinks();

  } catch (err) {
    console.error('Failed to initialize packages page:', err);
  }
}

function parseInclusionText(inc) {
  if (inc.startsWith('Catering service')) {
    return {
      title: 'CATERING SERVICE',
      sublines: [
        '(Choose menu Package 1, 2 or 3)',
        '(Utensils, waiters, food attendants, ice, rice, tables and chairs, basic set up, dessert, drinks)'
      ],
      isCatering: true
    };
  }

  const match = inc.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    return {
      title: match[1].trim().toUpperCase(),
      sublines: [`(${match[2].trim()})`],
      isCatering: false
    };
  }

  return {
    title: inc.trim().toUpperCase(),
    sublines: [],
    isCatering: false
  };
}

function computePackageTierPrice(key, level) {
  const quote = computeQuote({
    plan: 'allin',
    packageId: key,
    level: Number(level) || 1,
    eventType: key,
    pax: 100
  });
  return quote.knownTotal;
}

function renderEventPosters() {
  const grid = document.getElementById('eventPostersGrid');
  if (!grid || !pricingData) return;

  const eventOrder = ['wedding', 'party', 'birthday', 'corporate', 'reunion', 'other'];
  const packagesMap = {};
  (pricingData.eventPackages || []).forEach(p => {
    packagesMap[p.id || p.occasion] = p;
  });

  grid.innerHTML = eventOrder.map(key => {
    const pkg = packagesMap[key] || { id: key, name: key.toUpperCase(), price: 55000, basePax: 100, extraPerHead: 250 };
    const label = LABELS[key] || `For ${key}`;
    const isWedding = key === 'wedding';
    const extraRate = isWedding ? 280 : 250;
    const isEstimate = pkg.priceStatus === 'estimate';
    const currentLvl = packageLevels[key] || 1;
    const tierPrice = computePackageTierPrice(key, currentLvl);

    const nonCateringInclusions = (pkg.inclusions || [])
      .filter(inc => !inc.startsWith('Catering service'))
      .map(parseInclusionText);

    return `
      <div class="poster-wrapper" id="poster-wrap-${key}">
        <div class="poster-label">${label}</div>
        <article class="poster-card" id="poster-${key}" data-occasion="${key}">
          <!-- Header Bar -->
          <div class="poster-header">
            <h3 class="poster-name">${pkg.name || key + ' Package'}</h3>
            <div class="poster-price-wrap" id="poster-price-wrap-${key}">
              <span class="poster-price" id="poster-price-${key}">&#8369;${Number(tierPrice).toLocaleString('en-PH')}</span>
              ${isEstimate ? '<span class="est-tag" title="Estimated price, to be confirmed by Dack\'s">est.</span>' : ''}
            </div>
          </div>

          <!-- INCLUSIONS on dark board -->
          <div class="poster-inclusions-bar">INCLUSIONS</div>

          <!-- Stone Panel -->
          <div class="poster-stone-panel">
            
            <!-- Catering Service Block with Interactive Package 1, 2, or 3 Selector -->
            <div class="inclusion-block inclusion-catering-block">
              <div class="inclusion-title">CATERING SERVICE</div>
              <div class="poster-tier-selector" role="radiogroup" aria-label="Menu Package Tier for ${pkg.name}">
                <button type="button" class="tier-pill ${currentLvl === 1 ? 'active' : ''}" data-key="${key}" data-level="1" title="Package 1: 4 dishes included">
                  Pkg 1 <span class="tier-sub">4 dishes</span>
                </button>
                <button type="button" class="tier-pill ${currentLvl === 2 ? 'active' : ''}" data-key="${key}" data-level="2" title="Package 2: 5 dishes (+₱2,000 for 100 pax)">
                  Pkg 2 <span class="tier-sub">5 dishes (+&#8369;2k)</span>
                </button>
                <button type="button" class="tier-pill ${currentLvl === 3 ? 'active' : ''}" data-key="${key}" data-level="3" title="Package 3: 6 dishes (+₱5,000 for 100 pax)">
                  Pkg 3 <span class="tier-sub">6 dishes (+&#8369;5k)</span>
                </button>
              </div>
              <span class="inclusion-sub tier-dish-rule" id="tier-rule-${key}">${TIER_DISH_RULES[currentLvl]}</span>
              <span class="inclusion-sub">(Utensils, waiters, food attendants, ice, rice, tables &amp; chairs, basic set up, dessert, drinks)</span>
            </div>

            <!-- Other tailored inclusions -->
            ${nonCateringInclusions.map(inc => `
              <div class="inclusion-block">
                ${inc.title}
                ${inc.sublines.map(s => `<span class="inclusion-sub">${s}</span>`).join('')}
              </div>
            `).join('')}
          </div>

          <!-- Footer Bar -->
          <div class="poster-footer">
            GOOD FOR 100 PAX
            <span class="poster-footer-sub">(ADDITIONAL &#8369;${extraRate} PER HEAD IF MORE THAN 100 PAX)</span>
          </div>
        </article>

        <!-- Actions -->
        <div class="poster-actions">
          <a href="studio.html?type=event&package=${key}&level=${currentLvl}" class="btn-poster-customize" id="btn-customize-${key}">
            Book now &rarr;
          </a>
          <button type="button" class="btn-poster-addons" data-occasion="${key}" data-name="${pkg.name}" id="btn-addons-${key}">
            See add-ons &amp; Quick Quote
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Wire up tier pills on poster cards
  grid.querySelectorAll('.tier-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = pill.getAttribute('data-key');
      const level = Number(pill.getAttribute('data-level')) || 1;
      updatePosterTier(key, level);
    });
  });
}

function updatePosterTier(key, level) {
  packageLevels[key] = level;

  // Update pills active state
  const wrap = document.getElementById(`poster-wrap-${key}`);
  if (!wrap) return;

  wrap.querySelectorAll('.tier-pill').forEach(btn => {
    const l = Number(btn.getAttribute('data-level'));
    if (l === level) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update price
  const priceEl = document.getElementById(`poster-price-${key}`);
  if (priceEl) {
    const tierPrice = computePackageTierPrice(key, level);
    priceEl.innerHTML = `&#8369;${Number(tierPrice).toLocaleString('en-PH')}`;
  }

  // Update dish rule subline
  const ruleEl = document.getElementById(`tier-rule-${key}`);
  if (ruleEl) {
    ruleEl.textContent = TIER_DISH_RULES[level] || TIER_DISH_RULES[1];
  }

  // Update customize link
  const customizeBtn = document.getElementById(`btn-customize-${key}`);
  if (customizeBtn) {
    customizeBtn.href = `studio.html?type=event&package=${key}&level=${level}`;
  }
}

function renderCateringPosters() {
  const grid = document.getElementById('cateringPostersGrid');
  if (!grid || !pricingData) return;

  const levels = pricingData.levels || [];
  const inclusions = pricingData.cateringInclusions || [
    "Utensils", "Waiters", "Food attendants", "Ice", "Java or plain rice", "Tables and chairs", "Basic set up", "Dessert", "Drinks"
  ];
  const alsoIncluded = inclusions.join(', ');

  const dishSlotsMap = {
    1: { title: "4 DELICIOUS DISHES", sub: "(1 Chicken or Fish, 1 Beef or Pork, 1 Pasta, 1 Vegetables)" },
    2: { title: "5 HEARTY DISHES", sub: "(1 Chicken, 1 Fish, 1 Beef or Pork, 1 Pasta, 1 Vegetables)" },
    3: { title: "6 GRAND FIESTA DISHES", sub: "(1 Chicken, 1 Fish, 1 Beef, 1 Pork, 1 Pasta, 1 Vegetables)" }
  };

  grid.innerHTML = levels.map(lvl => {
    const slot = dishSlotsMap[lvl.level] || { title: `${lvl.dishes} DISHES`, sub: "" };
    const label = CATERING_LABELS[lvl.level] || `Package ${lvl.level}`;
    const weddingRate = lvl.perHead + (pricingData.weddingSurchargePerHead || 20);

    return `
      <div class="poster-wrapper" id="poster-wrap-package-${lvl.level}">
        <div class="poster-label">${label}</div>
        <article class="poster-card" id="poster-package-${lvl.level}">
          <!-- Header Bar -->
          <div class="poster-header">
            <h3 class="poster-name">${lvl.name}</h3>
            <div class="poster-price">&#8369;${lvl.perHead} PER HEAD</div>
          </div>

          <!-- INCLUSIONS on dark board -->
          <div class="poster-inclusions-bar">INCLUSIONS</div>

          <!-- Stone Panel -->
          <div class="poster-stone-panel">
            <div class="inclusion-block">
              ${slot.title}
              <span class="inclusion-sub">${slot.sub}</span>
            </div>

            <div class="inclusion-block">
              ALSO INCLUDED
              <span class="inclusion-sub">${alsoIncluded}</span>
            </div>
          </div>

          <!-- Footer Bar -->
          <div class="poster-footer">
            WEDDING RATE &#8369;${weddingRate} PER HEAD
            <span class="poster-footer-sub">MINIMUM 75 PAX. UNDER 75: FLAT &#8369;15,000</span>
          </div>
        </article>

        <!-- Actions -->
        <div class="poster-actions">
          <a href="studio.html?type=food&level=${lvl.level}" class="btn-poster-customize">
            Book now &rarr;
          </a>
          <button type="button" class="btn-poster-addons" data-occasion="party" data-name="${lvl.name}">
            See add-ons &amp; Quick Quote
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAddonsBoard() {
  const container = document.getElementById('addonsMenuLayout');
  if (!container || !pricingData) return;

  const catalog = pricingData.addOns || [];

  const groups = [
    { title: "All Events", filter: item => item.occasions?.includes('all') },
    { title: "Wedding", filter: item => item.occasions?.includes('wedding') },
    { title: "Party", filter: item => item.occasions?.includes('party') },
    { title: "Birthday", filter: item => item.occasions?.includes('birthday') },
    { title: "Corporate", filter: item => item.occasions?.includes('corporate') },
    { title: "Reunion", filter: item => item.occasions?.includes('reunion') },
    { title: "Special Occasion", filter: item => item.occasions?.includes('other') }
  ];

  const formatPrice = (item) => {
    if (item.price === null || item.price === undefined) {
      return `Price on request`;
    }
    const val = `&#8369;${Number(item.price).toLocaleString('en-PH')}`;
    const suffix = item.type === 'per_head' ? ' per guest' : (item.type === 'per_unit' ? ' each' : '');
    const estChip = item.priceStatus === 'estimate' ? `<span class="est-tag" title="Estimated price, to be confirmed by Dack's">est.</span>` : '';
    return `${val}${suffix} ${estChip}`;
  };

  // Read active draft to reflect current selection
  let activeAddonIds = [];
  try {
    const raw = localStorage.getItem('tikim.draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.addons)) {
        activeAddonIds = d.addons.map(a => typeof a === 'string' ? a : a.id);
      }
    }
  } catch (e) {}

  const groupHtml = groups.map(g => {
    const items = catalog.filter(g.filter);
    if (!items.length) return '';

    return `
      <div class="addon-category-block">
        <h3 class="addon-cat-heading">${g.title}</h3>
        ${items.map(item => {
          const isAdded = activeAddonIds.includes(item.id);
          return `
          <div class="addon-row">
            <span class="addon-name">${item.label}</span>
            <span class="addon-dots" aria-hidden="true"></span>
            <span class="addon-price-val">${formatPrice(item)}</span>
            <button type="button" class="btn-quick-add-addon ${isAdded ? 'is-added' : ''}" data-id="${item.id}" data-label="${item.label}">
              ${isAdded ? 'Added' : '+ Add'}
            </button>
          </div>
        `;
        }).join('')}
      </div>
    `;
  }).join('');

  const stageSetupHtml = `
    <div class="addon-category-block">
      <h3 class="addon-cat-heading">Stage Set Up &amp; Upgrades</h3>
      <div class="addon-row">
        <span class="addon-name">Wooden chair stage variant</span>
        <span class="addon-dots" aria-hidden="true"></span>
        <span class="addon-price-val">&#8369;5,000 <span class="est-tag" title="Estimated price, to be confirmed by Dack's">est.</span></span>
      </div>
      <div class="addon-row">
        <span class="addon-name">Couch stage variant</span>
        <span class="addon-dots" aria-hidden="true"></span>
        <span class="addon-price-val">&#8369;6,000 <span class="est-tag" title="Estimated price, to be confirmed by Dack's">est.</span></span>
      </div>
    </div>
  `;

  const extraDishesHtml = `
    <div class="addon-category-block">
      <h3 class="addon-cat-heading">Extra Dishes (Per Guest)</h3>
      <div class="addon-row">
        <span class="addon-name">Chicken, Fish, Pasta, or Vegetables</span>
        <span class="addon-dots" aria-hidden="true"></span>
        <span class="addon-price-val">&#8369;30 per guest</span>
      </div>
      <div class="addon-row">
        <span class="addon-name">Beef or Pork</span>
        <span class="addon-dots" aria-hidden="true"></span>
        <span class="addon-price-val">&#8369;35 per guest</span>
      </div>
      <div class="addon-row">
        <span class="addon-name">Special Dishes (Shrimp Tempura, etc.)</span>
        <span class="addon-dots" aria-hidden="true"></span>
        <span class="addon-price-val">Price on request</span>
      </div>
    </div>
  `;

  container.innerHTML = groupHtml + stageSetupHtml + extraDishesHtml;

  // Wire up quick add buttons on board
  container.querySelectorAll('.btn-quick-add-addon').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const label = btn.getAttribute('data-label') || id;
      toggleAddonInDraft(id, label, btn);
    });
  });

  // Re-sync button states if draft updates from modal or drawer
  window.addEventListener('tikim:draft-updated', () => {
    try {
      const raw = localStorage.getItem('tikim.draft');
      const d = raw ? JSON.parse(raw) : {};
      const currentIds = Array.isArray(d.addons) ? d.addons.map(a => typeof a === 'string' ? a : a.id) : [];
      container.querySelectorAll('.btn-quick-add-addon').forEach(btn => {
        const id = btn.getAttribute('data-id');
        const isAdded = currentIds.includes(id);
        btn.classList.toggle('is-added', isAdded);
        btn.textContent = isAdded ? 'Added' : '+ Add';
      });
    } catch (e) {}
  });
}

function toggleAddonInDraft(id, label, btn) {
  let draft = {};
  try {
    const raw = localStorage.getItem('tikim.draft');
    if (raw) draft = JSON.parse(raw);
  } catch (e) {}

  if (!Array.isArray(draft.addons)) draft.addons = [];

  const existingIdx = draft.addons.findIndex(a => (typeof a === 'string' ? a === id : a.id === id));
  if (existingIdx >= 0) {
    draft.addons.splice(existingIdx, 1);
    if (btn) {
      btn.textContent = '+ Add';
      btn.classList.remove('is-added');
    }
    showToast(`Removed "${label}" from your booking.`, 'info');
  } else {
    draft.addons.push({ id, label, quantity: 1 });
    if (btn) {
      btn.textContent = 'Added';
      btn.classList.add('is-added');
    }
    showToast(`Added "${label}" to your booking!`, 'success');
  }

  localStorage.setItem('tikim.draft', JSON.stringify(draft));
  window.dispatchEvent(new CustomEvent('tikim:draft-updated'));
  checkActiveQuoteAndHold();
}

/**
 * Interactive Add-ons & Live Booking Computation Workspace
 */
let modalState = {
  occasion: 'party',
  pkgName: 'Party Package',
  level: 1,
  selectedAddOns: new Map() // id -> quantity
};

function setupAddonModal() {
  const modal = document.getElementById('addonModal');
  const closeBtn = document.getElementById('closeAddonModal');
  const backdrop = document.getElementById('addonModalBackdrop');

  if (!modal || !closeBtn || !backdrop) return;

  function closeModal() {
    modal.style.display = 'none';
  }

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-poster-addons');
    if (!btn) return;

    const occasion = btn.getAttribute('data-occasion') || 'party';
    const pkgName = btn.getAttribute('data-name') || 'Package';
    const level = packageLevels[occasion] || 1;

    modalState.occasion = occasion;
    modalState.pkgName = pkgName;
    modalState.level = level;
    modalState.selectedAddOns.clear();

    // Check if draft has existing addons for this occasion
    try {
      const raw = localStorage.getItem('tikim.draft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (Array.isArray(draft.addons)) {
          draft.addons.forEach(a => {
            const id = typeof a === 'string' ? a : a.id;
            const qty = typeof a === 'object' && a.quantity ? a.quantity : 1;
            modalState.selectedAddOns.set(id, qty);
          });
        }
      }
    } catch (e) {}

    renderModalWorkspace();
    modal.style.display = 'flex';
  });
}

function renderModalWorkspace() {
  const titleEl = document.getElementById('addonModalTitle');
  const subEl = document.getElementById('addonModalSubtitle');
  const bodyEl = document.getElementById('addonModalBody');
  if (!bodyEl || !pricingData) return;

  const occasion = modalState.occasion;
  const pkgName = modalState.pkgName;
  const currentLvl = modalState.level;

  titleEl.textContent = `Customize ${pkgName}`;
  if (subEl) subEl.textContent = `Base 100 Guests · Choose Catering Tier and Add-ons`;

  // 1. Available Add-ons for this occasion
  const availableAddOns = getPackageAddOns(occasion, pricingData);

  // 2. Current package inclusions
  const rawPackages = pricingData.eventPackages || [];
  const pkgObj = rawPackages.find(p => p.id === occasion || p.occasion === occasion) || rawPackages[0];
  const inclusionsList = (pkgObj?.inclusions || []).filter(inc => !inc.startsWith('Catering service'));

  // 3. Compute live quotation
  const addOnsPayload = Array.from(modalState.selectedAddOns.entries()).map(([id, quantity]) => ({ id, quantity }));
  const quote = computeQuote({
    plan: 'allin',
    packageId: occasion,
    level: currentLvl,
    eventType: occasion,
    pax: 100,
    addOns: addOnsPayload
  });

  const levelUpgrades = {
    1: "Included (4 Dishes: 1 Chicken/Fish, 1 Beef/Pork, 1 Pasta, 1 Veg)",
    2: "+₱20/guest · +₱2,000 (5 Dishes: 1 Chicken, 1 Fish, 1 Beef/Pork, 1 Pasta, 1 Veg)",
    3: "+₱50/guest · +₱5,000 (6 Dishes: 1 Chicken, 1 Fish, 1 Beef, 1 Pork, 1 Pasta, 1 Veg)"
  };

  const html = `
    <!-- Section 1: Menu Package Tier -->
    <div class="modal-section">
      <div class="modal-section-title">
        <span>1. Catering Menu Package Tier</span>
        <span style="font-size: 0.75rem; color: var(--rust); text-transform: none;">Level ${currentLvl} active</span>
      </div>
      <div class="modal-tier-grid">
        <div class="modal-tier-card ${currentLvl === 1 ? 'active' : ''}" data-modal-level="1">
          <span class="m-tier-name">Package 1</span>
          <span class="m-tier-dishes">4 Dishes</span>
          <span class="m-tier-badge">Base Included</span>
        </div>
        <div class="modal-tier-card ${currentLvl === 2 ? 'active' : ''}" data-modal-level="2">
          <span class="m-tier-name">Package 2</span>
          <span class="m-tier-dishes">5 Dishes</span>
          <span class="m-tier-badge">+&#8369;2,000 total</span>
        </div>
        <div class="modal-tier-card ${currentLvl === 3 ? 'active' : ''}" data-modal-level="3">
          <span class="m-tier-name">Package 3</span>
          <span class="m-tier-dishes">6 Dishes</span>
          <span class="m-tier-badge">+&#8369;5,000 total</span>
        </div>
      </div>
      <div style="font-size: 0.78rem; color: #5e6f77; margin-top: 0.4rem;">
        ${levelUpgrades[currentLvl]}
      </div>
    </div>

    <!-- Section 2: Inclusions Overview -->
    <div class="modal-section">
      <div class="modal-section-title">
        <span>2. Included in Base Package</span>
      </div>
      <div class="modal-inclusions-chips">
        <span class="m-inc-chip">Buffet Catering (100 pax)</span>
        <span class="m-inc-chip">Waiters &amp; Attendants</span>
        <span class="m-inc-chip">Tables, Chairs &amp; Setup</span>
        <span class="m-inc-chip">Drinks &amp; Dessert</span>
        ${inclusionsList.map(inc => `<span class="m-inc-chip">${inc}</span>`).join('')}
      </div>
    </div>

    <!-- Section 3: Optional Add-ons -->
    <div class="modal-section">
      <div class="modal-section-title">
        <span>3. Choose Optional Add-ons</span>
        <span style="font-size: 0.75rem; color: var(--teal); text-transform: none;">${modalState.selectedAddOns.size} selected</span>
      </div>
      <div class="modal-addons-list">
        ${availableAddOns.length ? availableAddOns.map(addon => {
          const isChecked = modalState.selectedAddOns.has(addon.id);
          const currentQty = modalState.selectedAddOns.get(addon.id) || 1;
          const isCountable = addon.id === 'extra-photobooth-hour' || addon.id === 'invitation-20';
          const priceDisplay = addon.price === null ? 'Price on request' :
            `&#8369;${Number(addon.price).toLocaleString('en-PH')}${addon.type === 'per_head' ? '/guest' : ''}`;

          return `
            <div class="modal-addon-row">
              <label class="modal-addon-label">
                <input type="checkbox" class="modal-addon-chk" data-id="${addon.id}" ${isChecked ? 'checked' : ''} />
                <span class="modal-addon-name">${addon.label}</span>
              </label>
              <div class="modal-addon-right">
                <span class="modal-addon-price">${priceDisplay}</span>
                ${(isChecked && isCountable) ? `
                  <div class="modal-addon-stepper">
                    <button type="button" class="btn-step-dec" data-id="${addon.id}">&minus;</button>
                    <span style="font-size: 0.8rem; font-weight: 700; min-width: 16px; text-align: center;">${currentQty}</span>
                    <button type="button" class="btn-step-inc" data-id="${addon.id}">&plus;</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('') : '<p style="font-size: 0.85rem; color: #666;">No additional add-ons available for this occasion.</p>'}
      </div>
    </div>

    <!-- Section 4: Live Booking Computation -->
    <div class="modal-comp-box">
      ${quote.lines.map(line => `
        <div class="comp-line">
          <span>${line.name}</span>
          <span>&#8369;${Number(line.amount).toLocaleString('en-PH')}</span>
        </div>
      `).join('')}
      <div class="comp-divider"></div>
      <div class="comp-total">
        <span>Total Booking Price</span>
        <span>&#8369;${Number(quote.total).toLocaleString('en-PH')}</span>
      </div>
      <div class="comp-downpayment">
        <span>50% Downpayment (to lock in date)</span>
        <span>&#8369;${Number(quote.downpaymentRequired).toLocaleString('en-PH')}</span>
      </div>
      <div class="comp-line" style="margin-top: 0.25rem; font-size: 0.78rem;">
        <span>Balance Due Before Event</span>
        <span>&#8369;${Number(quote.balanceDue).toLocaleString('en-PH')}</span>
      </div>
    </div>

    <!-- Section 5: Modal Actions -->
    <div class="modal-actions-bar">
      <button type="button" class="btn btn-outline" id="btnSavePackageToDraft">
        Save to draft
      </button>
      <a href="studio.html?type=event&package=${occasion}&level=${currentLvl}" class="btn btn-primary" id="btnProceedToStudio">
        Book now &rarr;
      </a>
    </div>
  `;

  bodyEl.innerHTML = html;

  // Wire up tier cards in modal
  bodyEl.querySelectorAll('.modal-tier-card').forEach(card => {
    card.addEventListener('click', () => {
      const lvl = Number(card.getAttribute('data-modal-level')) || 1;
      modalState.level = lvl;
      updatePosterTier(modalState.occasion, lvl);
      renderModalWorkspace();
    });
  });

  // Wire up add-on checkboxes
  bodyEl.querySelectorAll('.modal-addon-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.getAttribute('data-id');
      if (chk.checked) {
        modalState.selectedAddOns.set(id, 1);
      } else {
        modalState.selectedAddOns.delete(id);
      }
      renderModalWorkspace();
    });
  });

  // Wire up quantity steppers
  bodyEl.querySelectorAll('.btn-step-inc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const cur = modalState.selectedAddOns.get(id) || 1;
      modalState.selectedAddOns.set(id, cur + 1);
      renderModalWorkspace();
    });
  });

  bodyEl.querySelectorAll('.btn-step-dec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const cur = modalState.selectedAddOns.get(id) || 1;
      if (cur > 1) {
        modalState.selectedAddOns.set(id, cur - 1);
      } else {
        modalState.selectedAddOns.delete(id);
      }
      renderModalWorkspace();
    });
  });

  // Wire up Save to Draft and Proceed buttons
  const btnSave = document.getElementById('btnSavePackageToDraft');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      saveModalConfigurationToCart(quote, true);
    });
  }

  const btnProceed = document.getElementById('btnProceedToStudio');
  if (btnProceed) {
    btnProceed.addEventListener('click', () => {
      saveModalConfigurationToCart(quote, false);
    });
  }
}

function saveModalConfigurationToCart(quote, openDrawer = true) {
  const occasion = modalState.occasion;
  const level = modalState.level;
  const addOnsPayload = Array.from(modalState.selectedAddOns.entries()).map(([id, quantity]) => {
    const found = (pricingData.addOns || []).find(a => a.id === id);
    return {
      id,
      label: found ? found.label : id,
      quantity,
      price: found ? found.price : 0
    };
  });

  let draft = {};
  try {
    const raw = localStorage.getItem('tikim.draft');
    if (raw) draft = JSON.parse(raw);
  } catch (e) {}

  draft.type = 'event';
  draft.event = occasion;
  draft.eventType = occasion;
  draft.packageId = occasion;
  draft.level = level;
  draft.pax = 100;
  draft.addons = addOnsPayload;
  draft.addOns = addOnsPayload;

  localStorage.setItem('tikim.draft', JSON.stringify(draft));
  window.dispatchEvent(new CustomEvent('tikim:draft-updated'));
  checkActiveQuoteAndHold();

  if (openDrawer) {
    showToast(`${modalState.pkgName} saved to draft!`, 'success');
    const modal = document.getElementById('addonModal');
    if (modal) modal.style.display = 'none';
  }
}


function handleDeepLinks() {
  const hash = (window.location.hash || '').replace('#', '').trim().toLowerCase();
  const urlParams = new URLSearchParams(window.location.search);
  const eventParam = (urlParams.get('event') || '').trim().toLowerCase();

  const targetId = hash || eventParam;
  if (!targetId) return;

  const poster = document.getElementById(`poster-${targetId}`) ||
    document.getElementById(`poster-wrap-${targetId}`) ||
    document.getElementById(targetId);

  if (poster) {
    setTimeout(() => {
      poster.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const card = poster.classList.contains('poster-card') ? poster : poster.querySelector('.poster-card');
      if (card) {
        card.classList.add('poster-highlight');
        setTimeout(() => card.classList.remove('poster-highlight'), 3000);
      }
    }, 200);
  }
}

document.addEventListener('DOMContentLoaded', init);
