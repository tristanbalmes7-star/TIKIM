/**
 * TIKIM Celebration Gallery Logic
 * Powers masonry layout, multi-criteria filtering, lightbox modal, and setup preloader.
 */

let galleryItems = [];
let filteredItems = [];
let currentLightboxIndex = 0;
let currentEventFilter = 'all';
let currentCategoryFilter = 'all';

// Fallback visual generator for placeholder imagery
function getPlaceholderUrl(item) {
  if (item.image && (item.image.endsWith('.jpg') || item.image.endsWith('.png'))) {
    return item.image;
  }
  // Generate high quality inline SVG preview
  const title = encodeURIComponent(item.title);
  const cat = encodeURIComponent(item.category);
  const event = encodeURIComponent(item.eventType);
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><rect width="600" height="420" fill="%23212e34"/><circle cx="300" cy="180" r="140" fill="%234fa49d" opacity="0.12"/><path d="M120 340 L260 210 L360 300 L440 230 L520 340 Z" fill="%23ab4b2e" opacity="0.3"/><text x="50%25" y="45%25" font-family="sans-serif" font-weight="bold" font-size="22" fill="%23faf7f2" text-anchor="middle">${title}</text><text x="50%25" y="55%25" font-family="sans-serif" font-size="14" fill="%234fa49d" text-anchor="middle">${event} · ${cat}</text><text x="50%25" y="65%25" font-family="sans-serif" font-size="12" fill="%23ffffff" opacity="0.6" text-anchor="middle">Dack's Catering Services</text></svg>`;
}

async function initGallery() {
  try {
    const res = await fetch('data/gallery.json');
    galleryItems = await res.json();
    filteredItems = [...galleryItems];
    
    bindFilters();
    bindLightboxEvents();
    renderGallery();
  } catch (err) {
    console.error('Failed to load gallery items:', err);
  }
}

function bindFilters() {
  const eventChips = document.querySelectorAll('#eventTypeChips .chip');
  eventChips.forEach(chip => {
    chip.addEventListener('click', () => {
      eventChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-selected', 'true');
      currentEventFilter = chip.dataset.filter;
      applyFilters();
    });
  });

  const catChips = document.querySelectorAll('#categoryChips .chip');
  catChips.forEach(chip => {
    chip.addEventListener('click', () => {
      catChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-selected', 'true');
      currentCategoryFilter = chip.dataset.cat;
      applyFilters();
    });
  });

  const resetBtn = document.getElementById('resetGalleryFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentEventFilter = 'all';
      currentCategoryFilter = 'all';
      document.querySelectorAll('#eventTypeChips .chip').forEach((c, idx) => {
        c.classList.toggle('active', idx === 0);
        c.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      });
      document.querySelectorAll('#categoryChips .chip').forEach((c, idx) => {
        c.classList.toggle('active', idx === 0);
        c.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      });
      applyFilters();
    });
  }
}

function applyFilters() {
  filteredItems = galleryItems.filter(item => {
    const matchEvent = currentEventFilter === 'all' || item.eventType === currentEventFilter;
    const matchCat = currentCategoryFilter === 'all' || item.category === currentCategoryFilter;
    return matchEvent && matchCat;
  });

  const countEl = document.getElementById('galleryCount');
  if (countEl) {
    countEl.textContent = `Showing ${filteredItems.length} of ${galleryItems.length} setups`;
  }

  renderGallery();
}

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  if (!grid) return;

  if (filteredItems.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';

  grid.innerHTML = filteredItems.map((item, index) => {
    const imgSrc = getPlaceholderUrl(item);
    return `
      <article class="gallery-card" data-index="${index}" tabindex="0" role="button" aria-label="${item.title}">
        <div class="gallery-thumb-wrap">
          <img src="${imgSrc}" alt="${item.title}" class="gallery-img" loading="lazy">
          <div class="gallery-overlay">
            <div class="gallery-overlay-tags">
              <span class="badge badge-teal">${item.eventType}</span>
              <span class="badge badge-outline" style="border-color: rgba(255,255,255,0.4); color: #fff;">${item.category}</span>
            </div>
            <h3 class="gallery-overlay-title">${item.title}</h3>
            <span class="gallery-overlay-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              View Setup Details
            </span>
          </div>
        </div>
        <div class="gallery-card-info">
          <h4 class="gallery-card-title">${item.title}</h4>
          <p class="gallery-card-caption">${item.caption}</p>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.gallery-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index, 10);
      openLightbox(idx);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const idx = parseInt(card.dataset.index, 10);
        openLightbox(idx);
      }
    });
  });
}

function openLightbox(index) {
  if (index < 0 || index >= filteredItems.length) return;
  currentLightboxIndex = index;
  updateLightboxContent();

  const modal = document.getElementById('galleryLightbox');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeLightbox() {
  const modal = document.getElementById('galleryLightbox');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

function updateLightboxContent() {
  const item = filteredItems[currentLightboxIndex];
  if (!item) return;

  const imgEl = document.getElementById('lightboxImg');
  const titleEl = document.getElementById('lightboxTitle');
  const captionEl = document.getElementById('lightboxCaption');
  const eventEl = document.getElementById('lightboxEvent');
  const catEl = document.getElementById('lightboxCategory');
  const counterEl = document.getElementById('lightboxCounter');
  const useSetupBtn = document.getElementById('lightboxUseSetup');

  if (imgEl) {
    imgEl.src = getPlaceholderUrl(item);
    imgEl.alt = item.title;
  }
  if (titleEl) titleEl.textContent = item.title;
  if (captionEl) captionEl.textContent = item.caption;
  if (eventEl) eventEl.textContent = item.eventType;
  if (catEl) catEl.textContent = item.category;
  if (counterEl) {
    counterEl.textContent = `${currentLightboxIndex + 1} of ${filteredItems.length}`;
  }

  if (useSetupBtn) {
    const pkgParam = item.relatedPackageId ? `?package=${encodeURIComponent(item.relatedPackageId)}` : '';
    useSetupBtn.href = `studio.html${pkgParam}`;
  }
}

function bindLightboxEvents() {
  const closeBtn = document.getElementById('lightboxClose');
  const backdrop = document.getElementById('lightboxBackdrop');
  const prevBtn = document.getElementById('lightboxPrev');
  const nextBtn = document.getElementById('lightboxNext');
  const shareBtn = document.getElementById('lightboxShare');

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
  if (backdrop) backdrop.addEventListener('click', closeLightbox);

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentLightboxIndex = (currentLightboxIndex - 1 + filteredItems.length) % filteredItems.length;
      updateLightboxContent();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentLightboxIndex = (currentLightboxIndex + 1) % filteredItems.length;
      updateLightboxContent();
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const item = filteredItems[currentLightboxIndex];
      if (navigator.share) {
        try {
          await navigator.share({
            title: item.title,
            text: `Check out this setup by Dack's Catering: ${item.title}`,
            url: window.location.href
          });
        } catch (e) {
          // ignore share cancel
        }
      } else {
        await navigator.clipboard.writeText(window.location.href);
        if (window.tikimLayout && window.tikimLayout.showToast) {
          window.tikimLayout.showToast('Gallery link copied to clipboard!', 'info');
        } else {
          alert('Link copied to clipboard!');
        }
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('galleryLightbox');
    if (!modal || modal.style.display === 'none') return;

    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      currentLightboxIndex = (currentLightboxIndex - 1 + filteredItems.length) % filteredItems.length;
      updateLightboxContent();
    } else if (e.key === 'ArrowRight') {
      currentLightboxIndex = (currentLightboxIndex + 1) % filteredItems.length;
      updateLightboxContent();
    }
  });

  // Simple touch swipe support
  let touchStartX = 0;
  const modal = document.getElementById('galleryLightbox');
  if (modal) {
    modal.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    modal.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      if (touchEndX < touchStartX - 50) {
        currentLightboxIndex = (currentLightboxIndex + 1) % filteredItems.length;
        updateLightboxContent();
      } else if (touchEndX > touchStartX + 50) {
        currentLightboxIndex = (currentLightboxIndex - 1 + filteredItems.length) % filteredItems.length;
        updateLightboxContent();
      }
    }, { passive: true });
  }
}

document.addEventListener('DOMContentLoaded', initGallery);
