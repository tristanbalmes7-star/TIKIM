// Sitewide SVG icon helper referencing assets/icons/sprite.svg

export function icon(name, options = {}) {
  const size = options.size || 18;
  const className = options.className || '';
  const label = options.label || '';
  const basePath = options.basePath || '';
  const ariaAttr = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  const spriteUrl = `${basePath}assets/icons/sprite.svg#icon-${name}`;
  return `<svg class="tikim-icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" ${ariaAttr}><use href="${spriteUrl}"></use></svg>`;
}

export function plannerIcon(name, options = {}) {
  const size = options.size || 36;
  const className = options.className || '';
  const basePath = options.basePath || '';
  const spriteUrl = `${basePath}assets/icons/planner-sprite.svg#sym-${name}`;
  return `<svg class="planner-sym-icon ${className}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><use href="${spriteUrl}"></use></svg>`;
}
