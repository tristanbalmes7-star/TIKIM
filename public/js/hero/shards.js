// Hero Mosaic Builder: Renders the 9-photo mosaic from data/hero-photos.json with responsive WebP/JPEG srcset.

export async function buildHeroShards(containerEl) {
  containerEl.innerHTML = '';

  let photos = await loadHeroPhotos();
  if (!photos || photos.length === 0) {
    photos = getDefaultHeroPhotos();
  }

  // Exactly 9 photos
  const selectedPhotos = photos.slice(0, 9);
  if (selectedPhotos.length < 9) {
    console.warn(`[Hero Engine] Expected 9 photos, found ${selectedPhotos.length}. Filling placeholders.`);
    while (selectedPhotos.length < 9) {
      const idx = selectedPhotos.length + 1;
      selectedPhotos.push({
        id: `photo${idx}`,
        name: `photo${idx}`,
        src: `assets/img/hero/photo${idx}-1200.webp`,
        fallback: `assets/img/hero/photo${idx}.jpg`,
        srcset: `assets/img/hero/photo${idx}-640.webp 640w, assets/img/hero/photo${idx}-1200.webp 1200w, assets/img/hero/photo${idx}-1800.webp 1800w`,
        sizes: '(max-width: 768px) 33vw, 33vw',
        width: 1600,
        height: 1200,
        alt: `Dack's Catering Celebration Photo ${idx}`,
        focus: '50% 50%',
        mobileFocus: '50% 50%',
        depth: 0.3 + (idx * 0.08)
      });
    }
  }

  const mosaic = document.createElement('div');
  mosaic.className = 'hero-mosaic';
  mosaic.id = 'heroMosaic';
  containerEl.appendChild(mosaic);

  const panelsList = [];
  const isMobile = window.innerWidth <= 768;

  selectedPhotos.forEach((photo, idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;

    // Centroid normalized coordinates for directional drift
    const cx = (col + 0.5) / 3;
    const cy = (row + 0.5) / 3;

    const panel = document.createElement('div');
    panel.className = 'hero-panel';
    panel.id = `heroPanel${idx}`;
    panel.dataset.depth = photo.depth || (0.3 + (idx % 7) * 0.1);

    const pic = document.createElement('picture');

    // WebP responsive sources
    if (photo.srcset) {
      const source = document.createElement('source');
      source.type = 'image/webp';
      source.srcset = photo.srcset;
      source.sizes = photo.sizes || '(max-width: 768px) 33vw, 33vw';
      pic.appendChild(source);
    }

    const img = document.createElement('img');
    img.className = 'hero-photo';
    img.src = photo.src || photo.fallback;
    img.alt = photo.alt || `Dack's Celebration ${idx + 1}`;
    img.width = photo.width || 1600;
    img.height = photo.height || 1200;

    // Loading & decoding priority budget rules
    if (idx === 0) {
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
      img.decoding = 'async';
    } else if (idx < 3) {
      img.loading = 'eager';
      img.decoding = 'async';
    } else {
      img.loading = 'lazy';
      img.decoding = 'async';
    }

    // Focal point alignment
    const focal = (isMobile && photo.mobileFocus) ? photo.mobileFocus : (photo.focus || '50% 50%');
    img.style.objectPosition = focal;

    pic.appendChild(img);
    panel.appendChild(pic);
    mosaic.appendChild(panel);

    panelsList.push({
      el: panel,
      imgEl: img,
      depth: photo.depth || (0.3 + (idx % 7) * 0.1),
      centroid: [cx, cy],
      row,
      col
    });
  });

  return panelsList;
}

async function loadHeroPhotos() {
  try {
    const res = await fetch('data/hero-photos.json');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[Hero Engine] Unable to fetch data/hero-photos.json, falling back to embedded list:', e);
  }
  return null;
}

function getDefaultHeroPhotos() {
  const depths = [0.45, 0.85, 0.35, 0.95, 0.60, 0.75, 0.30, 0.50, 0.70];
  const photos = [];
  for (let i = 1; i <= 9; i++) {
    photos.push({
      id: `photo${i}`,
      name: `photo${i}`,
      src: `assets/img/hero/photo${i}-1200.webp`,
      fallback: `assets/img/hero/photo${i}.jpg`,
      srcset: `assets/img/hero/photo${i}-640.webp 640w, assets/img/hero/photo${i}-1200.webp 1200w, assets/img/hero/photo${i}-1800.webp 1800w`,
      sizes: '(max-width: 768px) 33vw, 33vw',
      width: 1600,
      height: 1200,
      alt: `Dack's Catering Celebration Photo ${i}`,
      focus: '50% 50%',
      mobileFocus: '50% 50%',
      depth: depths[i - 1]
    });
  }
  return photos;
}
