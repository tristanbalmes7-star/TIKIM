import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachAdminQuotePreview,
  calculateAdminQuotePreview
} from '../../public/js/adminQuotePreview.js';

class FakeInput {
  constructor(value, itemId = null) {
    this.value = value;
    this.dataset = itemId === null ? {} : { itemId };
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    this.listeners.set(type, callback);
  }

  dispatch(type = 'input') {
    this.listeners.get(type)?.();
  }
}

class FakeRoot {
  constructor(priceInputs, discountInput) {
    this.priceInputs = priceInputs;
    this.discountInput = discountInput;
    this.feedback = { textContent: '', style: {} };
    this.values = Object.fromEntries(
      ['subtotal', 'discount', 'total', 'downpayment', 'paid', 'balance']
        .map(key => [key, { textContent: '' }])
    );
  }

  querySelectorAll(selector) {
    return selector === '.drawer-tbc-input' ? this.priceInputs : [];
  }

  querySelector(selector) {
    if (selector === '#drawerDiscountInput') return this.discountInput;
    if (selector === '#drawerQuoteFeedback') return this.feedback;
    const match = selector.match(/^\[data-quote-preview="([^"]+)"\]$/);
    return match ? this.values[match[1]] : null;
  }
}

const lines = [
  { bookingItemId: 58, quantity: 1, unitPrice: 1000, amount: 1000 },
  { bookingItemId: 59, quantity: 1, unitPrice: 0, amount: 0 }
];

test('changing an item price updates the live subtotal and 40 percent downpayment', () => {
  const specialPrice = new FakeInput('0', '59');
  const root = new FakeRoot([specialPrice], new FakeInput('0'));

  attachAdminQuotePreview({
    root,
    lines,
    downpaymentPercent: 40,
    paidAmount: 0
  });
  specialPrice.value = '200';
  specialPrice.dispatch();

  assert.equal(root.values.subtotal.textContent, '₱1,200');
  assert.equal(root.values.discount.textContent, '₱0');
  assert.equal(root.values.total.textContent, '₱1,200');
  assert.equal(root.values.downpayment.textContent, '₱480');
  assert.equal(root.values.paid.textContent, '₱0');
  assert.equal(root.values.balance.textContent, '₱1,200');
});

test('changing the organizer discount updates total, downpayment, and balance', () => {
  const discount = new FakeInput('0');
  const root = new FakeRoot([new FakeInput('200', '59')], discount);

  attachAdminQuotePreview({
    root,
    lines,
    downpaymentPercent: 40,
    paidAmount: 0
  });
  discount.value = '100';
  discount.dispatch();

  assert.equal(root.values.subtotal.textContent, '₱1,200');
  assert.equal(root.values.discount.textContent, '₱100');
  assert.equal(root.values.total.textContent, '₱1,100');
  assert.equal(root.values.downpayment.textContent, '₱440');
  assert.equal(root.values.balance.textContent, '₱1,100');
});

test('approved payment amount is included while pending and rejected amounts are excluded by API paid value', () => {
  const approved = calculateAdminQuotePreview({
    lines,
    itemPrices: new Map([['59', '200']]),
    discount: '0',
    downpaymentPercent: 40,
    paidAmount: 400
  });
  const pendingOrRejected = calculateAdminQuotePreview({
    lines,
    itemPrices: new Map([['59', '200']]),
    discount: '0',
    downpaymentPercent: 40,
    paidAmount: 0
  });

  assert.equal(approved.paid, 400);
  assert.equal(approved.balance, 800);
  assert.equal(pendingOrRejected.paid, 0);
  assert.equal(pendingOrRejected.balance, 1200);
});

test('empty inputs safely mean zero; invalid and negative values never produce negative totals', () => {
  const empty = calculateAdminQuotePreview({
    lines,
    itemPrices: new Map([['59', '']]),
    discount: '',
    downpaymentPercent: 40,
    paidAmount: 0
  });
  assert.equal(empty.valid, true);
  assert.equal(empty.subtotal, 1000);
  assert.equal(empty.discount, 0);

  const negative = calculateAdminQuotePreview({
    lines,
    itemPrices: new Map([['59', '-200']]),
    discount: '-1',
    downpaymentPercent: 40,
    paidAmount: 0
  });
  assert.equal(negative.valid, false);
  assert.equal(negative.subtotal, 1000);
  assert.equal(negative.discount, 0);
  assert.ok(negative.total >= 0);
  assert.ok(negative.balance >= 0);

  const excessiveDiscount = calculateAdminQuotePreview({
    lines,
    itemPrices: new Map([['59', '0']]),
    discount: '2000',
    downpaymentPercent: 40,
    paidAmount: 0
  });
  assert.equal(excessiveDiscount.total, 0);
  assert.equal(excessiveDiscount.balance, 0);
  assert.equal(excessiveDiscount.overDiscount, true);
});

test('missing persisted percentage is not inferred from rounded amounts', () => {
  const preview = calculateAdminQuotePreview({
    lines,
    itemPrices: new Map(),
    discount: 0,
    downpaymentPercent: null,
    paidAmount: 0
  });

  assert.equal(preview.percentageValid, false);
  assert.equal(preview.downpayment, null);
});
