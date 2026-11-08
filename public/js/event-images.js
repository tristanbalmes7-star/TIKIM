// Resolves event package images from data/event-images.json with occasion fallback and placeholder.

let eventImagesCache = null;

const CANONICAL_MAP = {
  wedding: 'wedding',
  weddings: 'wedding',
  birthday: 'birthday',
  birthdays: 'birthday',
  debut: 'birthday',
  corporate: 'corporate',
  corporates: 'corporate',
  reunion: 'reunion',
  reunions: 'reunion',
  party: 'party',
  parties: 'party',
  other: 'other',
  others: 'other',
  'other occasions': 'other',
  'other-occasions': 'other',
  'other occassion': 'other',
  'other-occassion': 'other'
};

const DEFAULT_EVENT_IMAGES = {
  wedding: {
    file: 'assets/img/event-packages/weddings.jpg',
    width: 2048,
    height: 1536,
    alt: "Dack's Real Wedding Setup",
    objectPosition: 'center center'
  },
  birthday: {
    file: 'assets/img/event-packages/birthdays.jpg',
    width: 2048,
    height: 1155,
    alt: "Dack's Real Birthday Setup",
    objectPosition: 'center center'
  },
  corporate: {
    file: 'assets/img/event-packages/corporate.jpg',
    width: 1632,
    height: 1224,
    alt: "Dack's Real Corporate Seminar Setup",
    objectPosition: 'center center'
  },
  reunion: {
    file: 'assets/img/event-packages/reunion.jpg',
    width: 2048,
    height: 1154,
    alt: "Dack's Real Grand Reunion Setup",
    objectPosition: 'center center'
  },
  party: {
    file: 'assets/img/event-packages/party.jpg',
    width: 2048,
    height: 1152,
    alt: "Dack's Real Celebration Buffet Setup",
    objectPosition: 'center center'
  },
  other: {
    file: 'assets/img/event-packages/other occassion.jpg',
    width: 720,
    height: 960,
    alt: "Dack's Real Celebration Feast Spread",
    objectPosition: 'center center'
  }
};

export async function loadEventImages() {
  if (eventImagesCache) return eventImagesCache;
  try {
    const res = await fetch('data/event-images.json');
    if (res.ok) {
      eventImagesCache = await res.json();
      return eventImagesCache;
    }
  } catch (e) {
    console.warn('Failed to fetch data/event-images.json, using defaults', e);
  }
  eventImagesCache = { ...DEFAULT_EVENT_IMAGES };
  return eventImagesCache;
}

export function normalizeOccasionKey(type) {
  if (!type) return 'party';
  const clean = String(type).trim().toLowerCase().replace(/[-_]+/g, ' ');
  return CANONICAL_MAP[clean] || 'other';
}

export function createPlaceholderImage(label) {
  const safeLabel = String(label || 'Event Occasion').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="800" height="450" fill="#212e34"/><rect x="20" y="20" width="760" height="410" fill="none" stroke="#4fa49d" stroke-width="2" stroke-dasharray="8 8"/><text x="400" y="215" fill="#faf7f2" font-family="system-ui, sans-serif" font-size="24" font-weight="700" text-anchor="middle">${safeLabel}</text><text x="400" y="255" fill="#e4dbcf" font-family="system-ui, sans-serif" font-size="16" text-anchor="middle">Photo coming soon</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function resolveEventImage(type) {
  const data = await loadEventImages();
  const key = normalizeOccasionKey(type);
  const entry = data && data[key];

  if (entry && entry.file) {
    return {
      file: entry.file,
      width: entry.width || 1200,
      height: entry.height || 900,
      alt: entry.alt || `${key} catering setup`,
      objectPosition: entry.objectPosition || 'center center',
      isPlaceholder: false
    };
  }

  // Fallback to assets/img/occasions/
  const occasionFallback = `assets/img/occasions/${key}.jpg`;
  return {
    file: occasionFallback,
    width: 1200,
    height: 900,
    alt: `${key} catering setup`,
    objectPosition: 'center center',
    isPlaceholder: false,
    isFallback: true
  };
}

export function resolveEventImageSync(type) {
  const key = normalizeOccasionKey(type);
  const source = eventImagesCache || DEFAULT_EVENT_IMAGES;
  const entry = source[key];

  if (entry && entry.file) {
    return {
      file: entry.file,
      width: entry.width || 1200,
      height: entry.height || 900,
      alt: entry.alt || `${key} catering setup`,
      objectPosition: entry.objectPosition || 'center center',
      isPlaceholder: false
    };
  }

  return {
    file: `assets/img/occasions/${key}.jpg`,
    width: 1200,
    height: 900,
    alt: `${key} catering setup`,
    objectPosition: 'center center',
    isPlaceholder: false,
    isFallback: true
  };
}
