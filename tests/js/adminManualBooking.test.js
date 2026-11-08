import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const adminSource = await readFile(resolve(root, 'public/js/pages/admin.js'), 'utf8');
const apiSource = await readFile(resolve(root, 'public/js/mockApi.js'), 'utf8');

test('both manual booking entry points share the Laravel-backed modal flow', () => {
  assert.match(adminSource, /btnQuickNewBooking[^]*openManualBookingModal/);
  assert.match(adminSource, /btnNewManualBooking[^]*openManualBookingModal/);
  assert.match(adminSource, /await mockApi\.createManualBooking\(payload\)/);
  assert.match(apiSource, /'\/api\/v1\/admin\/bookings\/manual'/);
});

test('manual creation does not send client financials, reference, status, or simulated SMS', () => {
  const start = adminSource.indexOf('async function openManualBookingModal()');
  const end = adminSource.indexOf('/* --------------------------------------------------------------------------\n   3. QUOTATION BUILDER VIEW', start);
  const handler = adminSource.slice(start, end);

  assert.ok(start >= 0);
  assert.doesNotMatch(handler, /65000|randPart|refNumber|holdExpiresAt|mockApi\.createBooking/);
  assert.match(handler, /mockApi\.createManualBooking\(payload\)/);
  assert.doesNotMatch(handler, /simulateSms|queueSms/);
  assert.match(handler, /creating = true/);
  assert.match(handler, /creating = false/);
  assert.match(handler, /submit\.disabled = creating \|\| previewLoading \|\| !previewSignature/);
  assert.match(handler, /feedback\.textContent = error\.message/);
});

test('manual API adapter sends to Laravel without localStorage fallback or SMS simulation', () => {
  const start = apiSource.indexOf('export async function createManualBooking');
  const method = apiSource.slice(start).match(/export async function createManualBooking\(payload\) \{[\s\S]*?^}/m)?.[0] || '';

  assert.ok(start >= 0);
  assert.match(method, /requestTikimHoldApi\(/);
  assert.match(method, /notifySync\('booking_created'/);
  assert.doesNotMatch(method, /localStorage|queueSms|simulateSms|createBooking\(/);
});

test('manual price preview calls the authenticated Laravel preview endpoint', () => {
  const start = apiSource.indexOf('export async function previewManualBooking');
  const method = apiSource.slice(start).match(/export async function previewManualBooking\(payload\) \{[\s\S]*?^}/m)?.[0] || '';

  assert.ok(start >= 0);
  assert.match(method, /requestTikimHoldApi\(/);
  assert.match(method, /\/api\/v1\/admin\/bookings\/manual\/preview/);
  assert.match(method, /result\.preview/);
  assert.doesNotMatch(method, /localStorage|notifySync|createManualBooking/);
});

test('manual form invalidates price previews on edits and blocks creation until a current preview succeeds', () => {
  const start = adminSource.indexOf('async function openManualBookingModal()');
  const end = adminSource.indexOf('/* --------------------------------------------------------------------------\n   3. QUOTATION BUILDER VIEW', start);
  const handler = adminSource.slice(start, end);

  assert.match(handler, /data-manual-preview-breakdown/);
  assert.match(handler, /mockApi\.previewManualBooking\(payload\)/);
  assert.match(handler, /form\.addEventListener\('input', requestPreview\)/);
  assert.match(handler, /form\.addEventListener\('change', requestPreview\)/);
  assert.match(handler, /previewSignature !== JSON\.stringify\(payload\)/);
  assert.match(handler, /preview\.subtotal/);
  assert.match(handler, /preview\.paymentAmount/);
  assert.match(handler, /preview\.paymentPercent/);
  assert.match(handler, /!previewSignature/);
  assert.match(handler, /await mockApi\.createManualBooking\(payload\)/);
});
