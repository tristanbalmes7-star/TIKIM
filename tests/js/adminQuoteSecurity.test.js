import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { escapeAdminText } from '../../public/js/adminText.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const adminSource = await readFile(resolve(root, 'public/js/pages/admin.js'), 'utf8');

test('admin text escaping renders HTML-like booking item names as literal text', () => {
  const maliciousName = '<img src=x onerror=alert(1)>';
  assert.equal(
    escapeAdminText(maliciousName),
    '&lt;img src=x onerror=alert(1)&gt;'
  );
  assert.match(adminSource, /<div style="font-weight:600;">\$\{escapeAdminText\(line\.name\)\}<\/div>/);
  assert.match(adminSource, /<span style="font-size:12px; font-weight:600;">\$\{escapeAdminText\(item\.name\)\}<\/span>/);
});

test('persisted floor-plan symbol values cannot inject markup into SVG', async () => {
  const { renderLayoutPreviewSvg } = await import('../../public/js/layoutPreview.js');
  const svg = renderLayoutPreviewSvg({
    units: [{ symbol: 'sym-chair" onload="alert(1)', x: 0, y: 0 }]
  });

  assert.match(svg, /href="#sym-round-table-5"/);
  assert.doesNotMatch(svg, /onload=/);
});

test('quote-update failure path contains no success notification', () => {
  const start = adminSource.indexOf("btnSaveQuote.addEventListener('click'");
  const end = adminSource.indexOf("document.getElementById('btnPrintBookingSummary')", start);
  const handler = adminSource.slice(start, end);
  const request = handler.indexOf('await mockApi.updateBookingQuote');
  const success = handler.indexOf("showAdminToast(`Quotation snapshot updated", request);
  const catchBlock = handler.indexOf('} catch (error) {', request);
  const errorToast = handler.indexOf("showAdminToast(feedback.textContent, 'error')", catchBlock);

  assert.notEqual(request, -1);
  assert.ok(success > request);
  assert.ok(catchBlock > success);
  assert.ok(errorToast > catchBlock);
  assert.doesNotMatch(handler.slice(catchBlock), /showAdminToast\([^;]*'success'/);
});
