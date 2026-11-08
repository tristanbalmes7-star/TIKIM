// TIKIM Catering Menu Page Logic (Revision 11 Part 6)
// Heritage culinary catalog, subheader controls (Choosing for, Saved menus), slot replacement,
// and slim sticky bottom bar with exactly TWO actions: Save menu and Book now.

import { showToast } from '../layout.js';
import { mockApi } from '../mockApi.js';
import { draftStore, showConfirmDialog } from '../draftStore.js';

let menuData = [];
let pricingConfig = null;
let currentLevel = 1;
let selectedDishes = [];
let extraDishes = [];
let specialDishes = [];

let isProgrammaticScrolling = false;
let scrollLockTimer = null;
let currentTargetSlug = null;

const CATEGORIES = [
  { slug: 'chicken', title: 'Chicken', note: 'Extra dish: +₱30 per guest', filterCat: 'chicken' },
  { slug: 'beef', title: 'Beef', note: 'Extra dish: +₱35 per guest', filterCat: 'beef' },
  { slug: 'pork', title: 'Pork', note: 'Extra dish: +₱35 per guest', filterCat: 'pork' },
  { slug: 'fish', title: 'Fish', note: 'Extra dish: +₱30 per guest', filterCat: 'fish' },
  { slug: 'vegetables', title: 'Vegetables', note: 'Extra dish: +₱30 per guest', filterCat: 'vegetables' },
  { slug: 'pasta', title: 'Pasta', note: 'Extra dish: +₱30 per guest', filterCat: 'pasta' },
  { slug: 'drinks', title: 'Drinks', note: 'Included with every package (choose 1)', filterCat: 'drinks' },
  { slug: 'desserts', title: 'Desserts', note: 'Included with every package (choose 1)', filterCat: 'desserts' },
  { slug: 'special-dishes', title: 'Special dishes', note: 'Price on request', filterCat: 'special dishes' }
];

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderDishesLibrary();
  initSubheaderTabs();
  initSubheaderControls();
  initScrollSpy();
  initBottomBar();
  updateUiState();
  handleInitialHash();

  draftStore.subscribe((draft) => {
    selectedDishes = Array.isArray(draft?.dishes) ? [...draft.dishes] : (Array.isArray(draft?.menu) ? [...draft.menu] : []);
    extraDishes = Array.isArray(draft?.extraDishes) ? [...draft.extraDishes] : [];
    specialDishes = Array.isArray(draft?.specialDishes) ? [...draft.specialDishes] : [];
    if (draft?.level) currentLevel = Number(draft.level) || 1;
    updateUiState();
  });
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

    // Load menu and pricing from the Laravel database.
    menuData = result.data.dishes || [];
    pricingConfig = result.data.pricing || {};

    // Check separate menu picks first, fallback to draft.
    let picks = null;

    try {
      const raw = localStorage.getItem('tikim.menuPicks');
      if (raw) picks = JSON.parse(raw);
    } catch (e) {}

    if (picks) {
      if (picks.level) currentLevel = Number(picks.level) || 1;
      if (Array.isArray(picks.dishes)) selectedDishes = [...picks.dishes];
      if (Array.isArray(picks.extraDishes)) extraDishes = [...picks.extraDishes];
      if (Array.isArray(picks.specialDishes)) specialDishes = [...picks.specialDishes];
    } else {
      const draft = await mockApi.getDraft();

      if (draft) {
        if (draft.level) currentLevel = Number(draft.level) || 1;

        if (Array.isArray(draft.dishes) && draft.dishes.length) {
          selectedDishes = [...draft.dishes];
        } else if (Array.isArray(draft.menu) && draft.menu.length) {
          selectedDishes = [...draft.menu];
        }

        if (Array.isArray(draft.extraDishes)) extraDishes = [...draft.extraDishes];
        if (Array.isArray(draft.specialDishes)) specialDishes = [...draft.specialDishes];
      }
    }
  } catch (err) {
    console.error('Failed to load menu data:', err);
  }
}

function getSlotDefinitions(level) {
  if (level === 2) {
    return [
      { id: 'chicken', title: 'Chicken', categories: ['chicken'] },
      { id: 'fish', title: 'Fish', categories: ['fish'] },
      { id: 'beef_pork', title: 'Beef or Pork', categories: ['beef', 'pork'] },
      { id: 'pasta', title: 'Pasta', categories: ['pasta'] },
      { id: 'vegetables', title: 'Vegetables', categories: ['vegetables'] }
    ];
  }
  if (level === 3) {
    return [
      { id: 'chicken', title: 'Chicken', categories: ['chicken'] },
      { id: 'fish', title: 'Fish', categories: ['fish'] },
      { id: 'beef', title: 'Beef', categories: ['beef'] },
      { id: 'pork', title: 'Pork', categories: ['pork'] },
      { id: 'pasta', title: 'Pasta', categories: ['pasta'] },
      { id: 'vegetables', title: 'Vegetables', categories: ['vegetables'] }
    ];
  }
  // Level 1 default
  return [
    { id: 'chicken_fish', title: 'Chicken or Fish', categories: ['chicken', 'fish'] },
    { id: 'beef_pork', title: 'Beef or Pork', categories: ['beef', 'pork'] },
    { id: 'pasta', title: 'Pasta', categories: ['pasta'] },
    { id: 'vegetables', title: 'Vegetables', categories: ['vegetables'] }
  ];
}

function getDishCategory(dishName) {
  const dish = menuData.find(d => d.name === dishName);
  return dish ? (dish.category || dish.course || '').toLowerCase() : '';
}

function renderDishesLibrary() {
  const container = document.getElementById('dishesSectionsContainer');
  if (!container || !menuData.length) return;

  const html = CATEGORIES.map(cat => {
    const dishes = menuData.filter(d => {
      const c = (d.category || d.course || '').toLowerCase();
      if (cat.filterCat === 'special dishes') {
        return c === 'special dishes' || c === 'special';
      }
      return c === cat.filterCat;
    });

    const dishCardsHtml = dishes.map(dish => renderDishItem(dish)).join('');

    return `
      <section class="dish-category-section" id="cat-${cat.slug}" data-category-slug="${cat.slug}">
        <div class="category-title-header">
          <h2 class="category-title cat-title-text">${cat.title}</h2>
          <span class="cat-extra-note">${cat.note}</span>
        </div>
        <div class="dishes-twocol-grid">
          ${dishCardsHtml}
        </div>
      </section>
    `;
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('.btn-add-dish').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dishName = decodeURIComponent(btn.dataset.dishName || '');
      toggleDishSelection(dishName);
    });
  });

  container.querySelectorAll('.btn-extra-dish').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dishName = decodeURIComponent(btn.dataset.dishName || '');
      toggleExtraDish(dishName);
    });
  });
}

function renderDishItem(dish) {
  const isSlotSelected = selectedDishes.includes(dish.name);
  const isExtraSelected = extraDishes.includes(dish.name);
  const isSpecialSelected = specialDishes.includes(dish.name);
  const isSelected = isSlotSelected || isExtraSelected || isSpecialSelected;
  const isSpecial = (dish.category || dish.course || '').toLowerCase().includes('special');
  const dishId = dish.slug || dish.id;

  let badgeLabel = '+ Add';
  if (isSlotSelected) badgeLabel = 'Added';
  else if (isExtraSelected) badgeLabel = 'Added (Extra)';
  else if (isSpecialSelected) badgeLabel = 'Added (Special)';

  const cat = (dish.category || dish.course || '').toLowerCase();
  const showExtraBtn = !isSpecial && cat !== 'drinks' && cat !== 'desserts';

  return `
    <article class="dish-board-item ${isSelected ? 'is-selected' : ''} ${isExtraSelected ? 'is-extra' : ''}" id="dish-${dishId}" data-dish-id="${dishId}" data-dish-name="${encodeURIComponent(dish.name)}">
      <div class="dish-info-col">
        <div class="dish-name-row">
          <h3 class="dish-item-name">${dish.name}</h3>
          ${isSpecial ? '<span class="dish-special-tag">Special</span>' : ''}
        </div>
        <p class="dish-desc-text">${dish.description || ''}</p>
      </div>
      <div class="dish-action-col">
        <button type="button" class="btn-add-dish ${isSelected ? 'is-active' : ''}" data-dish-name="${encodeURIComponent(dish.name)}" aria-label="${isSelected ? 'Remove ' + dish.name : 'Add ' + dish.name}">
          ${badgeLabel}
        </button>
        ${showExtraBtn && !isSlotSelected ? `
          <button type="button" class="btn-extra-dish ${isExtraSelected ? 'is-active' : ''}" data-dish-name="${encodeURIComponent(dish.name)}" title="Add as extra dish with per-guest price">
            ${isExtraSelected ? 'Remove extra' : '+ Extra dish'}
          </button>
        ` : ''}
      </div>
    </article>
  `;
}

function toggleDishSelection(dishName) {
  if (!dishName) return;

  // 1. If currently in specialDishes, remove
  if (specialDishes.includes(dishName)) {
    specialDishes = specialDishes.filter(d => d !== dishName);
    showToast(`Removed "${dishName}"`, 'info');
    persistAndSync();
    updateUiState();
    return;
  }

  // 2. If currently in extraDishes, remove
  if (extraDishes.includes(dishName)) {
    extraDishes = extraDishes.filter(d => d !== dishName);
    showToast(`Removed extra dish "${dishName}"`, 'info');
    persistAndSync();
    updateUiState();
    return;
  }

  // 3. If currently in selectedDishes (slot dish), remove
  if (selectedDishes.includes(dishName)) {
    selectedDishes = selectedDishes.filter(d => d !== dishName);
    showToast(`Removed "${dishName}"`, 'info');
    persistAndSync();
    updateUiState();
    return;
  }

  // 4. Adding a new dish
  const dishCat = getDishCategory(dishName);
  const isSpecial = dishCat.includes('special');

  if (isSpecial) {
    specialDishes.push(dishName);
    showToast(`Added "${dishName}" (Price on request)`, 'info');
    persistAndSync();
    updateUiState();
    return;
  }

  const slots = getSlotDefinitions(currentLevel);

  // Check if any slot matching this category is currently empty
  let placedInEmptySlot = false;
  for (const slot of slots) {
    if (slot.categories.includes(dishCat)) {
      const alreadyOccupied = selectedDishes.find(d => slot.categories.includes(getDishCategory(d)));
      if (!alreadyOccupied) {
        selectedDishes.push(dishName);
        placedInEmptySlot = true;
        showToast(`Added "${dishName}" to menu`, 'info');
        break;
      }
    }
  }

  if (placedInEmptySlot) {
    persistAndSync();
    updateUiState();
    return;
  }

  // All slots for this category rule are occupied: replace the existing dish in that slot
  const targetSlot = slots.find(s => s.categories.includes(dishCat));
  if (targetSlot) {
    const existingDish = selectedDishes.find(d => targetSlot.categories.includes(getDishCategory(d)));
    if (existingDish) {
      selectedDishes = selectedDishes.filter(d => d !== existingDish);
      selectedDishes.push(dishName);
      showToast(`Replaced "${existingDish}" with "${dishName}"`, 'info');
      persistAndSync();
      updateUiState();
      return;
    }
  }

  // If no matching package slot exists, treat as an extra dish
  extraDishes.push(dishName);
  showToast(`Added "${dishName}" as extra dish`, 'info');
  persistAndSync();
  updateUiState();
}

function toggleExtraDish(dishName) {
  if (!dishName) return;

  if (extraDishes.includes(dishName)) {
    extraDishes = extraDishes.filter(d => d !== dishName);
    showToast(`Removed extra dish "${dishName}"`, 'info');
  } else {
    // If it was in selectedDishes, remove it from there
    if (selectedDishes.includes(dishName)) {
      selectedDishes = selectedDishes.filter(d => d !== dishName);
    }
    extraDishes.push(dishName);
    showToast(`Added "${dishName}" as extra dish (+₱30/guest)`, 'info');
  }

  persistAndSync();
  updateUiState();
}

function persistAndSync() {
  localStorage.setItem('tikim.menuPicks', JSON.stringify({
    level: currentLevel,
    dishes: selectedDishes,
    extraDishes: extraDishes,
    specialDishes: specialDishes
  }));
}

function updateUiState() {
  // Update dish cards in catalog
  renderDishesLibrary();

  // Update Choosing For selector
  const levelSelect = document.getElementById('menuLevelSelect');
  if (levelSelect) levelSelect.value = String(currentLevel);

  // Update Bottom Bar
  const bottomBar = document.getElementById('menuStickyBottomBar');
  const mainEl = document.getElementById('main-content');
  const quotaText = document.getElementById('menuBarQuotaText');
  const bookBtn = document.getElementById('btnBookNowMenu');

  const slots = getSlotDefinitions(currentLevel);
  const totalPicked = selectedDishes.length + extraDishes.length + specialDishes.length;

  if (bottomBar) {
    if (totalPicked > 0) {
      bottomBar.style.display = 'block';
      if (mainEl) mainEl.classList.add('has-sticky-bar');
    } else {
      bottomBar.style.display = 'none';
      if (mainEl) mainEl.classList.remove('has-sticky-bar');
    }
  }

  if (quotaText) {
    let msg = `${selectedDishes.length} of ${slots.length} dishes, Food Package ${currentLevel}`;
    if (extraDishes.length > 0) {
      msg += ` (+${extraDishes.length} extra)`;
    }
    if (specialDishes.length > 0) {
      msg += ` (+${specialDishes.length} special)`;
    }
    quotaText.textContent = msg;
  }

  if (bookBtn) {
    bookBtn.href = `studio.html?type=food&level=${currentLevel}`;
  }

  // Update saved menus dropdown
  refreshSavedMenusDropdown();
}

async function refreshSavedMenusDropdown() {
  const countBadge = document.getElementById('savedMenusCountBadge');
  const listContainer = document.getElementById('savedMenusList');
  if (!countBadge || !listContainer) return;

  const menus = await mockApi.listSavedMenus();
  countBadge.textContent = `(${menus.length})`;

  if (!menus.length) {
    listContainer.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8; text-align:center; padding:0.5rem;">No saved menus yet</div>';
    return;
  }

  listContainer.innerHTML = menus.map(m => {
    const dishCount = (m.dishes || []).length + (m.extraDishes || []).length + (m.specialDishes || []).length;
    return `
      <div class="saved-menu-item" data-id="${m.id}">
        <div class="saved-menu-meta">
          <span class="saved-menu-name">${m.name}</span>
          <span class="saved-menu-details">Food Pkg ${m.level || 1} &bull; ${dishCount} dishes</span>
        </div>
        <div class="saved-menu-actions">
          <button type="button" class="btn-sm-action btn-load-menu" data-id="${m.id}">Load</button>
          <button type="button" class="btn-sm-action btn-rename-menu" data-id="${m.id}">Rename</button>
          <button type="button" class="btn-sm-action btn-del btn-delete-menu" data-id="${m.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Bind actions
  listContainer.querySelectorAll('.btn-load-menu').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.id;
      const m = menus.find(x => x.id === id);
      if (!m) return;
      const ok = await showConfirmDialog({
        title: 'Load saved menu?',
        desc: `Load saved menu "${m.name}"? This will replace your current picks.`,
        confirmText: 'Load menu'
      });
      if (ok) {
        currentLevel = m.level || 1;
        selectedDishes = [...(m.dishes || [])];
        extraDishes = [...(m.extraDishes || [])];
        specialDishes = [...(m.specialDishes || [])];
        persistAndSync();
        updateUiState();
        closeSavedMenusPopover();
        showToast(`Loaded "${m.name}"`, 'success');
      }
    };
  });

  listContainer.querySelectorAll('.btn-rename-menu').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.id;
      const m = menus.find(x => x.id === id);
      if (!m) return;
      const newName = prompt('Rename menu:', m.name);
      if (newName && newName.trim()) {
        await mockApi.saveMenu({ ...m, name: newName.trim() });
        refreshSavedMenusDropdown();
        showToast('Menu renamed', 'info');
      }
    };
  });

  listContainer.querySelectorAll('.btn-delete-menu').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.id;
      const m = menus.find(x => x.id === id);
      if (!m) return;
      const ok = await showConfirmDialog({
        title: 'Delete menu?',
        desc: `Delete menu "${m.name}"?`,
        confirmText: 'Delete'
      });
      if (ok) {
        await mockApi.deleteMenu(id);
        refreshSavedMenusDropdown();
        showToast('Menu deleted', 'info');
      }
    };
  });
}

function initSubheaderControls() {
  const levelSelect = document.getElementById('menuLevelSelect');
  if (levelSelect) {
    levelSelect.value = String(currentLevel);
    levelSelect.addEventListener('change', () => {
      currentLevel = Number(levelSelect.value) || 1;
      persistAndSync();
      updateUiState();
      showToast(`Switched to Food Package ${currentLevel}`, 'info');
    });
  }

  const btnSaved = document.getElementById('btnSavedMenus');
  const popover = document.getElementById('savedMenusPopover');

  if (btnSaved && popover) {
    btnSaved.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = popover.style.display === 'block';
      popover.style.display = isOpen ? 'none' : 'block';
      btnSaved.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== btnSaved) {
        closeSavedMenusPopover();
      }
    });
  }
}

function closeSavedMenusPopover() {
  const popover = document.getElementById('savedMenusPopover');
  const btnSaved = document.getElementById('btnSavedMenus');
  if (popover) popover.style.display = 'none';
  if (btnSaved) btnSaved.setAttribute('aria-expanded', 'false');
}

function initBottomBar() {
  const btnSave = document.getElementById('btnSaveMenu');
  const btnBook = document.getElementById('btnBookNowMenu');

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const menus = await mockApi.listSavedMenus();
      const defaultName = `Menu ${menus.length + 1}`;
      const name = prompt('Name your menu:', defaultName);
      if (!name || !name.trim()) return;

      await mockApi.saveMenu({
        name: name.trim(),
        level: currentLevel,
        dishes: selectedDishes,
        extraDishes: extraDishes,
        specialDishes: specialDishes
      });

      refreshSavedMenusDropdown();
      showToast(`Menu "${name.trim()}" saved!`, 'success');
    });
  }

  if (btnBook) {
    btnBook.addEventListener('click', (e) => {
      e.preventDefault();
      // Ensure draft has type: 'food' and all picks prefilled
      mockApi.saveDraft({
        type: 'food',
        level: currentLevel,
        dishes: selectedDishes,
        extraDishes: extraDishes,
        specialDishes: specialDishes
      });
      window.location.href = `studio.html?type=food&level=${currentLevel}`;
    });
  }
}

function getHeaderOffsets() {
  const rootStyles = getComputedStyle(document.documentElement);
  const navH = parseFloat(rootStyles.getPropertyValue('--nav-h')) || 96;
  const subH = parseFloat(rootStyles.getPropertyValue('--sub-h')) || 58;
  return { navH, subH, totalOffset: navH + subH };
}

function scrollToCategory(catSlug) {
  const row = document.getElementById(`cat-${catSlug}`);
  if (!row) return;

  currentTargetSlug = catSlug;
  const { totalOffset } = getHeaderOffsets();
  const heading = row.querySelector('.category-title') || row;
  const headingTop = heading.getBoundingClientRect().top + window.pageYOffset;
  const targetScrollY = Math.max(0, Math.round(headingTop - totalOffset));

  isProgrammaticScrolling = true;
  clearTimeout(scrollLockTimer);
  scrollLockTimer = setTimeout(() => {
    isProgrammaticScrolling = false;
    currentTargetSlug = null;
  }, 850);

  setActiveTab(catSlug);
  history.replaceState(null, '', `#cat-${catSlug}`);

  window.scrollTo({
    top: targetScrollY,
    behavior: 'smooth'
  });

  const onScrollEnd = () => {
    isProgrammaticScrolling = false;
    currentTargetSlug = null;
    window.removeEventListener('scrollend', onScrollEnd);
  };
  window.addEventListener('scrollend', onScrollEnd, { once: true });
}

function setActiveTab(catSlug) {
  const tabs = document.querySelectorAll('#menuTabsScroll .subheader-tab');
  tabs.forEach(tab => {
    if (tab.dataset.cat === catSlug) {
      tab.classList.add('active');
      tab.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    } else {
      tab.classList.remove('active');
    }
  });
}

function initSubheaderTabs() {
  const tabs = document.querySelectorAll('#menuTabsScroll .subheader-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = tab.dataset.cat;
      if (slug) scrollToCategory(slug);
    });
  });
}

function initScrollSpy() {
  const onScroll = () => {
    if (isProgrammaticScrolling) return;

    const { totalOffset } = getHeaderOffsets();
    const rows = Array.from(document.querySelectorAll('.dish-category-section'));
    let matchedSlug = null;

    for (let i = 0; i < rows.length; i++) {
      const heading = rows[i].querySelector('.category-title') || rows[i];
      const rect = heading.getBoundingClientRect();
      const rowRect = rows[i].getBoundingClientRect();
      if (rect.top <= totalOffset + 80 && rowRect.bottom > totalOffset + 20) {
        matchedSlug = rows[i].dataset.categorySlug || rows[i].id.replace('cat-', '');
      }
    }

    if (matchedSlug) {
      setActiveTab(matchedSlug);
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
}

function handleInitialHash() {
  const hash = window.location.hash;
  if (!hash) return;
  const slug = hash.replace(/^#cat-/, '').replace(/^#/, '');
  if (slug) {
    setTimeout(() => {
      scrollToCategory(slug);
    }, 150);
  }
}
