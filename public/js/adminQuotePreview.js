import { formatPeso } from './pricing.js';

const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;

function parseNonnegativeInteger(value) {
  const normalized = String(value ?? '').trim();
  if (normalized === '') return { value: 0, valid: true };
  if (!/^\d+$/.test(normalized)) return { value: 0, valid: false };

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed <= MAX_SAFE_AMOUNT
    ? { value: parsed, valid: true }
    : { value: 0, valid: false };
}

function addSafely(total, value) {
  if (!Number.isSafeInteger(value) || value < 0 || total > MAX_SAFE_AMOUNT - value) {
    return null;
  }
  return total + value;
}

export function calculateAdminQuotePreview({
  lines,
  itemPrices,
  discount,
  downpaymentPercent,
  paidAmount
}) {
  let subtotal = 0;
  let valid = true;

  for (const line of lines) {
    const itemId = String(line.bookingItemId);
    const quantity = Number(line.quantity);
    const price = itemPrices.has(itemId)
      ? parseNonnegativeInteger(itemPrices.get(itemId))
      : parseNonnegativeInteger(line.unitPrice);

    if (!price.valid || !Number.isSafeInteger(quantity) || quantity < 0) {
      valid = false;
      continue;
    }

    const lineTotal = price.value * quantity;
    const nextSubtotal = addSafely(subtotal, lineTotal);
    if (nextSubtotal === null) {
      valid = false;
      continue;
    }
    subtotal = nextSubtotal;
  }

  const parsedDiscount = parseNonnegativeInteger(discount);
  valid = valid && parsedDiscount.valid;
  const discountAmount = parsedDiscount.value;
  const total = Math.max(0, subtotal - discountAmount);
  const parsedPaid = parseNonnegativeInteger(paidAmount);
  valid = valid && parsedPaid.valid;
  const paid = parsedPaid.value;
  const percentage = Number(downpaymentPercent);
  const hasValidPercentage = downpaymentPercent !== null &&
    downpaymentPercent !== '' &&
    Number.isFinite(percentage) &&
    percentage >= 0 &&
    percentage <= 100;

  return {
    subtotal,
    discount: discountAmount,
    total,
    downpayment: hasValidPercentage ? Math.round(total * percentage / 100) : null,
    paid,
    balance: Math.max(0, total - paid),
    valid: valid && hasValidPercentage,
    percentageValid: hasValidPercentage,
    overDiscount: discountAmount > subtotal,
    balanceBelowZero: paid > total
  };
}

export function attachAdminQuotePreview({ root, lines, downpaymentPercent, paidAmount }) {
  const priceInputs = [...root.querySelectorAll('.drawer-tbc-input')];
  const discountInput = root.querySelector('#drawerDiscountInput');
  const feedback = root.querySelector('#drawerQuoteFeedback');
  const itemPrices = new Map();

  const render = () => {
    for (const input of priceInputs) {
      itemPrices.set(String(input.dataset.itemId), input.value);
    }

    const preview = calculateAdminQuotePreview({
      lines,
      itemPrices,
      discount: discountInput?.value ?? '',
      downpaymentPercent,
      paidAmount
    });

    const values = {
      subtotal: preview.subtotal,
      discount: preview.discount,
      total: preview.total,
      downpayment: preview.downpayment,
      paid: preview.paid,
      balance: preview.balance
    };

    for (const [key, value] of Object.entries(values)) {
      const element = root.querySelector(`[data-quote-preview="${key}"]`);
      if (element) element.textContent = value === null ? 'Unavailable' : formatPeso(value);
    }

    if (feedback) {
      const message = !preview.percentageValid
        ? 'The saved downpayment percentage is unavailable; the downpayment preview cannot be calculated.'
        : !preview.valid
          ? 'Enter valid nonnegative whole-peso prices and discount.'
          : preview.overDiscount
            ? 'The discount exceeds the subtotal; preview total and balance are capped at ₱0.'
            : preview.balanceBelowZero
              ? 'The revised total is below the amount already paid; preview balance is capped at ₱0.'
              : '';
      feedback.textContent = message;
      feedback.style.display = message ? 'block' : 'none';
    }
  };

  for (const input of priceInputs) {
    input.addEventListener('input', render);
    input.addEventListener('change', render);
  }
  if (discountInput) {
    discountInput.addEventListener('input', render);
    discountInput.addEventListener('change', render);
  }

  render();
}
