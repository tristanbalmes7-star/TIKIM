// Test automation helper for verifying subheader positioning and menu scroll-spy accuracy.
export async function runMenuScrollVerification() {
  const categories = ['chicken', 'beef', 'pork', 'fish', 'vegetables', 'pasta', 'drinks', 'desserts', 'special-dishes'];
  
  // Create randomized sequence of 9 tabs x 3 = 27 clicks
  const sequence = [];
  for (let round = 0; round < 3; round++) {
    const shuffled = [...categories].sort(() => Math.random() - 0.5);
    sequence.push(...shuffled);
  }

  const results = [];
  const rootStyles = getComputedStyle(document.documentElement);
  const navH = parseFloat(rootStyles.getPropertyValue('--nav-h')) || 96;
  const subH = parseFloat(rootStyles.getPropertyValue('--sub-h')) || 58;
  const offsetLine = navH + subH;

  for (let i = 0; i < sequence.length; i++) {
    const slug = sequence[i];
    const tab = document.querySelector(`#menuTabsScroll .subheader-tab[data-cat="${slug}"]`);
    if (!tab) {
      results.push({ round: i + 1, slug, pass: false, reason: 'Tab not found' });
      continue;
    }

    tab.click();
    await new Promise(r => setTimeout(r, 900));

    const row = document.getElementById(`cat-${slug}`);
    const heading = row ? (row.querySelector('.category-title') || row) : null;
    const headingTop = heading ? heading.getBoundingClientRect().top : 9999;
    const diff = Math.abs(headingTop - offsetLine);
    const isTabActive = tab.classList.contains('active');
    const pass = diff <= 4.5 && isTabActive;

    results.push({
      step: i + 1,
      slug,
      headingTop: Math.round(headingTop),
      offsetLine: Math.round(offsetLine),
      diff: Math.round(diff * 10) / 10,
      isTabActive,
      pass
    });
  }

  const passedCount = results.filter(r => r.pass).length;
  const summary = {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    allPassed: passedCount === results.length,
    results
  };

  console.log('[MENU SCROLL TEST RESULTS]', summary);
  window.__menuScrollTestSummary = summary;
  return summary;
}

export function verifySubheaderAlignment() {
  const header = document.querySelector('.site-header');
  const subheader = document.querySelector('.subheader');

  if (!header || !subheader) {
    return { pass: false, reason: 'Header or subheader missing' };
  }

  const nav = header.querySelector('.header-inner') || header;
  const navRect = nav.getBoundingClientRect();
  const subRect = subheader.getBoundingClientRect();
  const gap = Math.abs(subRect.top - navRect.bottom);
  const pass = gap <= 1.0;

  const res = {
    pass,
    navBottom: navRect.bottom,
    subTop: subRect.top,
    gap: Math.round(gap * 10) / 10
  };

  console.log('[SUBHEADER ALIGNMENT TEST]', res);
  window.__subheaderAlignmentSummary = res;
  return res;
}

if (typeof window !== 'undefined') {
  window.runMenuScrollVerification = runMenuScrollVerification;
  window.verifySubheaderAlignment = verifySubheaderAlignment;
}
