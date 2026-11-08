// Hero Engine: Orchestrates GSAP ScrollTrigger timeline, Lenis smooth scroll, 9-photo mosaic, and dev tools.

import { resolveHeroConfig } from './config.js';
import { buildHeroShards } from './shards.js';

let lenisInstance = null;
let currentTimeline = null;
let currentScrollTrigger = null;

export async function initHeroEngine() {
  const track = document.getElementById('heroTrack');
  const stage = document.getElementById('heroStage');
  const art = document.getElementById('heroArt');
  const logo = document.getElementById('brandLogo');
  const copy = document.getElementById('heroCopy');
  const scrollHint = document.getElementById('heroScroll');
  const navHeader = document.getElementById('siteHeader');
  const navSlot = document.getElementById('headerBrandSlot');

  if (!track || !stage || !art) return;

  const config = resolveHeroConfig();
  const isReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isGsapAvailable = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

  // Fallback: If reduced-motion or GSAP failed to load, render static final state
  if (isReduced || !isGsapAvailable) {
    renderStaticFinalState({ art, logo, copy, scrollHint, navHeader, config });
    setupTitleSwitcher();
    return;
  }

  // Setup title variant switcher (?title=a, b, c; T key toggle)
  setupTitleSwitcher();

  // Register GSAP plugins
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll with Lenis (desktop only, disabled on touch and reduced-motion)
  initLenisSmoothScroll(config);

  // Build 9-photo mosaic panels
  const shardsList = await buildHeroShards(art);

  // Build the scrubbed timeline
  buildHeroTimeline({
    track,
    stage,
    art,
    logo,
    copy,
    scrollHint,
    navHeader,
    navSlot,
    shardsList,
    config
  });

  // Setup Dev Tools (?debug=1 and ?tune=1)
  setupDevTools(config);

  // Refresh triggers when images and fonts finish loading
  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
  });

  // Handle window resize with debounced shard and timeline rebuild
  let resizeTimeout = null;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(async () => {
      const newWidth = window.innerWidth;
      const crossedBreakpoint = (lastWidth <= 768 && newWidth > 768) || (lastWidth > 768 && newWidth <= 768);
      lastWidth = newWidth;
      if (crossedBreakpoint) {
        const newShards = await buildHeroShards(art);
        buildHeroTimeline({
          track,
          stage,
          art,
          logo,
          copy,
          scrollHint,
          navHeader,
          navSlot,
          shardsList: newShards,
          config
        });
      }
      ScrollTrigger.refresh();
    }, 150);
  });

  // Restore scroll and p state on back/forward cache navigation
  window.addEventListener('pageshow', () => {
    ScrollTrigger.refresh();
  });
}

function initLenisSmoothScroll(config) {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (isTouch || typeof Lenis === 'undefined') return;

  lenisInstance = new Lenis({
    lerp: config.lenisLerp,
    smoothWheel: true
  });

  lenisInstance.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenisInstance.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // Route in-page anchor clicks through Lenis
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#' || targetId === '#main-content') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        lenisInstance.scrollTo(target, { offset: -60, duration: 1.2 });
      }
    });
  });
}

function buildHeroTimeline(ctx) {
  const {
    track,
    art,
    logo,
    copy,
    scrollHint,
    navHeader,
    navSlot,
    shardsList,
    config
  } = ctx;

  const isMobile = window.innerWidth <= 768;
  const isShortScreen = window.innerHeight < 700;
  let finalScale = isMobile ? config.finalScaleMobile : config.finalScaleDesktop;
  let targetTopVh = isMobile ? config.cardTopMobileVh : config.cardTopDesktopVh;

  if (isShortScreen && !isMobile) {
    targetTopVh = 15;
    finalScale = 0.44;
  }

  // Clear any existing instances on rebuild
  if (currentTimeline) currentTimeline.kill();
  if (currentScrollTrigger) currentScrollTrigger.kill();

  // Master scrub timeline
  const tl = gsap.timeline({
    paused: true
  });

  // Measure initial and target docking logo geometry
  const logoGeo = measureLogoGeometry(logo, navSlot);

  // Track scroll progress object for normalized updates
  const progressProxy = { p: 0 };

  tl.to(progressProxy, {
    p: 1.0,
    ease: 'none',
    duration: 1.0,
    onUpdate: () => {
      const p = progressProxy.p;
      applyTimelineStep(p, {
        art,
        logo,
        copy,
        scrollHint,
        navHeader,
        shardsList,
        config,
        finalScale,
        targetTopVh,
        logoGeo,
        isMobile
      });

      // Update HUD if debug is active
      if (window.__tikimDebugUpdate) {
        window.__tikimDebugUpdate(p);
      }
    }
  });

  currentScrollTrigger = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: 'bottom bottom',
    scrub: config.scrub,
    animation: tl,
    onToggle: (self) => {
      if (self.isActive) {
        art.style.willChange = 'transform, border-radius';
        if (logo) logo.style.willChange = 'transform';
        if (shardsList) {
          shardsList.forEach(s => { s.el.style.willChange = 'transform'; });
        }
      } else {
        art.style.willChange = 'auto';
        if (logo) logo.style.willChange = 'auto';
        if (shardsList) {
          shardsList.forEach(s => { s.el.style.willChange = 'auto'; });
        }
      }
    }
  });

  currentTimeline = tl;

  // Initialize initial state immediately at p = 0
  applyTimelineStep(0, {
    art,
    logo,
    copy,
    scrollHint,
    navHeader,
    shardsList,
    config,
    finalScale,
    targetTopVh,
    logoGeo,
    isMobile
  });
}

function applyTimelineStep(p, s) {
  const {
    art,
    logo,
    copy,
    scrollHint,
    shardsList,
    config,
    finalScale,
    targetTopVh,
    logoGeo
  } = s;

  // --------------------------------------------------------------------------
  // A. 0.00 to 0.60 SHRINK: .hero-art from full-bleed to framed card
  // --------------------------------------------------------------------------
  const shrinkP = clamp01((p - config.shrinkStart) / (config.shrinkEnd - config.shrinkStart));
  const easeShrink = gsap.parseEase(config.shrinkEase)(shrinkP);

  const currentScale = 1.0 - (1.0 - finalScale) * easeShrink;
  const currentTopVh = targetTopVh * easeShrink;
  
  // Counter-scale border-radius so it reads exactly targetRadiusPx in rendered pixels
  const renderedRadius = (config.targetRadiusPx / currentScale) * easeShrink;

  art.style.transform = `translate3d(0, ${currentTopVh}vh, 0) scale(${currentScale.toFixed(4)})`;
  art.style.borderRadius = `${renderedRadius.toFixed(2)}px`;

  // --------------------------------------------------------------------------
  // B. 0.10 to 0.72 FRACTURE: 9 photo panels scale, drift, and rotate
  // --------------------------------------------------------------------------
  if (config.shardSpread > 0 && shardsList && shardsList.length > 0) {
    let fractureFactor = 0;
    if (p >= config.fractureStart && p <= config.fractureEnd) {
      if (p <= config.fracturePeak) {
        fractureFactor = (p - config.fractureStart) / (config.fracturePeak - config.fractureStart);
      } else {
        fractureFactor = 1.0 - (p - config.fracturePeak) / (config.fractureEnd - config.fracturePeak);
      }
    }
    // Smooth bell curve
    const smoothFactor = fractureFactor * fractureFactor * (3 - 2 * fractureFactor) * config.shardSpread;

    shardsList.forEach((shard) => {
      const depth = shard.depth || 0.5;
      const gap = (config.baseGapMin + (config.baseGapMax - config.baseGapMin) * depth) * smoothFactor;
      const shardScale = 1.0 - gap;
      
      const dirY = shard.centroid[1] > 0.5 ? 1 : -1;
      const dirX = shard.centroid[0] > 0.5 ? 1 : (shard.centroid[0] < 0.4 ? -1 : 0);
      
      const driftY = depth * config.maxDriftPx * smoothFactor * dirY;
      const driftX = depth * (config.maxDriftPx * 0.7) * smoothFactor * dirX;
      const rot = depth * config.maxRotateDeg * smoothFactor * (dirX !== 0 ? dirX : 1);

      shard.el.style.transform = `translate3d(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px, 0) scale(${shardScale.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`;
    });
  }

  // --------------------------------------------------------------------------
  // C. 0.00 to 0.55 LOGO DOCKING: Smooth movement from center into nav slot
  // --------------------------------------------------------------------------
  if (logo && logoGeo) {
    const dockP = clamp01((p - config.logoDockStart) / (config.logoDockEnd - config.logoDockStart));
    const easeDock = dockP * dockP * (3 - 2 * dockP);

    const curX = logoGeo.startX + (logoGeo.targetX - logoGeo.startX) * easeDock;
    const curY = logoGeo.startY + (logoGeo.targetY - logoGeo.startY) * easeDock;
    const curScale = 1.0 + (logoGeo.targetScale - 1.0) * easeDock;

    logo.style.transform = `translate3d(calc(-50% + ${curX.toFixed(2)}px), calc(-50% + ${curY.toFixed(2)}px), 0) scale(${curScale.toFixed(4)})`;

    if (dockP >= 0.98) {
      document.body.classList.add('logo-docked');
    } else {
      document.body.classList.remove('logo-docked');
    }
  }

  // --------------------------------------------------------------------------
  // D. 0.45 to 0.85 COPY: Title and glowing Book Your Date button
  // --------------------------------------------------------------------------
  if (copy) {
    const copyP = clamp01((p - config.copyStart) / (config.copyEnd - config.copyStart));
    const easeCopy = copyP * copyP * (3 - 2 * copyP);
    const copyY = (1.0 - easeCopy) * config.copySlideDistancePx;

    copy.style.opacity = easeCopy.toFixed(3);
    copy.style.transform = `translate3d(0, ${copyY.toFixed(2)}px, 0)`;
  }

  // --------------------------------------------------------------------------
  // E. Scroll Hint Fading
  // --------------------------------------------------------------------------
  if (scrollHint) {
    const hintOpacity = Math.max(0, 1.0 - (p / config.scrollHintFadeEnd));
    scrollHint.style.opacity = hintOpacity.toFixed(2);
    scrollHint.style.pointerEvents = hintOpacity <= 0 ? 'none' : 'auto';
  }
}

function measureLogoGeometry(logoEl, navSlotEl) {
  if (!logoEl) return null;
  const isMobile = window.innerWidth <= 768;
  const baseH = isMobile ? 160 : 240;
  const winW = document.documentElement.clientWidth;
  const winH = window.innerHeight;

  // Viewport center over hero card
  const startX = 0;
  const startY = isMobile ? -20 : -10;

  // Target center in #headerBrandSlot relative to viewport center
  let targetH = isMobile ? 84 : 112;
  let slotCenterX = winW / 2;
  let slotCenterY = isMobile ? 34 : 48;

  const targetSlot = navSlotEl || document.getElementById('headerBrandSlot');
  if (targetSlot) {
    const rect = targetSlot.getBoundingClientRect();
    if (rect.height > 20 && rect.width > 20) {
      slotCenterX = rect.left + (rect.width / 2);
      const targetImg = targetSlot.querySelector('.header-logo-img');
      if (targetImg) {
        const imgRect = targetImg.getBoundingClientRect();
        if (imgRect.height > 20) {
          targetH = imgRect.height;
          slotCenterX = imgRect.left + (imgRect.width / 2);
          slotCenterY = imgRect.top + (imgRect.height / 2);
        } else {
          slotCenterY = rect.top + (targetH / 2);
        }
      } else {
        slotCenterY = rect.top + (targetH / 2);
      }
    }
  }

  // The nav grid columns (1fr, constant logo slot, 1fr) are symmetric, so targetX is exactly 0
  const targetX = 0;
  const targetY = slotCenterY - (winH / 2);
  const targetScale = targetH / baseH;

  return {
    startX,
    startY,
    targetX,
    targetY,
    targetScale
  };
}

function renderStaticFinalState({ art, logo, copy, scrollHint, config }) {
  const isMobile = window.innerWidth <= 768;
  const finalScale = isMobile ? config.finalScaleMobile : config.finalScaleDesktop;
  const targetTopVh = isMobile ? config.cardTopMobileVh : config.cardTopDesktopVh;

  if (art) {
    art.style.transform = `translate3d(0, ${targetTopVh}vh, 0) scale(${finalScale})`;
    art.style.borderRadius = `${config.targetRadiusPx}px`;
  }
  if (copy) {
    copy.style.opacity = '1';
    copy.style.transform = 'none';
  }
  if (scrollHint) {
    scrollHint.style.display = 'none';
  }
  if (logo) {
    document.body.classList.add('logo-docked');
    logo.style.opacity = '0';
  }
}

function setupDevTools(config) {
  const params = new URLSearchParams(window.location.search);

  // 1. ?debug=1 HUD
  if (params.get('debug') === '1') {
    createDebugHud();
  }

  // 2. ?tune=1 Interactive Configuration Drawer
  if (params.get('tune') === '1') {
    createTuningPanel(config);
  }
}

function createDebugHud() {
  const hud = document.createElement('div');
  hud.id = 'heroDebugHud';
  hud.innerHTML = `
    <div style="position:fixed;bottom:1.5rem;right:1.5rem;z-index:99999;background:rgba(33,46,52,0.92);color:#4fa49d;border:1px solid #4fa49d;border-radius:10px;padding:0.75rem 1rem;font-family:monospace;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,0.5);backdrop-filter:blur(8px);">
      <div>HERO 9-PHOTO HUD</div>
      <div>Progress (p): <span id="debugHudP" style="color:#fff;">0.000</span></div>
      <div>FPS: <span id="debugHudFps" style="color:#fff;">60</span></div>
    </div>
  `;
  document.body.appendChild(hud);

  const pEl = document.getElementById('debugHudP');
  const fpsEl = document.getElementById('debugHudFps');

  let lastTime = performance.now();
  let frameCount = 0;
  let fps = 60;

  function countFps() {
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      fps = Math.round((frameCount * 1000) / (now - lastTime));
      if (fpsEl) fpsEl.textContent = fps;
      frameCount = 0;
      lastTime = now;
    }
    requestAnimationFrame(countFps);
  }
  requestAnimationFrame(countFps);

  window.__tikimDebugUpdate = (p) => {
    if (pEl) pEl.textContent = p.toFixed(3);
  };
}

function createTuningPanel(config) {
  const panel = document.createElement('div');
  panel.id = 'heroTunePanel';
  panel.innerHTML = `
    <div style="position:fixed;top:80px;right:1.5rem;width:320px;max-height:80vh;overflow-y:auto;z-index:99999;background:#212e34;color:#fff;border:1px solid #4fa49d;border-radius:12px;padding:1.25rem;font-family:sans-serif;font-size:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid rgba(79,164,157,0.3);padding-bottom:0.5rem;">
        <strong style="color:#4fa49d;font-size:14px;">Hero 9-Photo Tuner (?tune=1)</strong>
        <button id="closeTuneBtn" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;">&times;</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <label>Final Scale Desktop: <span id="val_finalScaleDesktop">${config.finalScaleDesktop}</span>
          <input type="range" min="0.4" max="0.9" step="0.01" value="${config.finalScaleDesktop}" data-key="finalScaleDesktop" style="width:100%;" />
        </label>
        <label>Card Top Vh: <span id="val_cardTopDesktopVh">${config.cardTopDesktopVh}</span>
          <input type="range" min="5" max="25" step="1" value="${config.cardTopDesktopVh}" data-key="cardTopDesktopVh" style="width:100%;" />
        </label>
        <label>Panel Spread Factor: <span id="val_shardSpread">${config.shardSpread}</span>
          <input type="range" min="0" max="2" step="0.1" value="${config.shardSpread}" data-key="shardSpread" style="width:100%;" />
        </label>
        <label>Max Drift Px (9-photo): <span id="val_maxDriftPx">${config.maxDriftPx}</span>
          <input type="range" min="0" max="20" step="1" value="${config.maxDriftPx}" data-key="maxDriftPx" style="width:100%;" />
        </label>
        <label>Max Rotate Deg: <span id="val_maxRotateDeg">${config.maxRotateDeg}</span>
          <input type="range" min="0" max="1.5" step="0.05" value="${config.maxRotateDeg}" data-key="maxRotateDeg" style="width:100%;" />
        </label>
        <label>Scrub Lag: <span id="val_scrub">${config.scrub}</span>
          <input type="range" min="0.1" max="1.5" step="0.05" value="${config.scrub}" data-key="scrub" style="width:100%;" />
        </label>
      </div>

      <div style="margin-top:1.25rem;display:flex;flex-direction:column;gap:0.5rem;">
        <button id="copyTuneJsonBtn" style="background:#4fa49d;color:#212e34;font-weight:700;border:none;border-radius:6px;padding:0.6rem;cursor:pointer;">Copy config JSON</button>
        <button id="resetTuneBtn" style="background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:6px;padding:0.4rem;cursor:pointer;">Reset Defaults</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  panel.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', (e) => {
      const key = e.target.dataset.key;
      const val = parseFloat(e.target.value);
      config[key] = val;
      const span = document.getElementById(`val_${key}`);
      if (span) span.textContent = val;
      localStorage.setItem('tikim.hero_tune_config', JSON.stringify(config));
      ScrollTrigger.refresh();
    });
  });

  const copyBtn = document.getElementById('copyTuneJsonBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      copyBtn.textContent = 'Copied to Clipboard!';
      setTimeout(() => { copyBtn.textContent = 'Copy config JSON'; }, 1800);
    });
  }

  const resetBtn = document.getElementById('resetTuneBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem('tikim.hero_tune_config');
      window.location.reload();
    });
  }

  const closeBtn = document.getElementById('closeTuneBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.remove();
    });
  }
}

function clamp01(val) {
  return Math.max(0, Math.min(1, val));
}

// Dev switcher: ?title=a, b, c; T key toggle with corner badge
export function setupTitleSwitcher() {
  const params = new URLSearchParams(window.location.search);
  let currentVariant = (params.get('title') || 'a').toLowerCase();
  if (!['a', 'b', 'c'].includes(currentVariant)) currentVariant = 'a';

  const badge = document.getElementById('titleDevBadge');

  const variantLabels = {
    a: 'Variant A: Brush stack',
    b: 'Variant B: Stamp',
    c: 'Variant C: Single line'
  };

  let hideTimeout = null;

  function applyVariant(v, showBadge = false) {
    currentVariant = v;
    const variants = document.querySelectorAll('.hero-title-variant');
    variants.forEach(el => {
      el.style.display = 'none';
    });
    const activeEl = document.querySelector(`.hero-title-variant-${v}`);
    if (activeEl) {
      activeEl.style.display = 'flex';
      if (v === 'a') {
        const path = activeEl.querySelector('.hero-brush-underline path');
        if (path) {
          path.style.animation = 'none';
          void path.offsetWidth;
          path.style.animation = 'drawBrushUnderline 700ms ease-out forwards';
        }
      }
    }

    if (badge && showBadge) {
      badge.textContent = `Title: ${variantLabels[v] || v.toUpperCase()}`;
      badge.style.display = 'block';
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        badge.style.display = 'none';
      }, 3500);
    }

    window.__currentTitleVariant = v;

    const url = new URL(window.location);
    if (v === 'a' && !params.has('title')) {
      // keep clean default
    } else {
      url.searchParams.set('title', v);
      window.history.replaceState({}, '', url);
    }
  }

  // Initial apply (show badge if ?title= was explicitly provided)
  applyVariant(currentVariant, params.has('title'));

  // Dev switcher: keydown listener for 'T'
  window.addEventListener('keydown', (e) => {
    const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (targetTag === 'input' || targetTag === 'textarea' || (e.target && e.target.isContentEditable)) return;

    if (e.key === 't' || e.key === 'T') {
      const order = ['a', 'b', 'c'];
      const nextIdx = (order.indexOf(currentVariant) + 1) % order.length;
      applyVariant(order[nextIdx], true);
    }
  });

  window.__applyTitleVariant = applyVariant;
}

