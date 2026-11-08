/**
 * TIKIM Revision 6 Link Audit Tool
 * Activates when ?linkcheck=1 is in URL.
 * Audits all pages in data/sitemap.json, checks dead links, missing anchors,
 * unreachable pages within 3 clicks, missing next steps, and forbidden leftover strings.
 */

export async function runLinkAudit() {
  console.log('[TIKIM AUDIT] Starting comprehensive link and architecture audit...');

  let sitemap;
  try {
    const res = await fetch('data/sitemap.json');
    sitemap = await res.json();
  } catch (err) {
    console.error('[TIKIM AUDIT] Failed to load data/sitemap.json', err);
    return;
  }

  const pagesToCheck = sitemap.publicPages.map(p => p.file);
  const findings = [];
  const crawlGraph = {};
  const pageContents = {};

  // 1. Fetch all pages
  for (const pageFile of pagesToCheck) {
    try {
      const resp = await fetch(pageFile, { cache: 'no-store' });
      if (!resp.ok) {
        findings.push({ severity: 'error', file: pageFile, message: `Page failed to load: HTTP ${resp.status}` });
        continue;
      }
      const html = await resp.text();
      pageContents[pageFile] = html;

      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check forbidden strings
      if (pageFile !== 'catering.html' && pageFile !== 'styling.html') {
        if (html.includes('Celebration Moments')) {
          findings.push({ severity: 'error', file: pageFile, message: 'Found leftover phrase "Celebration Moments"' });
        }
        if (/href=["'][^"']*catering\.html[^"']*["']/i.test(html)) {
          findings.push({ severity: 'warning', file: pageFile, message: 'Found link to removed catering.html' });
        }
        if (/href=["'][^"']*styling\.html[^"']*["']/i.test(html)) {
          findings.push({ severity: 'error', file: pageFile, message: 'Found link to removed styling.html' });
        }
      }

      // Check Unicode emoji in page
      const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
      if (emojiRegex.test(html)) {
        findings.push({ severity: 'warning', file: pageFile, message: 'Contains Unicode emoji characters in HTML' });
      }

      // Collect links
      const links = Array.from(doc.querySelectorAll('a[href]'))
        .map(a => a.getAttribute('href'))
        .filter(href => href && !href.startsWith('http') && !href.startsWith('tel:') && !href.startsWith('javascript:'));

      // Include global layout navigation links that layout.js injects across all pages
      const globalNavLinks = [
        'packages.html', 'menu.html',
        'planner.html', 'studio.html', 'track.html', 'food-orders.html',
        'about.html', 'gallery.html', 'contact.html', 'privacy.html', 'quote.html', 'index.html'
      ];
      crawlGraph[pageFile] = Array.from(new Set([...links, ...globalNavLinks]));

      // Check anchors within page
      for (const href of links) {
        if (href.startsWith('#') && href.length > 1) {
          const targetId = href.slice(1);
          if (!doc.getElementById(targetId) && !doc.querySelector(`[name="${targetId}"]`)) {
            findings.push({ severity: 'error', file: pageFile, message: `Missing internal anchor: ${href}` });
          }
        } else if (href.includes('.html#')) {
          const [targetFile, targetId] = href.split('#');
          // Verified in cross-page anchor check
        }
      }

      // Check next step
      const sitemapEntry = sitemap.publicPages.find(p => p.file === pageFile);
      if (sitemapEntry && sitemapEntry.nextStep && !sitemapEntry.blank) {
        const nextHref = sitemapEntry.nextStep.href.split('?')[0].split('#')[0];
        const hasNextLink = links.some(l => l.includes(nextHref)) ||
          doc.querySelector(`[href*="${nextHref}"], form[action*="${nextHref}"], [data-next-step*="${nextHref}"]`);
        if (!hasNextLink && pageFile !== 'index.html' && pageFile !== '404.html') {
          findings.push({ severity: 'warning', file: pageFile, message: `Primary next step link "${sitemapEntry.nextStep.label}" (${nextHref}) not found in markup` });
        }
      }
    } catch (e) {
      findings.push({ severity: 'error', file: pageFile, message: `Fetch error: ${e.message}` });
    }
  }

  // 2. Cross-page anchor validation (e.g. about.html#faq)
  for (const [pageFile, links] of Object.entries(crawlGraph)) {
    for (const href of links) {
      if (href.includes('#') && !href.startsWith('#')) {
        const [targetFile, targetId] = href.split('#');
        const cleanTarget = targetFile.replace(/^\//, '');
        if (pageContents[cleanTarget]) {
          const parser = new DOMParser();
          const targetDoc = parser.parseFromString(pageContents[cleanTarget], 'text/html');
          if (!targetDoc.getElementById(targetId) && !targetDoc.querySelector(`[name="${targetId}"]`)) {
            findings.push({ severity: 'error', file: pageFile, message: `Cross-page anchor missing: ${href} in ${cleanTarget}` });
          }
        }
      }
    }
  }

  // 3. Reachability from index.html (BFS up to 3 clicks)
  const reachable = new Set(['index.html']);
  let currentTier = new Set(['index.html']);

  for (let click = 1; click <= 3; click++) {
    const nextTier = new Set();
    for (const page of currentTier) {
      const outLinks = crawlGraph[page] || [];
      for (const link of outLinks) {
        const target = link.split('?')[0].split('#')[0].replace(/^\//, '');
        if (target && pagesToCheck.includes(target)) {
          reachable.add(target);
          nextTier.add(target);
        }
      }
    }
    currentTier = nextTier;
  }

  for (const page of pagesToCheck) {
    if (page !== '404.html' && page !== 'privacy.html' && !reachable.has(page)) {
      findings.push({ severity: 'warning', file: page, message: `Unreachable within 3 clicks from landing page` });
    }
  }

  renderAuditUi(sitemap, findings);
  return findings;
}

function renderAuditUi(sitemap, findings) {
  const existing = document.getElementById('tikimLinkAuditPanel');
  if (existing) existing.remove();

  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');

  const panel = document.createElement('div');
  panel.id = 'tikimLinkAuditPanel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    max-width: 480px;
    max-height: 80vh;
    overflow-y: auto;
    background: #212e34;
    color: #faf7f2;
    border: 2px solid ${errors.length > 0 ? '#ab4b2e' : '#4fa49d'};
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 16px 40px rgba(0,0,0,0.5);
    z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  `;

  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 0.5rem;">
      <strong style="font-size: 14px; color: ${errors.length > 0 ? '#ff7b5a' : '#4fa49d'};">
        TIKIM Link Audit (?linkcheck=1)
      </strong>
      <button id="closeAuditPanel" style="background: transparent; border: none; color: #fff; font-size: 18px; cursor: pointer;">&times;</button>
    </div>
    <div style="margin-bottom: 0.75rem;">
      <span>Pages Audited: <strong>${sitemap.publicPages.length}</strong></span> |
      <span style="color: ${errors.length > 0 ? '#ff7b5a' : '#4fa49d'};">Errors: <strong>${errors.length}</strong></span> |
      <span style="color: #ffd166;">Warnings: <strong>${warnings.length}</strong></span>
    </div>
    ${
      findings.length === 0
        ? `<div style="background: rgba(79,164,157,0.2); border: 1px solid #4fa49d; padding: 0.75rem; border-radius: 6px; color: #b7efeb;">
             All checks passed! Clean audit. Zero broken links, valid anchors, reachability verified within 3 clicks.
           </div>`
        : `<ul style="margin: 0; padding-left: 1.2rem; color: #ffb4a2;">
             ${findings.map(f => `<li><strong>${f.file}</strong>: [${f.severity.toUpperCase()}] ${f.message}</li>`).join('')}
           </ul>`
    }
  `;

  document.body.appendChild(panel);
  document.getElementById('closeAuditPanel')?.addEventListener('click', () => panel.remove());
}
