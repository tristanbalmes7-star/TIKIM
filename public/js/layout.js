// Global layout injection: centered navigation, reference footer, and floating widgets.
import { openSearchModal } from './search.js';
import { getActiveHold, getDraft, clearDraft, releaseHold } from './mockApi.js';
import { calculateQuotation, formatPeso } from './pricing.js';
import { draftStore } from './draftStore.js';

export function initLayout(activePage = '') {
  injectHeader(activePage);
  injectFooter();
  injectScrollToTopBtn();
  injectToastContainer();
  attachScrollBehaviors(activePage);
  setupDropdownBehaviors();
  setupDevAssertions();
  checkLinkAuditQuery();
  checkContrastAuditQuery();

  // Track booking origin for studio Back navigation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="studio.html"]');
    if (link) {
      const pageName = window.location.pathname.split('/').pop() || 'index.html';
      sessionStorage.setItem('bookingOrigin', pageName);
    }
  });
}

function injectHeader(activePage) {
  let headerEl = document.querySelector('.site-header');
  if (!headerEl) {
    headerEl = document.createElement('header');
    headerEl.className = 'site-header';
    headerEl.id = 'siteHeader';
    const slot = document.getElementById('tikim-header-slot');
    if (slot) {
      slot.replaceWith(headerEl);
    } else {
      const firstChild = document.body.firstElementChild;
      document.body.insertBefore(headerEl, firstChild ? firstChild.nextSibling : null);
    }
  }

  headerEl.classList.add('is-solid');

  const isActive = (page) => activePage === page ? 'active' : '';

  const navHtml = `
    <div class="header-inner">
      <!-- Mobile Hamburger Button -->
      <button class="header-hamburger-btn" id="mobileMenuBtn" aria-label="Open mobile navigation menu" aria-expanded="false" aria-controls="mobileDrawer">
        <span></span><span></span><span></span>
      </button>

      <!-- Desktop Left Group (Catering, Event Styling, Book) -->
      <nav class="header-nav-group header-nav-left" aria-label="Primary Left Navigation">
        <!-- Catering Dropdown -->
        <div class="nav-dropdown" data-dropdown="catering">
          <button type="button" id="dropdown-catering" class="header-link dropdown-toggle ${isActive('packages') || isActive('menu') ? 'active' : ''}" aria-haspopup="true" aria-expanded="false">
            Catering
            <svg class="dropdown-chevron" width="12" height="12" aria-hidden="true"><use href="assets/icons/sprite.svg#chevron-down"></use></svg>
          </button>
          <div class="dropdown-panel" role="menu" aria-labelledby="dropdown-catering">
            <a href="packages.html" class="dropdown-item ${isActive('packages')}" role="menuitem" ${activePage === 'packages' ? 'aria-current="page"' : ''}>Packages</a>
            <a href="menu.html" class="dropdown-item ${isActive('menu')}" role="menuitem" ${activePage === 'menu' ? 'aria-current="page"' : ''}>Menu</a>
          </div>
        </div>

        <!-- Event Styling: Direct Link (Revision 11) -->
        <a href="planner.html" class="header-link ${isActive('planner')}">Event styling</a>

        <!-- Book Dropdown -->
        <div class="nav-dropdown" data-dropdown="book">
          <button type="button" id="dropdown-book" class="header-link dropdown-toggle ${isActive('studio') || isActive('track') ? 'active' : ''}" aria-haspopup="true" aria-expanded="false">
            Book
            <svg class="dropdown-chevron" width="12" height="12" aria-hidden="true"><use href="assets/icons/sprite.svg#chevron-down"></use></svg>
          </button>
          <div class="dropdown-panel" role="menu" aria-labelledby="dropdown-book">
            <a href="studio.html" class="dropdown-item ${isActive('studio')}" role="menuitem" ${activePage === 'studio' ? 'aria-current="page"' : ''}>Book your date</a>
            <a href="track.html" class="dropdown-item ${isActive('track')}" role="menuitem" ${activePage === 'track' ? 'aria-current="page"' : ''}>Track your booking</a>
          </div>
        </div>
      </nav>

      <!-- Truly Centered Logo Slot (Constant 16px Overhang) -->
      <div class="header-brand" id="headerBrandSlot">
        <a href="index.html" class="header-brand-link" title="Dack's Catering Services - Home">
          <picture>
            <source media="(max-width: 992px)" srcset="assets/img/logo-main.png" />
            <img src="assets/img/logo-main.png" alt="Dack's Catering Services Logo" class="header-logo-img" id="navLogoImg" width="120" height="120" />
          </picture>
        </a>
      </div>

      <!-- Desktop Right Group (Food Trays, About, Contact) -->
      <nav class="header-nav-group header-nav-right" aria-label="Primary Right Navigation">
        <!-- Food Trays: Straight Link -->
        <a href="food-orders.html" class="header-link ${isActive('food-orders')}" ${activePage === 'food-orders' ? 'aria-current="page"' : ''}>Food trays</a>

        <!-- About Dropdown -->
        <div class="nav-dropdown" data-dropdown="about">
          <button type="button" id="dropdown-about" class="header-link dropdown-toggle ${isActive('about') || isActive('gallery') ? 'active' : ''}" aria-haspopup="true" aria-expanded="false">
            About
            <svg class="dropdown-chevron" width="12" height="12" aria-hidden="true"><use href="assets/icons/sprite.svg#chevron-down"></use></svg>
          </button>
          <div class="dropdown-panel" role="menu" aria-labelledby="dropdown-about">
            <a href="about.html" class="dropdown-item ${isActive('about')}" role="menuitem" ${activePage === 'about' ? 'aria-current="page"' : ''}>Our story</a>
            <a href="gallery.html" class="dropdown-item ${isActive('gallery')}" role="menuitem" ${activePage === 'gallery' ? 'aria-current="page"' : ''}>Customer Gallery</a>
            <a href="about.html#faq" class="dropdown-item" role="menuitem">FAQ</a>
          </div>
        </div>

        <!-- Contact: Straight Link -->
        <a href="contact.html" class="header-link ${isActive('contact')}" ${activePage === 'contact' ? 'aria-current="page"' : ''}>Contact</a>
      </nav>

      <!-- Far Right Pinned Search Icon -->
      <div class="header-search-slot">
        <button class="header-search-btn" id="headerSearchTrigger" aria-label="Open global search (Press / or Ctrl+K)" title="Search (Ctrl+K)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>
    </div>

    <!-- Mobile Navigation Drawer -->
    <div class="mobile-drawer" id="mobileDrawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
      <div class="mobile-drawer-header">
        <img src="assets/img/logo-main.png" alt="Dack's Catering" style="height: 48px; width: auto;" />
        <button id="closeMobileDrawer" class="mobile-drawer-close" aria-label="Close menu">&times;</button>
      </div>
      <div class="mobile-nav-groups">
        <div class="mobile-nav-section">
          <button type="button" class="mobile-accordion-toggle" aria-expanded="true">
            Catering
            <svg class="accordion-chevron" width="14" height="14" aria-hidden="true"><use href="assets/icons/sprite.svg#chevron-down"></use></svg>
          </button>
          <div class="mobile-accordion-content is-open">
            <a href="packages.html" class="mobile-nav-link ${isActive('packages')}">Packages</a>
            <a href="menu.html" class="mobile-nav-link ${isActive('menu')}">Menu</a>
          </div>
        </div>
        <div class="mobile-nav-section">
          <a href="planner.html" class="mobile-nav-link direct-link ${isActive('planner')}">Event styling</a>
        </div>
        <div class="mobile-nav-section">
          <button type="button" class="mobile-accordion-toggle" aria-expanded="false">
            Book
            <svg class="accordion-chevron" width="14" height="14" aria-hidden="true"><use href="assets/icons/sprite.svg#chevron-down"></use></svg>
          </button>
          <div class="mobile-accordion-content">
            <a href="studio.html" class="mobile-nav-link ${isActive('studio')}">Book your date</a>
            <a href="track.html" class="mobile-nav-link ${isActive('track')}">Track your booking</a>
          </div>
        </div>
        <div class="mobile-nav-section">
          <a href="food-orders.html" class="mobile-nav-link direct-link ${isActive('food-orders')}">Food trays</a>
        </div>
        <div class="mobile-nav-section">
          <button type="button" class="mobile-accordion-toggle" aria-expanded="false">
            About
            <svg class="accordion-chevron" width="14" height="14" aria-hidden="true"><use href="assets/icons/sprite.svg#chevron-down"></use></svg>
          </button>
          <div class="mobile-accordion-content">
            <a href="about.html" class="mobile-nav-link ${isActive('about')}">Our story</a>
            <a href="gallery.html" class="mobile-nav-link ${isActive('gallery')}">Customer Gallery</a>
            <a href="about.html#faq" class="mobile-nav-link">FAQ</a>
          </div>
        </div>
        <div class="mobile-nav-section">
          <a href="contact.html" class="mobile-nav-link direct-link ${isActive('contact')}">Contact</a>
        </div>
      </div>
      <a href="studio.html" class="btn-primary mobile-book-btn">Book Your Date</a>
    </div>
  `;

  const slot = headerEl.querySelector('#tikim-header-slot');
  const existingInner = headerEl.querySelector('.header-inner');
  const existingDrawer = headerEl.querySelector('#mobileDrawer');
  if (slot) {
    slot.outerHTML = navHtml;
  } else if (existingInner) {
    existingInner.outerHTML = navHtml;
    if (existingDrawer) existingDrawer.remove();
  } else if (headerEl.children.length > 0) {
    headerEl.insertAdjacentHTML('afterbegin', navHtml);
  } else {
    headerEl.innerHTML = navHtml;
  }

  // Search trigger event
  const searchBtn = headerEl.querySelector('#headerSearchTrigger');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => openSearchModal());
  }

  // Mobile drawer controls
  const mobileBtn = headerEl.querySelector('#mobileMenuBtn');
  const drawer = headerEl.querySelector('#mobileDrawer');
  const closeBtn = headerEl.querySelector('#closeMobileDrawer');

  if (mobileBtn && drawer) {
    mobileBtn.addEventListener('click', () => {
      drawer.classList.add('open');
      mobileBtn.setAttribute('aria-expanded', 'true');
    });
  }
  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', () => {
      drawer.classList.remove('open');
      if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
    });
  }

  // Mobile drawer accordion toggles
  const accordions = headerEl.querySelectorAll('.mobile-accordion-toggle');
  accordions.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isExpanded));
      const content = toggle.nextElementSibling;
      if (content) {
        content.classList.toggle('is-open', !isExpanded);
      }
    });
  });

  // Revision 18A Part 1.2: Wrap nav and tab band in ONE sticky wrapper (header.site-header) so the band never scrolls away by itself.
  const adoptSubheader = () => {
    const subheader = document.querySelector('.subheader, .packages-subnav, #packagesSubheader, #menuSubheader, #foodOrdersSubheader, #gallerySubheader, .studio-tab-tracker-band, #studioTabTracker');
    if (subheader && subheader.parentElement !== headerEl) {
      headerEl.appendChild(subheader);
    }
  };
  adoptSubheader();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', adoptSubheader);
  }
  setTimeout(adoptSubheader, 0);
  setTimeout(adoptSubheader, 100);
}

function setupDropdownBehaviors() {
  const dropdowns = document.querySelectorAll('.nav-dropdown');

  function closeAll() {
    dropdowns.forEach(d => {
      d.classList.remove('open');
      const btn = d.querySelector('.dropdown-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function openDropdown(dropdown) {
    closeAll();
    dropdown.classList.add('open');
    const btn = dropdown.querySelector('.dropdown-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown(dropdown) {
    dropdown.classList.remove('open');
    const btn = dropdown.querySelector('.dropdown-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  dropdowns.forEach(dropdown => {
    const btn = dropdown.querySelector('.dropdown-toggle');
    const panel = dropdown.querySelector('.dropdown-panel');

    if (!btn || !panel) return;

    let hoverOpenTimer = null;
    let hoverCloseTimer = null;

    dropdown.addEventListener('mouseenter', () => {
      clearTimeout(hoverCloseTimer);
      hoverOpenTimer = setTimeout(() => {
        openDropdown(dropdown);
      }, 120);
    });

    dropdown.addEventListener('mouseleave', () => {
      clearTimeout(hoverOpenTimer);
      hoverCloseTimer = setTimeout(() => {
        closeDropdown(dropdown);
      }, 250);
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      if (isOpen) {
        closeDropdown(dropdown);
      } else {
        openDropdown(dropdown);
      }
    });

    btn.addEventListener('keydown', (e) => {
      const items = Array.from(panel.querySelectorAll('[role="menuitem"]'));
      if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        openDropdown(dropdown);
        if (items.length > 0) items[0].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openDropdown(dropdown);
        if (items.length > 0) items[items.length - 1].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown(dropdown);
      }
    });

    const items = Array.from(panel.querySelectorAll('[role="menuitem"]'));
    items.forEach((item, index) => {
      item.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = items[(index + 1) % items.length];
          next.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = items[(index - 1 + items.length) % items.length];
          prev.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          items[0].focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeDropdown(dropdown);
          btn.focus();
        }
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      closeAll();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAll();
    }
  });
}



export function openMyEventDrawer() {}
export function closeMyEventDrawer() {}


async function renderMyEventDrawerContent() {}
function injectScrollToTopBtn() {
  if (document.querySelector('.scroll-to-top-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'scroll-to-top-btn';
  btn.id = 'scrollToTopBtn';
  btn.setAttribute('aria-label', 'Scroll to top of page');
  btn.setAttribute('title', 'Scroll to top');
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
  `;
  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function injectFooter() {
  let footerEl = document.querySelector('.site-footer');
  if (!footerEl) {
    footerEl = document.createElement('footer');
    footerEl.className = 'site-footer';
    footerEl.id = 'siteFooter';
    const slot = document.getElementById('tikim-footer-slot');
    if (slot) {
      slot.replaceWith(footerEl);
    } else {
      document.body.appendChild(footerEl);
    }
  }

  footerEl.innerHTML = `
    <div class="footer-centered-wrap">
      <div class="footer-logo-wrap">
        <a href="index.html" class="footer-logo-link" title="Dack's Catering Services">
          <img src="assets/img/logo-main.png" alt="Dack's Catering Services Logo" class="footer-logo-img" width="68" height="68" loading="lazy" />
        </a>
      </div>
      <h2 class="footer-centered-title">GET IN TOUCH WITH US</h2>

      <!-- Row of 3 contact items with round teal badges -->
      <div class="footer-contact-row">
        <a href="tel:+639777523458" class="footer-contact-item" title="Call Dack's Catering">
          <span class="footer-contact-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </span>
          <span class="footer-contact-label">0977 752 3458</span>
        </a>

        <a href="https://facebook.com/dackscatering" target="_blank" rel="noopener noreferrer" class="footer-contact-item" title="Facebook">
          <span class="footer-contact-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </span>
          <span class="footer-contact-label">Dack's Catering Services</span>
        </a>

        <a href="https://instagram.com/dackscatering" target="_blank" rel="noopener noreferrer" class="footer-contact-item" title="Instagram">
          <span class="footer-contact-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
          </span>
          <span class="footer-contact-label">@dackscatering</span>
        </a>
      </div>

      <div class="footer-brand-name">DACK'S CATERING SERVICES</div>
      <div class="footer-address-line">
        Cruz Street, San Ildefonso, 3008 Bulacan, Philippines &bull; 0977 752 3458
      </div>

      <div class="footer-copyright-line">
        &copy; 2026 Dack's Catering Services. All Rights Reserved
      </div>

      <div class="footer-links-row">
        <a href="packages.html" class="footer-legal-link">Packages</a>
        <span class="footer-sep">&bull;</span>
        <a href="menu.html" class="footer-legal-link">Menu</a>
        <span class="footer-sep">&bull;</span>
        <a href="studio.html" class="footer-legal-link">Book</a>
        <span class="footer-sep">&bull;</span>
        <a href="contact.html" class="footer-legal-link">Contact</a>
        <span class="footer-sep">&bull;</span>
        <a href="privacy.html" class="footer-legal-link">Privacy Policy</a>
        <span class="footer-sep">&bull;</span>
        <a href="admin/login.html" class="footer-admin-link">Organizer Login</a>
      </div>
    </div>
  `;
}

function injectToastContainer() {
  if (document.querySelector('.tikim-toast-container')) return;
  const container = document.createElement('div');
  container.className = 'tikim-toast-container';
  container.id = 'toastContainer';
  document.body.appendChild(container);
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `tikim-toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function attachScrollBehaviors(activePage) {
  const header = document.querySelector('.site-header');
  const scrollToTopBtn = document.getElementById('scrollToTopBtn');

  const onScroll = () => {
    const scrollY = window.scrollY;

    if (header) {
      const isFixedNav = document.body.dataset.nav === 'fixed' || document.body.getAttribute('data-nav') === 'fixed';
      if (isFixedNav) {
        header.classList.remove('scrolled');
      } else if (scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }

    if (scrollToTopBtn) {
      if (scrollY > 400) {
        scrollToTopBtn.classList.add('visible');
      } else {
        scrollToTopBtn.classList.remove('visible');
      }
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
}

function setupDevAssertions() {
  const runAssertion = () => {
    const brandSlot = document.getElementById('headerBrandSlot');
    const logoImg = document.getElementById('navLogoImg');
    if (!brandSlot || !logoImg) return;

    const rect = brandSlot.getBoundingClientRect();
    const logoCenter = rect.left + rect.width / 2;
    const vpCenter = window.innerWidth / 2;
    const diff = Math.abs(logoCenter - vpCenter);

    if (window.innerWidth >= 1200) {
      console.assert(
        diff <= 1.05,
        `[TIKIM NAV ASSERTION] Logo center (${logoCenter.toFixed(2)}px) equals viewport center (${vpCenter.toFixed(2)}px) within 1px. Diff: ${diff.toFixed(2)}px`
      );
    }

    // Verify bounding box across pages
    const logoRect = logoImg.getBoundingClientRect();
    const curTop = Math.round(logoRect.top);
    const curHeight = Math.round(logoRect.height);
    try {
      const stored = sessionStorage.getItem('tikim.logoGeo');
      if (stored) {
        const prev = JSON.parse(stored);
        const topDiff = Math.abs(prev.top - curTop);
        const heightDiff = Math.abs(prev.height - curHeight);
        console.assert(
          topDiff <= 1 && heightDiff <= 1,
          `[TIKIM LOGO ASSERTION] Logo bounding box matches previous page within 1px (Top diff: ${topDiff}px, Height diff: ${heightDiff}px)`
        );
      } else {
        sessionStorage.setItem('tikim.logoGeo', JSON.stringify({ top: curTop, height: curHeight }));
      }
    } catch (e) {}
  };

  window.addEventListener('resize', runAssertion, { passive: true });
  setTimeout(runAssertion, 200);
}

export async function checkActiveQuoteAndHold() {}

function checkLinkAuditQuery() {
  if (window.location.search.includes('linkcheck=1')) {
    import('./link-check.js?v=' + Date.now()).then(module => {
      module.runLinkAudit();
    }).catch(err => {
      console.error('Failed to run link audit:', err);
    });
  }
}

function checkContrastAuditQuery() {
  if (window.location.search.includes('contrast=1')) {
    import('./contrast-audit.js?v=' + Date.now()).then(module => {
      module.runContrastAudit();
    }).catch(err => {
      console.error('Failed to run contrast audit:', err);
    });
  }
}

// Auto-initialize when document is ready
if (document.readyState !== 'loading') {
  const page = document.body ? (document.body.dataset.page || '') : '';
  initLayout(page);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body ? (document.body.dataset.page || '') : '';
    initLayout(page);
  });
}
