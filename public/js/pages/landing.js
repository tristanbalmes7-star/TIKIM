// Landing page interactive behaviors: hero engine, mini floor planner, claim-ticket tracker, and customer marquee.
import { TikimFloorPlanner } from '../floorplan.js';
import { initHeroEngine } from '../hero/hero-engine.js';
import { getBookingByRef } from '../mockApi.js';

let galleryData = [];
let currentLightboxIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
  initHeroEngine();
  initMiniFloorPlanner();
  initClaimTicketStub();
  initCustomerGalleryMarquee();
});

/* --------------------------------------------------------------------------
   1. LIVE MINI FLOOR PLANNER (Reusing floorplan.js without stage or arch)
   -------------------------------------------------------------------------- */
async function initMiniFloorPlanner() {
  const mount = document.getElementById('landingMiniPlanner');
  if (!mount) return;

  let landingLayout = null;
  try {
    const res = await fetch('data/landing-layout.json');
    if (res.ok) {
      landingLayout = await res.json();
    }
  } catch (e) {
    console.warn('Failed to load landing-layout.json', e);
  }

  const items = landingLayout && Array.isArray(landingLayout.items) ? landingLayout.items : null;
  const pax = (landingLayout && landingLayout.guests) || 36;

  const plannerInstance = new TikimFloorPlanner(mount, {
    isMini: true,
    pax: pax,
    initialItems: items,
    venuePreset: 'medium',
    syncWithQuote: false
  });

  window.__LANDING_MINI_PLANNER__ = plannerInstance;
}

/* --------------------------------------------------------------------------
   2. CLAIM-TICKET TRACKER (Section 4 - Already booked?)
   -------------------------------------------------------------------------- */
function initClaimTicketStub() {
  const form = document.getElementById('claimTicketForm');
  const errorMsg = document.getElementById('ticketErrorMsg');
  const refInput = document.getElementById('ticketRefInput');
  const mobileInput = document.getElementById('ticketMobileInput');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorMsg) errorMsg.style.display = 'none';

    const ref = (refInput?.value || '').trim().toUpperCase();
    const last4 = (mobileInput?.value || '').trim();

    const refPattern = /^(TK|TF)-\d{6}-\d{3}$/;
    const mobilePattern = /^\d{4}$/;

    if (!refPattern.test(ref) || !mobilePattern.test(last4)) {
      if (errorMsg) {
        errorMsg.textContent = "We couldn't find that booking. Check the reference and last 4 digits.";
        errorMsg.style.display = 'block';
      }
      return;
    }

    try {
      const booking = await getBookingByRef(ref, last4);
      if (!booking) {
        if (errorMsg) {
          errorMsg.textContent = "We couldn't find that booking. Check the reference and last 4 digits.";
          errorMsg.style.display = 'block';
        }
        return;
      }
      window.location.href = `track.html?ref=${encodeURIComponent(ref)}&m=${encodeURIComponent(last4)}`;
    } catch (err) {
      window.location.href = `track.html?ref=${encodeURIComponent(ref)}&m=${encodeURIComponent(last4)}`;
    }
  });
}

/* --------------------------------------------------------------------------
   3. CUSTOMER GALLERY CONTINUOUS HORIZONTAL MARQUEE (Section 7)
   -------------------------------------------------------------------------- */
async function initCustomerGalleryMarquee() {
  const section = document.getElementById('landingGalleryStrip');
  const track = document.getElementById('marqueeTrack');
  const footerLink = document.querySelector('.gallery-strip-footer');
  if (footerLink) footerLink.style.display = 'none';
  if (!track || !section) return;

  try {
    const res = await fetch('data/gallery.json');
    galleryData = await res.json();
  } catch (e) {
    console.error('Failed to load gallery items:', e);
    section.style.display = 'none';
    return;
  }

  // Hide entire section when fewer than 6 real customer photos exist
  if (!galleryData || !Array.isArray(galleryData) || galleryData.length < 6) {
    section.style.display = 'none';
    return;
  }

  // When 6 to 11 photos exist, repeat set until at least 12 items for seamless loop
  let itemsToLoop = [...galleryData];
  while (itemsToLoop.length < 12) {
    itemsToLoop = itemsToLoop.concat(galleryData);
  }
  const duplicated = [...itemsToLoop, ...itemsToLoop];

  track.innerHTML = duplicated.map((item, index) => {
    const originalIndex = index % galleryData.length;
    return `
      <div class="marquee-item" data-index="${originalIndex}" role="button" tabindex="0" aria-label="${item.title || 'Customer photo'}">
        <img 
          src="${item.image}" 
          alt="${item.title || 'Customer photo'}" 
          class="marquee-img" 
          loading="lazy" 
          decoding="async"
          width="${item.width || 360}"
          height="${item.height || 260}"
        />
      </div>
    `;
  }).join('');

  // Dynamically compute speed (~60px/second)
  requestAnimationFrame(() => {
    const trackWidth = track.scrollWidth / 2;
    if (trackWidth > 0) {
      const durationSeconds = Math.max(25, Math.round(trackWidth / 60));
      track.style.animationDuration = `${durationSeconds}s`;
    }
  });

  // Attach click and enter key handlers to open shared lightbox
  track.querySelectorAll('.marquee-item').forEach(el => {
    const idx = parseInt(el.dataset.index, 10);
    const trigger = () => openLandingLightbox(idx);
    el.addEventListener('click', trigger);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger();
      }
    });
  });

  bindLandingLightboxEvents();
}

function openLandingLightbox(index) {
  currentLightboxIndex = index;
  updateLandingLightboxContent();

  const modal = document.getElementById('galleryLightbox');
  const track = document.getElementById('marqueeTrack');

  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  if (track) {
    track.classList.add('is-paused');
  }
}

function closeLandingLightbox() {
  const modal = document.getElementById('galleryLightbox');
  const track = document.getElementById('marqueeTrack');

  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  if (track) {
    track.classList.remove('is-paused');
  }
}

function updateLandingLightboxContent() {
  const item = galleryData[currentLightboxIndex];
  if (!item) return;

  const imgEl = document.getElementById('lightboxImg');
  const titleEl = document.getElementById('lightboxTitle');
  const captionEl = document.getElementById('lightboxCaption');
  const eventEl = document.getElementById('lightboxEvent');
  const catEl = document.getElementById('lightboxCategory');
  const counterEl = document.getElementById('lightboxCounter');
  const useSetupBtn = document.getElementById('lightboxUseSetup');

  if (imgEl) {
    imgEl.src = item.image;
    imgEl.alt = item.title;
  }
  if (titleEl) titleEl.textContent = item.title;
  if (captionEl) captionEl.textContent = item.caption;
  if (eventEl) eventEl.textContent = item.eventType;
  if (catEl) catEl.textContent = item.category;
  if (counterEl) counterEl.textContent = `${currentLightboxIndex + 1} of ${Math.min(16, galleryData.length)}`;
  if (useSetupBtn) {
    useSetupBtn.href = `studio.html?event=${encodeURIComponent(item.eventType.toLowerCase())}`;
  }
}

function bindLandingLightboxEvents() {
  const modal = document.getElementById('galleryLightbox');
  const closeBtn = document.getElementById('lightboxClose');
  const backdrop = document.getElementById('lightboxBackdrop');
  const prevBtn = document.getElementById('lightboxPrev');
  const nextBtn = document.getElementById('lightboxNext');

  if (closeBtn) closeBtn.addEventListener('click', closeLandingLightbox);
  if (backdrop) backdrop.addEventListener('click', closeLandingLightbox);

  const total = Math.min(16, galleryData.length);

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentLightboxIndex = (currentLightboxIndex - 1 + total) % total;
      updateLandingLightboxContent();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentLightboxIndex = (currentLightboxIndex + 1) % total;
      updateLandingLightboxContent();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!modal || modal.style.display === 'none') return;
    if (e.key === 'Escape') closeLandingLightbox();
    if (e.key === 'ArrowLeft') {
      currentLightboxIndex = (currentLightboxIndex - 1 + total) % total;
      updateLandingLightboxContent();
    }
    if (e.key === 'ArrowRight') {
      currentLightboxIndex = (currentLightboxIndex + 1) % total;
      updateLandingLightboxContent();
    }
  });
}
