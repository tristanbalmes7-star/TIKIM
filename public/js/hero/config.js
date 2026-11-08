// Hero Engine Configuration: Tunable Timeline, Dimensions, and Device Adapters for 9-Photo Mosaic.

export const DEFAULT_HERO_CONFIG = {
  // Track heights in vh
  trackHeightDesktop: 260,
  trackHeightMobile: 300,
  
  // Scrub smoothing for ScrollTrigger
  scrub: 0.6,
  lenisLerp: 0.1,

  // A. Shrink Timeline (0.00 to 0.60)
  shrinkStart: 0.00,
  shrinkEnd: 0.60,
  finalScaleDesktop: 0.50,
  finalScaleMobile: 0.46,
  cardTopDesktopVh: 16,
  cardTopMobileVh: 14,
  targetRadiusPx: 28,
  innerZoomStart: 1.00,
  innerZoomEnd: 1.00,
  shrinkEase: 'power2.inOut',

  // B. Fracture / 9-Photo Mosaic Timeline (0.10 to 0.72)
  // Scaled down by 25% from Rev 3/4 baseline for 9 panels
  fractureStart: 0.10,
  fracturePeak: 0.40,
  fractureEnd: 0.72,
  shardSpread: 1.0, // 0 disables fracture completely
  baseGapMin: 0.0225,
  baseGapMax: 0.06,
  maxDriftPx: 9,
  maxRotateDeg: 0.45,

  // C. Logo Docking Timeline (0.00 to 0.55)
  logoDockStart: 0.00,
  logoDockEnd: 0.55,
  initialLogoHeightDesktop: 220,
  initialLogoHeightMobile: 150,
  targetLogoHeightPx: 54,

  // D. Copy Entrance Timeline (0.45 to 0.85)
  copyStart: 0.45,
  copyEnd: 0.85,
  copySlideDistancePx: 35,

  // E. Nav & Hint Milestones
  scrollHintFadeEnd: 0.10,
  navSolidThreshold: 0.10,
  holdStart: 0.85,
  holdEnd: 1.00
};

// Evaluate hardware constraints, prefers-reduced-motion, and URL overrides
export function resolveHeroConfig() {
  const config = { ...DEFAULT_HERO_CONFIG };
  const params = new URLSearchParams(window.location.search);

  // Allow URL param ?hero=simple to force shrink-only mode
  if (params.get('hero') === 'simple') {
    config.shardSpread = 0;
  }

  // Detect low-tier hardware or reduced motion
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (cores <= 4 || memory <= 4 || prefersReduced) {
    // Low-end devices and prefers-reduced-motion: skip fracture and only shrink
    config.shardSpread = 0;
  }

  // Check stored tune overrides from ?tune=1 if present
  try {
    const saved = localStorage.getItem('tikim.hero_tune_config');
    if (saved) {
      Object.assign(config, JSON.parse(saved));
    }
  } catch (e) {
    // ignore parse errors
  }

  return config;
}
