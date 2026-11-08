/**
 * TIKIM Revision 12: WCAG AA Color Contrast Auditor (?contrast=1)
 * Traverses visible text nodes, composites ancestor background layers,
 * flags text over images without solid backings, and evaluates WCAG AA compliance.
 */

// Surface color definitions per Revision 12 (3.1)
export const SURFACE_PAIRS = {
  'on-light': { bg: '#faf7f2', fg: '#212e34', ratio: 13.8 },
  'on-stone': { bg: '#e4dbcf', fg: '#212e34', ratio: 10.4 },
  'on-dark': { bg: '#212e34', fg: '#faf7f2', ratio: 13.8 },
  'on-rust': { bg: '#ab4b2e', fg: '#faf7f2', ratio: 5.6 },
  'on-teal-deep': { bg: '#2f6f69', fg: '#faf7f2', ratio: 5.4 },
  'on-teal': { bg: '#4fa49d', fg: '#212e34', ratio: 5.2 } // Never white on #4fa49d
};

function parseColor(colorStr) {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'inherit') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  // rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = colorStr.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]),
      g: parseFloat(rgbaMatch[2]),
      b: parseFloat(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    };
  }
  // Hex #rgb, #rgba, #rrggbb, #rrggbbaa
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    const a = hex.length >= 8 ? (parseInt(hex.slice(6, 8), 16) / 255) : 1;
    return { r, g, b, a };
  }
  // Named color fallback using temporary canvas or element
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = colorStr;
  const computed = ctx.fillStyle;
  if (computed.startsWith('#')) {
    return parseColor(computed);
  }
  return { r: 33, g: 46, b: 52, a: 1 };
}

function compositeColor(fg, bg) {
  // Alpha blending: out = fg.a * fg + (1 - fg.a) * bg
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const r = (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a;
  const g = (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a;
  const b = (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a;
  return { r, g, b, a };
}

function getEffectiveBackground(el) {
  let curr = el;
  let bgComposite = { r: 0, g: 0, b: 0, a: 0 };
  let hasImage = false;

  while (curr && curr !== document) {
    const style = window.getComputedStyle(curr);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return { color: { r: 250, g: 247, b: 242, a: 1 }, hasImage: false, isHidden: true };
    }

    if (style.backgroundImage && style.backgroundImage !== 'none' && !style.backgroundImage.includes('gradient')) {
      if (bgComposite.a < 0.8) {
        hasImage = true;
      }
    }

    const color = parseColor(style.backgroundColor);
    if (color.a > 0) {
      bgComposite = compositeColor(color, bgComposite);
      if (bgComposite.a >= 0.99) {
        break;
      }
    }
    curr = curr.parentElement;
  }

  // Composite over page root default (#faf7f2) if still semi-transparent
  if (bgComposite.a < 0.99) {
    bgComposite = compositeColor(bgComposite, { r: 250, g: 247, b: 242, a: 1 });
  }

  return { color: bgComposite, hasImage, isHidden: false };
}

function linearize(val) {
  const c = val / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function getLuminance(rgb) {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

function getContrastRatio(fgRgb, bgRgb) {
  const l1 = getLuminance(fgRgb);
  const l2 = getLuminance(bgRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHex(rgb) {
  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function runContrastAudit() {
  const existing = document.getElementById('contrastAuditOverlay');
  if (existing) existing.remove();

  const results = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'svg', 'template'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest('#contrastAuditOverlay') || parent.closest('.sr-only')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const checkedElements = new Set();

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const el = textNode.parentElement;
    if (!el || checkedElements.has(el)) continue;
    checkedElements.add(el);

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      continue;
    }

    const fgColor = parseColor(style.color);
    const { color: bgColor, hasImage, isHidden } = getEffectiveBackground(el);
    if (isHidden) continue;

    const effectiveFg = fgColor.a < 1 ? compositeColor(fgColor, bgColor) : fgColor;
    const ratio = getContrastRatio(effectiveFg, bgColor);

    const fontSize = parseFloat(style.fontSize) || 16;
    const fontWeight = parseInt(style.fontWeight, 10) || (style.fontWeight === 'bold' ? 700 : 400);
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const threshold = isLarge ? 3.0 : 4.5;

    const passesRatio = ratio >= threshold;
    const passes = passesRatio && !hasImage;

    results.push({
      el,
      text: el.textContent.trim().slice(0, 60),
      tag: el.tagName.toLowerCase(),
      className: el.className || '',
      ratio: Math.round(ratio * 100) / 100,
      threshold,
      isLarge,
      fgHex: rgbToHex(effectiveFg),
      bgHex: rgbToHex(bgColor),
      hasImage,
      passes
    });
  }

  const failures = results.filter(r => !r.passes);

  // Render audit panel overlay
  renderAuditOverlay(results, failures);

  window.__contrastAuditResult = {
    totalChecked: results.length,
    failureCount: failures.length,
    passed: failures.length === 0,
    failures: failures.map(f => ({
      text: f.text,
      tag: f.tag,
      className: f.className,
      ratio: f.ratio,
      threshold: f.threshold,
      fgHex: f.fgHex,
      bgHex: f.bgHex,
      hasImage: f.hasImage
    }))
  };

  console.log(`[Contrast Audit] Checked ${results.length} elements. Failures: ${failures.length}`, window.__contrastAuditResult);
  return window.__contrastAuditResult;
}

function renderAuditOverlay(results, failures) {
  const overlay = document.createElement('div');
  overlay.id = 'contrastAuditOverlay';
  overlay.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    max-width: 440px;
    max-height: 80vh;
    background: #212e34;
    color: #faf7f2;
    border: 2px solid ${failures.length === 0 ? '#4fa49d' : '#ab4b2e'};
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    z-index: 10000;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  overlay.innerHTML = `
    <div style="padding: 12px 16px; background: ${failures.length === 0 ? '#2f6f69' : '#ab4b2e'}; display: flex; justify-content: space-between; align-items: center;">
      <strong style="font-size: 14px;">WCAG AA Contrast Audit (?contrast=1)</strong>
      <button id="btnCloseContrastOverlay" style="background:none; border:none; color:#faf7f2; font-size:18px; cursor:pointer;">&times;</button>
    </div>
    <div style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <div style="display: flex; gap: 12px; margin-bottom: 6px;">
        <span>Checked: <strong>${results.length}</strong></span>
        <span style="color: #4fa49d;">Pass: <strong>${results.length - failures.length}</strong></span>
        <span style="color: ${failures.length === 0 ? '#4fa49d' : '#fca5a5'};">Failures: <strong>${failures.length}</strong></span>
      </div>
      <div style="font-size: 11px; opacity: 0.85;">
        ${failures.length === 0 ? 'All visible text meets or exceeds WCAG AA standards.' : 'The following text nodes fail WCAG AA (4.5:1 / 3:1) or lack solid backing:'}
      </div>
    </div>
    <div style="padding: 8px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px;">
      ${failures.length === 0 ? `
        <div style="padding: 20px; text-align: center; color: #4fa49d; font-weight: bold;">
          ZERO Contrast Failures on this page!
        </div>
      ` : failures.map((f, i) => `
        <div style="background: rgba(255,255,255,0.06); padding: 8px; border-radius: 6px; border-left: 3px solid #ab4b2e;">
          <div style="font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            "${f.text}"
          </div>
          <div style="display: flex; gap: 8px; font-size: 11px; margin-top: 4px; opacity: 0.9;">
            <span>Ratio: <strong style="color: #fca5a5;">${f.ratio}:1</strong> (req ${f.threshold}:1)</span>
            <span>FG: <code>${f.fgHex}</code></span>
            <span>BG: <code>${f.bgHex}</code></span>
          </div>
          ${f.hasImage ? '<div style="color: #fdba74; font-size: 10px; margin-top: 2px;">Needs solid backing over image</div>' : ''}
        </div>
      `).join('')}
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('btnCloseContrastOverlay')?.addEventListener('click', () => {
    overlay.remove();
  });
}

// Auto-run if query param contrast=1 is present
if (typeof window !== 'undefined' && window.location.search.includes('contrast=1')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(runContrastAudit, 300));
  } else {
    setTimeout(runContrastAudit, 300);
  }
}
