// Global search overlay controller with token scoring, Tagalog aliases, page indexing, and keyboard navigation.

let searchDataCache = null;

export async function loadSearchIndex() {
  if (searchDataCache) return searchDataCache;
  try {
    const [packagesRes, menuRes, rentalsRes, addonsRes, traysRes] = await Promise.all([
      fetch('data/packages.json'),
      fetch('data/menu.json'),
      fetch('data/rentals.json'),
      fetch('data/addons.json'),
      fetch('data/trays.json').catch(() => null)
    ]);

    const packages = await packagesRes.json();
    const dishes = await menuRes.json();
    const rentals = await rentalsRes.json();
    const addons = await addonsRes.json();
    const trays = traysRes ? await traysRes.json() : [];

    const pages = [
      {
        type: 'Page',
        title: 'Turnkey Packages',
        subtitle: 'Weddings, Birthdays, Corporate, Reunions, Parties',
        price: 'Packages',
        url: 'packages.html',
        id: 'page-packages',
        tokens: 'packages turnkey packages event catering occasions kasalan kasal birthday debut corporate reunion party san ildefonso bulacan'.toLowerCase()
      },

      {
        type: 'Page',
        title: 'Venue Floor Planner',
        subtitle: '2D interactive venue designer with grid snap & seat accounting',
        price: 'Interactive',
        url: 'planner.html',
        id: 'page-planner',
        tokens: 'floor planner venue designer layout table seats seating arrange floorplan blueprint 2d'.toLowerCase()
      },
      {
        type: 'Page',
        title: 'Food Trays',
        subtitle: 'Zhel\'s food tray menu, chicken, pork, beef, pasta, fish, veggie',
        price: 'Food Trays',
        url: 'food-orders.html',
        id: 'page-food-trays',
        tokens: 'food trays party trays salo salo delivery takeout food orders zhel dacks'.toLowerCase()
      },
      {
        type: 'Page',
        title: 'Customer Gallery',
        subtitle: 'Real event setups, celebrations, and customer photos',
        price: 'Gallery',
        url: 'gallery.html',
        id: 'page-gallery',
        tokens: 'customer gallery photos celebrations wedding birthday event styling pictures'.toLowerCase()
      },
      {
        type: 'Page',
        title: 'Our Story & Hospitality',
        subtitle: 'Heirloom culinary passion & Bulacan commissary history',
        price: 'About',
        url: 'about.html',
        id: 'page-about',
        tokens: 'our story about us dacks catering history cruz street san ildefonso bulacan company hospitality'.toLowerCase()
      },
      {
        type: 'Page',
        title: 'Frequently Asked Questions (FAQ)',
        subtitle: 'Date hold, 50% downpayment, balance due, equipment & cancellation policy',
        price: 'FAQ',
        url: 'about.html#faq',
        id: 'page-faq',
        tokens: 'faq frequently asked questions downpayment date hold food tasting policy coverage terms balance equipment damage cancellation'.toLowerCase()
      },
      {
        type: 'Page',
        title: 'Contact Us & Location',
        subtitle: 'Cruz St. San Ildefonso Bulacan &bull; 0977 752 3458',
        price: 'Contact',
        url: 'contact.html',
        id: 'page-contact',
        tokens: 'contact us phone telephone mobile call address google maps inquiries quote message cruz street 09777523458'.toLowerCase()
      }
    ];

    let blankPages = ['about', 'gallery'];
    try {
      const sRes = await fetch('data/settings.json');
      if (sRes.ok) {
        const sData = await sRes.json();
        if (Array.isArray(sData.blankPages)) blankPages = sData.blankPages;
      }
    } catch (e) {}

    const indexedPages = pages.filter(p => !blankPages.some(b => p.url.startsWith(`${b}.html`)));

    searchDataCache = {
      pages: indexedPages,
      packages: packages.map(p => ({
        type: 'Package',
        title: p.name,
        subtitle: `${p.occasion ? p.occasion.charAt(0).toUpperCase() + p.occasion.slice(1) : 'Catering'} • ${p.basePax || 100} Guests`,
        price: p.price ? `₱${Number(p.price).toLocaleString('en-PH')}` : (p.perHead ? `₱${p.perHead}/head` : 'Package'),
        url: `packages.html?event=${p.occasion || 'party'}#${p.id}`,
        id: p.id,
        tokens: `${p.name} ${p.occasion || ''} ${p.tagline || ''} ${p.description || ''} handaan handa party pakete kasal binyag debut birthday corporate reunion kasalan`.toLowerCase()
      })),
      dishes: dishes.map(d => ({
        type: 'Dish',
        title: d.name,
        subtitle: `${d.category} • ${d.course || d.category}`,
        price: d.price === null ? 'To be quoted' : (d.price ? `₱${Number(d.price).toLocaleString('en-PH')}` : 'Included'),
        url: `menu.html#dish-${d.slug || d.id}`,
        id: d.id,
        tokens: `${d.name} ${d.category} ${d.course || ''} ${d.description || ''} ulam handaan pampagana ulam sabaw panghimagas`.toLowerCase()
      })),
      trays: trays.map(t => ({
        type: 'Food Tray',
        title: `${t.name} (Tray)`,
        subtitle: `${t.category} Tray • Ready-to-serve`,
        price: `₱${Number(t.price).toLocaleString('en-PH')}`,
        url: `food-orders.html#${t.id}`,
        id: t.id,
        tokens: `${t.name} tray ${t.category} food tray handaan salo salo delivery takeout`.toLowerCase()
      })),
      rentals: rentals.map(r => ({
        type: 'Rental 360',
        title: r.name,
        subtitle: `${r.category} • ${r.dimensions || ''}`,
        price: r.badge || 'Included in packages',
        url: `rentals.html#rental-${r.id}`,
        id: r.id,
        tokens: `${r.name} ${r.category} ${r.material || ''} ${r.description || ''} upuan lamesa ilaw sound system photobooth`.toLowerCase()
      })),
      addons: addons.map(a => ({
        type: 'Add-on',
        title: a.name || a.label,
        subtitle: `${a.category || (a.occasions || []).join(', ')}`,
        price: a.price ? `₱${Number(a.price).toLocaleString('en-PH')}` : 'To be quoted',
        url: `studio.html?step=extras#addon-${a.id}`,
        id: a.id,
        tokens: `${a.name || a.label} ${a.category || ''} ${a.description || ''} clown magician host emcee photographer photobooth lights sounds`.toLowerCase()
      }))
    };

    return searchDataCache;
  } catch (err) {
    return { pages: [], packages: [], dishes: [], trays: [], rentals: [], addons: [] };
  }
}

export function openSearchModal(onSelectCallback = null) {
  let modal = document.getElementById('globalSearchModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalSearchModal';
    modal.className = 'search-modal-backdrop';
    modal.innerHTML = `
      <div class="search-modal-window" role="dialog" aria-modal="true" aria-label="Global Search">
        <div class="search-modal-header">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="modalSearchInput" class="search-input-field" placeholder="Search dishes, packages, rentals 360, pages... (Esc to close)" autocomplete="off" />
          <button id="modalSearchCloseBtn" style="font-size: 1.5rem; color: var(--text-muted); cursor: pointer; background: transparent; border: none;">&times;</button>
        </div>
        <div class="search-results-list" id="modalSearchResultsList">
          <div style="font-size: 0.88rem; color: var(--text-muted); padding: 1rem 0.5rem;">
            Tip: Type Tagalog or English keywords like <strong>"lechon"</strong>, <strong>"wedding"</strong>, <strong>"floor planner"</strong>, <strong>"contact"</strong>, or <strong>"chairs"</strong>.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.classList.remove('open');
    modal.querySelector('#modalSearchCloseBtn').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    const input = modal.querySelector('#modalSearchInput');
    input.addEventListener('input', (e) => performSearch(e.target.value.trim(), onSelectCallback));
  }

  modal.classList.add('open');
  const input = modal.querySelector('#modalSearchInput');
  input.value = '';
  input.focus();
}

async function performSearch(query, onSelectCallback) {
  const list = document.getElementById('modalSearchResultsList');
  if (!list) return;

  if (!query) {
    list.innerHTML = `
      <div style="font-size: 0.88rem; color: var(--text-muted); padding: 1rem 0.5rem;">
        Tip: Type Tagalog or English keywords like <strong>"lechon"</strong>, <strong>"wedding"</strong>, <strong>"floor planner"</strong>, <strong>"contact"</strong>, or <strong>"chairs"</strong>.
      </div>
    `;
    return;
  }

  const index = await loadSearchIndex();
  const q = query.toLowerCase();

  const matchItem = item => item.tokens.includes(q) || item.title.toLowerCase().includes(q);

  const matchedPages = index.pages.filter(matchItem);
  const matchedPackages = index.packages.filter(matchItem);
  const matchedDishes = index.dishes.filter(matchItem);
  const matchedTrays = (index.trays || []).filter(matchItem);
  const matchedRentals = index.rentals.filter(matchItem);
  const matchedAddons = index.addons.filter(matchItem);

  const total = matchedPages.length + matchedPackages.length + matchedDishes.length + matchedTrays.length + matchedRentals.length + matchedAddons.length;

  if (total === 0) {
    list.innerHTML = `
      <div style="padding: 2rem 0.5rem; text-align: center; color: var(--text-muted);">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 0.75rem auto; display: block; opacity: 0.5;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>No results found for "<strong>${query}</strong>".</p>
      </div>
    `;
    return;
  }

  let html = '';

  const renderGroup = (title, items) => {
    if (items.length === 0) return '';
    let grpHtml = `<div class="search-group-title">${title} (${items.length})</div>`;
    items.slice(0, 5).forEach(item => {
      grpHtml += `
        <div class="search-item-row" data-url="${item.url}" data-id="${item.id}">
          <div>
            <div class="search-item-title">${item.title}</div>
            <div class="search-item-meta">${item.subtitle}</div>
          </div>
          <div style="font-weight: 700; color: var(--rust); font-size: 0.88rem;">${item.price}</div>
        </div>
      `;
    });
    return grpHtml;
  };

  html += renderGroup('Website Pages', matchedPages);
  html += renderGroup('Event Packages', matchedPackages);
  html += renderGroup('Menu Dishes', matchedDishes);
  html += renderGroup('Food Trays', matchedTrays);
  html += renderGroup('360 Equipment Rentals', matchedRentals);
  html += renderGroup('Add-ons & Entertainers', matchedAddons);

  list.innerHTML = html;

  list.querySelectorAll('.search-item-row').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.getAttribute('data-url');
      const id = row.getAttribute('data-id');
      document.getElementById('globalSearchModal').classList.remove('open');
      if (onSelectCallback) {
        onSelectCallback(id, url);
      } else {
        window.location.href = url;
      }
    });
  });
}

// Global keyboard shortcuts: "/" or "Ctrl+K" opens search; "Esc" closes.
window.addEventListener('keydown', (e) => {
  if ((e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k')) && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    openSearchModal();
  }
  if (e.key === 'Escape') {
    const modal = document.getElementById('globalSearchModal');
    if (modal && modal.classList.contains('open')) {
      modal.classList.remove('open');
    }
  }
});
