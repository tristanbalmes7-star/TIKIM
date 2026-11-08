// Self-contained inline SVG venue floor plan renderer and validator.

export const PLANNER_SYMBOLS_SVG = `
  <symbol id="sym-round-table-5" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="30" fill="#f5efe6" stroke="#212e34" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="24" fill="none" stroke="#4fa49d" stroke-width="1" stroke-dasharray="3,2"/>
    <circle cx="50" cy="10" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="88" cy="37.6" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="73.5" cy="82.4" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="26.5" cy="82.4" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="12" cy="37.6" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <text x="50" y="54" font-family="DM Sans, sans-serif" font-size="12" font-weight="700" fill="#212e34" text-anchor="middle">5</text>
  </symbol>
  <symbol id="sym-square-table-4" viewBox="0 0 100 100">
    <rect x="24" y="24" width="52" height="52" rx="4" fill="#f5efe6" stroke="#212e34" stroke-width="2.5"/>
    <rect x="28" y="28" width="44" height="44" rx="2" fill="none" stroke="#4fa49d" stroke-width="1" stroke-dasharray="3,2"/>
    <circle cx="50" cy="12" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="50" cy="88" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="12" cy="50" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="88" cy="50" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <text x="50" y="54" font-family="DM Sans, sans-serif" font-size="12" font-weight="700" fill="#212e34" text-anchor="middle">4</text>
  </symbol>
  <symbol id="sym-long-table" viewBox="0 0 100 100">
    <rect x="15" y="30" width="70" height="40" rx="4" fill="#f5efe6" stroke="#212e34" stroke-width="2.5"/>
    <circle cx="30" cy="18" r="6" fill="#ffffff" stroke="#ab4b2e" stroke-width="1.8"/>
    <circle cx="50" cy="18" r="6" fill="#ffffff" stroke="#ab4b2e" stroke-width="1.8"/>
    <circle cx="70" cy="18" r="6" fill="#ffffff" stroke="#ab4b2e" stroke-width="1.8"/>
    <circle cx="30" cy="82" r="6" fill="#ffffff" stroke="#ab4b2e" stroke-width="1.8"/>
    <circle cx="50" cy="82" r="6" fill="#ffffff" stroke="#ab4b2e" stroke-width="1.8"/>
    <circle cx="70" cy="82" r="6" fill="#ffffff" stroke="#ab4b2e" stroke-width="1.8"/>
    <text x="50" y="54" font-family="DM Sans, sans-serif" font-size="11" font-weight="700" fill="#212e34" text-anchor="middle">Long (6)</text>
  </symbol>
  <symbol id="sym-buffet-table" viewBox="0 0 100 100">
    <rect x="10" y="28" width="80" height="44" rx="4" fill="#212e34" stroke="#4fa49d" stroke-width="2.5"/>
    <rect x="18" y="36" width="16" height="28" rx="2" fill="#e4dbcf" stroke="#212e34" stroke-width="1.5"/>
    <rect x="42" y="36" width="16" height="28" rx="2" fill="#e4dbcf" stroke="#212e34" stroke-width="1.5"/>
    <rect x="66" y="36" width="16" height="28" rx="2" fill="#e4dbcf" stroke="#212e34" stroke-width="1.5"/>
  </symbol>
  <symbol id="sym-presidential-table" viewBox="0 0 100 100">
    <rect x="8" y="35" width="84" height="30" rx="3" fill="#e4dbcf" stroke="#ab4b2e" stroke-width="2.5"/>
    <line x1="8" y1="50" x2="92" y2="50" stroke="#4fa49d" stroke-width="2" stroke-dasharray="4,2"/>
    <circle cx="22" cy="22" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="40" cy="22" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="60" cy="22" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="78" cy="22" r="7" fill="#ffffff" stroke="#ab4b2e" stroke-width="2"/>
    <text x="50" y="55" font-family="DM Sans, sans-serif" font-size="9" font-weight="700" fill="#212e34" text-anchor="middle">Presidential</text>
  </symbol>
  <symbol id="sym-chair" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="28" fill="#ffffff" stroke="#212e34" stroke-width="3"/>
    <path d="M26 40 Q50 20 74 40" fill="none" stroke="#4fa49d" stroke-width="3"/>
  </symbol>
  <symbol id="sym-wooden-chair" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="28" fill="#f5efe6" stroke="#ab4b2e" stroke-width="3"/>
    <line x1="32" y1="32" x2="68" y2="68" stroke="#ab4b2e" stroke-width="2.5"/>
    <line x1="68" y1="32" x2="32" y2="68" stroke="#ab4b2e" stroke-width="2.5"/>
  </symbol>
  <symbol id="sym-couch" viewBox="0 0 100 100">
    <rect x="12" y="30" width="76" height="40" rx="8" fill="#e4dbcf" stroke="#212e34" stroke-width="3"/>
    <rect x="18" y="24" width="64" height="16" rx="4" fill="#212e34" stroke="#4fa49d" stroke-width="2"/>
    <text x="50" y="56" font-family="DM Sans, sans-serif" font-size="11" font-weight="700" fill="#212e34" text-anchor="middle">Couch (3)</text>
  </symbol>
  <symbol id="sym-stage" viewBox="0 0 100 100">
    <rect x="5" y="15" width="90" height="70" rx="4" fill="#212e34" stroke="#4fa49d" stroke-width="3"/>
    <polygon points="50,25 58,42 77,43 62,55 68,73 50,62 32,73 38,55 23,43 42,42" fill="none" stroke="#e4dbcf" stroke-width="1.5"/>
    <text x="50" y="55" font-family="Fraunces, serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">STAGE</text>
  </symbol>
  <symbol id="sym-photobooth" viewBox="0 0 100 100">
    <rect x="15" y="20" width="70" height="60" rx="6" fill="#e4dbcf" stroke="#ab4b2e" stroke-width="3"/>
    <circle cx="50" cy="50" r="14" fill="#212e34" stroke="#4fa49d" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="6" fill="#ffffff"/>
    <text x="50" y="74" font-family="DM Sans, sans-serif" font-size="9" font-weight="700" fill="#212e34" text-anchor="middle">PHOTOBOOTH</text>
  </symbol>
  <symbol id="sym-entrance-arc" viewBox="0 0 100 100">
    <path d="M15 80 Q50 10 85 80" fill="none" stroke="#4fa49d" stroke-width="8" stroke-linecap="round"/>
    <path d="M15 80 Q50 10 85 80" fill="none" stroke="#212e34" stroke-width="2" stroke-linecap="round"/>
    <circle cx="15" cy="80" r="6" fill="#ab4b2e"/>
    <circle cx="85" cy="80" r="6" fill="#ab4b2e"/>
  </symbol>
  <symbol id="sym-balloon-arch" viewBox="0 0 100 100">
    <path d="M18 80 Q50 15 82 80" fill="none" stroke="#e4dbcf" stroke-width="4" stroke-dasharray="1,8" stroke-linecap="round"/>
    <circle cx="20" cy="75" r="7" fill="#4fa49d"/>
    <circle cx="32" cy="55" r="7" fill="#ab4b2e"/>
    <circle cx="50" cy="35" r="7" fill="#f5efe6" stroke="#212e34"/>
    <circle cx="68" cy="55" r="7" fill="#4fa49d"/>
    <circle cx="80" cy="75" r="7" fill="#ab4b2e"/>
  </symbol>
  <symbol id="sym-cake-table" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="32" fill="#f5efe6" stroke="#212e34" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="18" fill="#e4dbcf" stroke="#ab4b2e" stroke-width="2"/>
    <circle cx="50" cy="50" r="8" fill="#ffffff" stroke="#4fa49d" stroke-width="1.5"/>
  </symbol>
  <symbol id="sym-dance-floor" viewBox="0 0 100 100">
    <defs>
      <pattern id="danceHatchPreview" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="10" stroke="#4fa49d" stroke-width="2.5" />
      </pattern>
    </defs>
    <rect x="5" y="5" width="90" height="90" rx="4" fill="#212e34" stroke="#4fa49d" stroke-width="2.5"/>
    <rect x="5" y="5" width="90" height="90" rx="4" fill="url(#danceHatchPreview)" opacity="0.75"/>
    <text x="50" y="55" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#faf7f2" text-anchor="middle" letter-spacing="1">DANCE FLOOR</text>
  </symbol>
  <symbol id="sym-lights-rig" viewBox="0 0 120 20">
    <rect x="2" y="2" width="116" height="16" rx="2" fill="#212e34" stroke="#e4dbcf" stroke-width="1.5"/>
    <line x1="4" y1="6" x2="116" y2="6" stroke="#4fa49d" stroke-width="1.5"/>
    <line x1="4" y1="14" x2="116" y2="14" stroke="#4fa49d" stroke-width="1.5"/>
    <path d="M6 6 L14 14 L22 6 L30 14 L38 6 L46 14 L54 6 L62 14 L70 6 L78 14 L86 6 L94 14 L102 6 L110 14" fill="none" stroke="#e4dbcf" stroke-width="1"/>
    <circle cx="16" cy="10" r="3.5" fill="#faf7f2" stroke="#ab4b2e" stroke-width="1"/>
    <circle cx="36" cy="10" r="3.5" fill="#4fa49d" stroke="#faf7f2" stroke-width="1"/>
    <circle cx="60" cy="10" r="4" fill="#faf7f2" stroke="#ab4b2e" stroke-width="1.2"/>
    <circle cx="84" cy="10" r="3.5" fill="#4fa49d" stroke="#faf7f2" stroke-width="1"/>
    <circle cx="104" cy="10" r="3.5" fill="#faf7f2" stroke="#ab4b2e" stroke-width="1"/>
  </symbol>
  <symbol id="sym-speaker" viewBox="0 0 100 100">
    <rect x="25" y="15" width="50" height="70" rx="4" fill="#212e34" stroke="#ffffff" stroke-width="2"/>
    <circle cx="50" cy="38" r="12" fill="#4fa49d"/>
    <circle cx="50" cy="65" r="14" fill="#ab4b2e"/>
  </symbol>
  <symbol id="sym-light-stand" viewBox="0 0 100 100">
    <line x1="50" y1="20" x2="50" y2="80" stroke="#212e34" stroke-width="4"/>
    <line x1="20" y1="20" x2="80" y2="20" stroke="#212e34" stroke-width="4"/>
    <circle cx="28" cy="20" r="6" fill="#4fa49d"/>
    <circle cx="50" cy="20" r="6" fill="#4fa49d"/>
    <circle cx="72" cy="20" r="6" fill="#4fa49d"/>
    <polygon points="50,80 30,95 70,95" fill="#212e34"/>
  </symbol>
  <symbol id="sym-styro-board" viewBox="0 0 100 100">
    <rect x="10" y="32" width="80" height="36" rx="4" fill="#f5efe6" stroke="#212e34" stroke-width="2.5"/>
    <text x="50" y="55" font-family="Caveat, cursive" font-size="16" font-weight="700" fill="#ab4b2e" text-anchor="middle">Celebrant Name</text>
  </symbol>
  <symbol id="sym-backdrop" viewBox="0 0 100 100">
    <rect x="8" y="40" width="84" height="20" rx="2" fill="#e4dbcf" stroke="#212e34" stroke-width="2.5"/>
    <line x1="8" y1="50" x2="92" y2="50" stroke="#4fa49d" stroke-width="2"/>
  </symbol>
`;

export function renderLayoutPreviewSvg(layout = {}, options = {}) {
  const l = layout || {};
  const units = Array.isArray(l.units)
    ? l.units
    : (Array.isArray(l.items) ? l.items : []);

  const venueW = Number(l.venueWidth) || (l.venueWidthM ? l.venueWidthM * 40 : 600);
  const venueH = Number(l.venueHeight) || (l.venueHeightM ? l.venueHeightM * 40 : 400);

  const maxHeight = options.maxHeight ? `max-height: ${options.maxHeight};` : '';
  const maxWidth = options.maxWidth ? `max-width: ${options.maxWidth};` : '';
  const style = `width: 100%; height: auto; display: block; border-radius: 8px; ${maxWidth} ${maxHeight}`;

  // Generate subtle background grid
  let gridLines = '';
  const step = 40;
  for (let x = step; x < venueW; x += step) {
    gridLines += `<line x1="${x}" y1="0" x2="${x}" y2="${venueH}" stroke="#e4dbcf" stroke-width="1" stroke-dasharray="2,2"/>`;
  }
  for (let y = step; y < venueH; y += step) {
    gridLines += `<line x1="0" y1="${y}" x2="${venueW}" y2="${y}" stroke="#e4dbcf" stroke-width="1" stroke-dasharray="2,2"/>`;
  }

  // Draw units
  const unitsMarkup = units.map(u => {
    const cx = (Number(u.x) || 0) + (Number(u.width) || 50) / 2;
    const cy = (Number(u.y) || 0) + (Number(u.height) || 50) / 2;
    const rot = Number(u.rotation) || 0;
    const scale = Number(u.scale) || 1.0;
    const w = Number(u.width) || 50;
    const h = Number(u.height) || 50;
    const requestedSymbol = String(u.symbol || '');
    const symId = /^sym-[a-z0-9-]+$/.test(requestedSymbol)
      ? requestedSymbol
      : 'sym-round-table-5';
    const transform = `translate(${cx}, ${cy}) rotate(${rot}) scale(${scale}) translate(${-w / 2}, ${-h / 2})`;

    return `
      <g transform="${transform}">
        <use href="#${symId}" x="0" y="0" width="${w}" height="${h}"/>
      </g>
    `;
  }).join('');

  const emptyText = units.length === 0
    ? `<text x="${venueW / 2}" y="${venueH / 2}" font-family="DM Sans, sans-serif" font-size="16" font-weight="600" fill="#212e34" text-anchor="middle">No floor plan items placed</text>`
    : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${venueW} ${venueH}" class="layout-preview-svg" style="${style}" role="img" aria-label="Floor plan preview">
      <defs>
        ${PLANNER_SYMBOLS_SVG}
      </defs>
      <!-- Paper background fill -->
      <rect x="0" y="0" width="${venueW}" height="${venueH}" fill="#faf7f2" rx="8"/>
      <!-- Grid -->
      <g class="preview-grid" opacity="0.6">
        ${gridLines}
      </g>
      <!-- Venue boundary -->
      <rect x="2" y="2" width="${venueW - 4}" height="${venueH - 4}" fill="none" stroke="#212e34" stroke-width="3" rx="8"/>
      <!-- Placed units -->
      <g class="preview-units">
        ${unitsMarkup}
      </g>
      ${emptyText}
    </svg>
  `;
}

export async function generateSafeThumbnail(layout = {}, width = 300) {
  const l = layout || {};
  const venueW = Number(l.venueWidth) || 600;
  const venueH = Number(l.venueHeight) || 400;
  const height = Math.round((width * venueH) / venueW);

  const svgStr = renderLayoutPreviewSvg(layout);

  if (typeof document === 'undefined') {
    return { dataUrl: '', meanLuminance: 1.0, isSafe: true, svg: svgStr };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Explicit solid paper background fill
  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(0, 0, width, height);

  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      try {
        const imgData = ctx.getImageData(0, 0, width, height).data;
        let totalLum = 0;
        const totalPixels = imgData.length / 4;
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          totalLum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        }
        const meanLuminance = totalLum / totalPixels;
        const isSafe = meanLuminance >= 0.6;
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ dataUrl, meanLuminance, isSafe, svg: svgStr });
      } catch (err) {
        resolve({ dataUrl: '', meanLuminance: 1.0, isSafe: true, svg: svgStr });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ dataUrl: '', meanLuminance: 1.0, isSafe: false, svg: svgStr });
    };

    img.src = url;
  });
}

export const LayoutPreview = {
  render: renderLayoutPreviewSvg,
  generateThumbnail: generateSafeThumbnail
};
