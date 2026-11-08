/**
 * TIKIM Customer Booking Tracker Logic
 * Lookup by reference and mobile last 4, hold countdown, payment proof upload,
 * floor plan inspection, and receipt generation.
 */

import { mockApi } from '../mockApi.js';
import { formatPeso, computeDownpaymentAndBalance } from '../pricing.js';
import { simulateSms } from '../sms.js';
import { renderLayoutPreviewSvg } from '../layoutPreview.js';
import { openPolicyModal } from '../policyHelper.js';

let currentBooking = null;
let holdTimerInterval = null;
let uploadedProofDataUrl = null;

async function initTracker() {
  bindClaimTrackForm();
  bindProofUpload();
  bindActionButtons();
  bindChangeRequestModal();

  const settings = await mockApi.getSettings();
  if (settings && settings.demoMode) {
    const demoNote = document.getElementById('trackDemoNote');
    if (demoNote) demoNote.style.display = 'block';
  }

  // Check URL query parameters (e.g. ?ref=TK-261021-ABC&m=4567)
  const params = new URLSearchParams(window.location.search);
  const ref = (params.get('ref') || '').trim();
  const mobile = (params.get('m') || params.get('mobile') || '').trim();
  const isNew = params.get('new') === '1';

  if (ref) {
    const refInput = document.getElementById('trackRefInput');
    const phoneInput = document.getElementById('trackPhoneInput');
    if (refInput) refInput.value = ref;
    if (phoneInput && mobile) phoneInput.value = mobile;

    executeLookup(ref, mobile, isNew);
  }
}

function bindClaimTrackForm() {
  const form = document.getElementById('claimTrackForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ref = (document.getElementById('trackRefInput')?.value || '').trim();
    const mobile = (document.getElementById('trackPhoneInput')?.value || '').trim();
    executeLookup(ref, mobile);
  });
}

async function executeLookup(ref, mobile4, isNew = false) {
  const errorEl = document.getElementById('trackInlineError');
  const resultSec = document.getElementById('trackResultSection');
  if (errorEl) errorEl.style.display = 'none';

  const cleanRef = (ref || '').trim().toUpperCase();
  const cleanMobile = (mobile4 || '').trim();

  const refPattern = /^TK-\d{6}-[A-Z0-9]{3}$/i;

  if (!refPattern.test(cleanRef)) {
    if (resultSec) resultSec.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = "We couldn't find that booking. Check the reference and last 4 digits.";
      errorEl.style.display = 'block';
    }
    return;
  }

  if (cleanMobile && !/^\d{4}$/.test(cleanMobile)) {
    if (resultSec) resultSec.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = "Please enter the last 4 digits of your mobile number.";
      errorEl.style.display = 'block';
    }
    return;
  }

  try {
    const booking = await mockApi.getBookingByRef(cleanRef, cleanMobile);
    if (!booking) {
      if (resultSec) resultSec.style.display = 'none';
      if (errorEl) {
        errorEl.textContent = "We couldn't find that booking. Check the reference and last 4 digits.";
        errorEl.style.display = 'block';
      }
      return;
    }

    currentBooking = booking;
    const verifiedBookingUrl = new URL(window.location.href);
    verifiedBookingUrl.searchParams.set('ref', booking.ref);
    verifiedBookingUrl.searchParams.delete('m');
    verifiedBookingUrl.searchParams.delete('mobile');
    verifiedBookingUrl.searchParams.delete('new');
    window.history.replaceState({}, '', verifiedBookingUrl);
    renderBookingDetails(booking);

    if (
      isNew &&
      booking.type !== 'trays' &&
      booking.holdExpiresAt &&
      window.tikimLayout &&
      window.tikimLayout.showToast
    ) {
      window.tikimLayout.showToast(`Booking ${booking.ref} confirmed on hold for 48 hours!`, 'success');
    }
  } catch (err) {
    console.error('Error looking up booking:', err);
    if (resultSec) resultSec.style.display = 'none';
    if (errorEl) {
      errorEl.textContent = err.message || "We couldn't verify this booking. Check the reference and last 4 digits, then try again.";
      errorEl.style.display = 'block';
    }
  }
}

function renderBookingDetails(booking) {
  const resultSec = document.getElementById('trackResultSection');
  resultSec.style.display = 'block';

  // Header info
  document.getElementById('displayRefNum').textContent = booking.ref;
  const statusBadge = document.getElementById('displayStatusBadge');
  statusBadge.textContent = booking.status;
  updateStatusBadgeStyle(statusBadge, booking.status);

  // Type badge
  const typeBadge = document.getElementById('displayTypeBadge');
  if (typeBadge) {
    const badgeText = booking.typeBadge || (booking.type === 'food' ? 'Food Package' : (booking.type === 'trays' ? 'Food Trays' : 'Event'));
    typeBadge.textContent = badgeText;
  }

  // Timeline
  updateTimeline(booking.status);

  // 48-Hour countdown
  handleHoldCountdown(booking);

  // Overview
  document.getElementById('displayEventType').textContent = booking.eventType || booking.typeBadge || 'Catering Event';
  document.getElementById('displayEventDateTime').textContent = `${booking.eventDate || booking.deliveryDate || 'TBD'} · ${booking.eventTime || booking.deliveryTime || ''}`;
  document.getElementById('displayPax').textContent = (typeof booking.pax === 'number') ? `${booking.pax} Guests` : (booking.tag || 'Food Order (Express)');
  document.getElementById('displayPackage').textContent = booking.packageName || booking.tag || 'Standard Catering';
  document.getElementById('displayVenue').textContent = booking.venue || booking.customer?.deliveryAddress || booking.details?.venue || 'On-site Service';

  const boardRow = document.getElementById('displayBoardNameRow');
  const themeRow = document.getElementById('displayThemeRow');
  if (boardRow && themeRow) {
    if (booking.type === 'event' || booking.stageText) {
      boardRow.style.display = 'flex';
      themeRow.style.display = 'flex';
      const boardVal = document.getElementById('displayBoardName');
      const themeVal = document.getElementById('displayTheme');
      if (boardVal) boardVal.textContent = booking.stageText?.name?.trim() || 'Not provided';
      if (themeVal) themeVal.textContent = booking.stageText?.character?.trim() || 'Not provided';
    } else {
      boardRow.style.display = 'none';
      themeRow.style.display = 'none';
    }
  }

  // Floor plan layout preview (Part 5.1 & 5.3)
  const floorBox = document.getElementById('floorPlanPreviewBox');
  const svgMount = document.getElementById('floorPlanSvgContainer');
  if (floorBox && svgMount) {
    if (booking.layout || booking.floorPlan) {
      floorBox.style.display = 'block';
      svgMount.innerHTML = renderLayoutPreviewSvg(booking.layout || booking.floorPlan, { maxHeight: '280px' });
    } else {
      floorBox.style.display = 'block';
      svgMount.innerHTML = '<div style="font-size:14px; color:#64748b; padding:1.5rem; text-align:center;">No floor plan</div>';
    }
  }

  // Notes
  const notesInput = document.getElementById('bookingNotesInput');
  if (notesInput) notesInput.value = booking.notes || booking.customer?.requests || booking.details?.notes || '';

  // Financial Ledger
  const total = booking.total || 0;
  const paid = booking.paidAmount || booking.paid || 0;
  const balance = Math.max(0, total - paid);
  const dpInfo = computeDownpaymentAndBalance(total, booking.type);

  document.getElementById('ledgerTotal').textContent = formatPeso(total);
  document.getElementById('ledgerPaid').textContent = formatPeso(paid);
  document.getElementById('ledgerBalance').textContent = formatPeso(balance);

  const dueNote = document.getElementById('ledgerDueDate');
  if (dueNote) {
    dueNote.textContent = booking.balanceDueDate 
      ? `Remaining balance is due on or before ${booking.balanceDueDate}.` 
      : 'Full balance is due 7 days before event day.';
  }

  // Pre-fill payment amount with 50% downpayment or balance
  const proofAmountInput = document.getElementById('proofAmount');
  if (proofAmountInput) {
    const minRequired = booking.downpaymentRequired || dpInfo.downpayment;
    proofAmountInput.value = paid === 0 ? minRequired : balance;
  }

  // Payment History
  renderPaymentHistory(booking);

  // Itemized Quotation Breakdown (Revision 7)
  renderQuotationBreakdown(booking);

  // Dynamic Payment Channels
  renderTrackPaymentChannels();

  // Rejection notice
  const rejectionNotice = document.getElementById('proofRejectionNotice');
  if (rejectionNotice) {
    if (booking.rejectionReason) {
      rejectionNotice.innerHTML = `Your payment proof was rejected: <strong>${escapeHtml(booking.rejectionReason)}</strong>. Please upload a new proof.`;
      rejectionNotice.style.display = 'block';
    } else {
      rejectionNotice.style.display = 'none';
    }
  }

  // Success notice
  const successNotice = document.getElementById('proofSuccessNotice');
  if (successNotice) {
    if (booking.status === 'Pending Verification' && !booking.rejectionReason) {
      successNotice.textContent = "Proof submitted. Dack's will verify it.";
      successNotice.style.display = 'block';
    } else {
      successNotice.style.display = 'none';
    }
  }

  resultSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

async function renderTrackPaymentChannels() {
  const container = document.getElementById('trackPaymentChannelsBox');
  if (!container) return;
  const settings = await mockApi.getSettings();
  const channels = (settings.paymentChannels || []).filter(c => c.enabled !== false);
  const notes = settings.paymentNotes || '';

  if (channels.length === 0) {
    container.innerHTML = `
      <div style="background:var(--color-slate-05, #faf7f2); border:1px solid rgba(33,46,52,0.1); border-radius:8px; padding:0.85rem 1rem; font-size:12px;">
        <div style="font-weight:700; color:var(--color-slate); margin-bottom:0.4rem;">Official Payment Channels</div>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div><strong>GCash:</strong> 0977 752 3458 · Account Name: <strong>Dack's Catering Services</strong></div>
            <button type="button" class="btn btn-xs btn-outline btn-copy-channel-num" data-num="09777523458">Copy</button>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div><strong>Maya:</strong> 0977 752 3458 · Account Name: <strong>Dack's Catering Services</strong></div>
            <button type="button" class="btn btn-xs btn-outline btn-copy-channel-num" data-num="09777523458">Copy</button>
          </div>
        </div>
        <div style="margin-top:0.6rem; padding-top:0.5rem; border-top:1px dashed rgba(33,46,52,0.15); font-size:11px; color:var(--color-slate-60);">
          <span style="color:var(--color-rust); font-weight:700;">Safety Reminder:</span> Always verify recipient name is <strong>Dack's Catering Services</strong> before sending.
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="background:var(--color-slate-05, #faf7f2); border:1.5px solid rgba(33,46,52,0.12); border-radius:8px; padding:0.85rem 1rem; font-size:12px;">
        <div style="font-weight:700; color:var(--color-slate); margin-bottom:0.5rem; font-size:13px;">Official Payment Channels</div>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          ${channels.map(c => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:0.55rem 0.75rem; border-radius:6px; border:1px solid rgba(33,46,52,0.08);">
              <div>
                <span style="font-weight:700; color:var(--color-teal);">${escapeHtml(c.name)}:</span>
                <span style="font-weight:600; margin-left:0.25rem;">${escapeHtml(c.accountNumber)}</span>
                <div style="font-size:11px; color:var(--color-slate-60);">Account Name: <strong style="color:var(--color-slate);">${escapeHtml(c.accountName)}</strong>${c.notes ? ` · ${escapeHtml(c.notes)}` : ''}</div>
              </div>
              <button type="button" class="btn btn-xs btn-outline btn-copy-channel-num" data-num="${escapeHtml(c.accountNumber).replace(/\s+/g, '')}" style="margin-left:0.5rem; flex-shrink:0;">Copy</button>
            </div>
          `).join('')}
        </div>
        ${notes ? `<div style="font-size:11px; color:var(--color-slate-60); margin-top:0.5rem;">${escapeHtml(notes)}</div>` : ''}
        <div style="margin-top:0.6rem; padding-top:0.5rem; border-top:1px dashed rgba(33,46,52,0.15); font-size:11px; color:var(--color-slate-60); line-height:1.4;">
          <span style="color:var(--color-rust); font-weight:700;">Safety Reminder:</span> Please verify the account name matches <strong>Dack's Catering Services</strong> before sending. Dack's will never request payments to personal accounts not listed here.
        </div>
      </div>
    `;
  }

  container.querySelectorAll('.btn-copy-channel-num').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = btn.dataset.num;
      if (num && navigator.clipboard) {
        navigator.clipboard.writeText(num);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
      }
    });
  });
}

function updateStatusBadgeStyle(el, status) {
  el.className = 'badge badge-lg';
  switch (status) {
    case 'Hold':
      el.classList.add('badge-rust');
      break;
    case 'Pending Verification':
      el.classList.add('badge-outline');
      el.style.borderColor = '#d97706';
      el.style.color = '#d97706';
      break;
    case 'Partially Paid':
    case 'Fully Paid':
    case 'Confirmed':
    case 'Completed':
      el.classList.add('badge-teal');
      break;
    default:
      el.classList.add('badge-outline');
  }
}

function updateTimeline(status) {
  const steps = document.querySelectorAll('.progress-timeline-wrap .timeline-step');
  const statusLevels = {
    'Hold': 2,
    'Pending Verification': 3,
    'Partially Paid': 4,
    'Confirmed': 4,
    'Fully Paid': 4,
    'Event Day': 5,
    'Completed': 6
  };

  const level = statusLevels[status] || 2;
  steps.forEach((step, idx) => {
    const stepNum = idx + 1;
    step.classList.toggle('active', stepNum === level);
    step.classList.toggle('completed', stepNum < level);
    if (stepNum === 3) {
      const label = step.querySelector('.timeline-label');
      if (label) {
        label.textContent = (status === 'Pending Verification') ? 'Pending verification' : 'Downpayment Proof';
      }
    }
  });
}

function handleHoldCountdown(booking) {
  const box = document.getElementById('holdCountdownBox');
  const timerDigits = document.getElementById('holdCountdownTimer');
  if (holdTimerInterval) clearInterval(holdTimerInterval);

  if (booking.type === 'trays' || booking.status !== 'Hold' || !booking.holdExpiresAt) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'flex';

  const updateTick = () => {
    const now = Date.now();
    const expiry = new Date(booking.holdExpiresAt).getTime();
    const diff = expiry - now;

    if (diff <= 0) {
      clearInterval(holdTimerInterval);
      timerDigits.textContent = 'Hold window has expired.';
      timerDigits.style.color = 'var(--color-rust)';
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    timerDigits.textContent = `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s remaining`;
  };

  updateTick();
  holdTimerInterval = setInterval(updateTick, 1000);
}

function renderPaymentHistory(booking) {
  const container = document.getElementById('paymentHistoryList');
  const payments = booking.payments || [];

  if (payments.length === 0) {
    container.innerHTML = `
      <div style="font-size: var(--text-xs); color: var(--color-slate-60); padding: 0.5rem 0;">
        No payment transactions verified yet. Upload receipt proof to proceed.
      </div>
    `;
    return;
  }

  container.innerHTML = payments.map(p => {
    let badgeClass = 'badge-outline';
    let statusText = p.status || 'Pending';
    if (p.status === 'Approved') {
      badgeClass = 'badge-teal';
    } else if (p.status === 'Rejected') {
      badgeClass = 'badge-rust';
    } else if (p.status === 'pending' || p.status === 'Pending Verification') {
      statusText = 'Pending verification';
    }
    const createdStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : (p.date || 'Today');
    return `
      <div style="padding: 0.75rem; background: var(--color-slate-05); border-radius: 6px; margin-bottom: 0.5rem; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${formatPeso(p.amount)}</strong> via ${escapeHtml(p.channel)}
          <div style="color: var(--color-slate-60); font-size: 10px;">Ref: ${escapeHtml(p.transactionNo || p.refNo || 'N/A')} · ${createdStr}</div>
          ${p.rejectionReason ? `<div style="color: var(--color-rust); font-size: 10px; margin-top: 2px;">Reason: ${escapeHtml(p.rejectionReason)}</div>` : ''}
        </div>
        <span class="badge ${badgeClass}">${statusText}</span>
      </div>
    `;
  }).join('');
}

let selectedProofFile = null;
let selectedProofObjectUrl = null;

function bindProofUpload() {
  const fileInput = document.getElementById('trackFileInput');
  const preview = document.getElementById('trackUploadPreview');
  const prompt = document.getElementById('trackUploadPrompt');
  const previewImg = document.getElementById('trackPreviewImg');
  const pdfIcon = document.getElementById('trackPdfPreviewIcon');
  const fileName = document.getElementById('trackFileName');
  const fileSize = document.getElementById('trackFileSize');
  const removeBtn = document.getElementById('btnRemoveProof');
  const errorEl = document.getElementById('proofUploadError');
  const form = document.getElementById('paymentProofForm');
  const submitBtn = document.getElementById('btnSubmitProof');

  const clearProofFile = () => {
    selectedProofFile = null;
    if (selectedProofObjectUrl) {
      try { URL.revokeObjectURL(selectedProofObjectUrl); } catch (e) {}
      selectedProofObjectUrl = null;
    }
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    if (prompt) prompt.style.display = 'flex';
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
    if (previewImg) {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
    if (pdfIcon) pdfIcon.style.display = 'none';
  };

  if (prompt && fileInput) {
    prompt.addEventListener('click', () => fileInput.click());
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearProofFile();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
      }

      // Check file size: max 5 MB
      const maxBytes = 5 * 1024 * 1024;
      if (file.size > maxBytes) {
        fileInput.value = '';
        if (errorEl) {
          errorEl.textContent = `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 5 MB.`;
          errorEl.style.display = 'block';
        }
        return;
      }

      // Check file type: jpg, png, webp, pdf
      const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const validMime = file.type.startsWith('image/') || file.type === 'application/pdf';
      if (!allowedExts.includes(ext) || !validMime) {
        fileInput.value = '';
        if (errorEl) {
          errorEl.textContent = 'Invalid file type. Only JPG, PNG, WEBP, and PDF files are accepted.';
          errorEl.style.display = 'block';
        }
        return;
      }

      selectedProofFile = file;

      if (selectedProofObjectUrl) {
        try { URL.revokeObjectURL(selectedProofObjectUrl); } catch (err) {}
      }
      selectedProofObjectUrl = URL.createObjectURL(file);

      if (fileName) fileName.textContent = file.name;
      if (fileSize) {
        const kb = Math.round(file.size / 1024);
        fileSize.textContent = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
      }

      if (file.type === 'application/pdf' || ext === 'pdf') {
        if (previewImg) previewImg.style.display = 'none';
        if (pdfIcon) pdfIcon.style.display = 'flex';
      } else {
        if (pdfIcon) pdfIcon.style.display = 'none';
        if (previewImg) {
          previewImg.src = selectedProofObjectUrl;
          previewImg.style.display = 'block';
        }
      }

      if (preview) preview.style.display = 'flex';
      if (prompt) prompt.style.display = 'none';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentBooking) return;

      const amount = Number(document.getElementById('proofAmount').value) || 0;
      const channel = document.getElementById('proofChannel').value;
      const transactionNumber = document.getElementById('proofRefNo').value.trim();

      if (!selectedProofFile) {
        if (errorEl) {
          errorEl.textContent = 'Please attach your payment receipt screenshot or PDF before submitting.';
          errorEl.style.display = 'block';
        }
        return;
      }

      // Prevent duplicate clicks
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = 'Submitting proof...';
      }

      try {
        await mockApi.addPayment({
          reference: currentBooking.ref,
          amount,
          paymentMethod: channel,
          transaction_number: transactionNumber,
          receipt: selectedProofFile
        });

        // Queue simulated SMS to customer
        try {
          simulateSms('booking_received', {
            name: currentBooking.customer?.name || 'Customer',
            ref: currentBooking.ref,
            date: currentBooking.eventDate || 'Event',
            balance: formatPeso(amount),
            dueDate: 'Verification under review'
          });
        } catch (smsErr) {}

        const successNotice = document.getElementById('proofSuccessNotice');
        if (successNotice) {
          successNotice.textContent = "Proof submitted. Dack's will verify it.";
          successNotice.style.display = 'block';
        }

        const rejectionNotice = document.getElementById('proofRejectionNotice');
        if (rejectionNotice) rejectionNotice.style.display = 'none';

        if (window.tikimLayout && window.tikimLayout.showToast) {
          window.tikimLayout.showToast("Proof submitted. Dack's will verify it.", 'success');
        }

        clearProofFile();

        // Refresh booking state
        const refreshed = await mockApi.getBookingByRef(currentBooking.ref, currentBooking.customer?.mobile?.slice(-4) || '0000');
        if (refreshed) {
          currentBooking = refreshed;
          renderBookingDetails(refreshed);
        }
      } catch (err) {
        console.error('Error submitting payment proof:', err);
        if (errorEl) {
          errorEl.textContent = `Could not submit payment proof: ${err.message || 'Please try again'}`;
          errorEl.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitBtn.dataset.originalText || 'Submit Payment for Verification &rarr;';
        }
      }
    });
  }
}

function bindActionButtons() {
  const printBtn = document.getElementById('btnPrintReceipt');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const saveNotesBtn = document.getElementById('btnSaveBookingNotes');
  if (saveNotesBtn) {
    saveNotesBtn.addEventListener('click', async () => {
      if (!currentBooking) return;
      const notes = document.getElementById('bookingNotesInput').value.trim();
      await mockApi.updateBooking(currentBooking.id, { notes });
      if (window.tikimLayout && window.tikimLayout.showToast) {
        window.tikimLayout.showToast('Special requests updated successfully!', 'success');
      }
    });
  }

  const cancelPolicyBtn = document.getElementById('btnTrackViewCancelPolicy');
  if (cancelPolicyBtn) {
    cancelPolicyBtn.addEventListener('click', async () => {
      const settings = await mockApi.getSettings();
      openPolicyModal({
        title: 'Cancellation & Refund Policy',
        policyText: (currentBooking && currentBooking.cancellationPolicy) || settings.cancellationPolicy,
        version: (currentBooking && currentBooking.policyVersion) || settings.policyVersion
      });
    });
  }

  const damagePolicyBtn = document.getElementById('btnTrackViewDamagePolicy');
  if (damagePolicyBtn) {
    damagePolicyBtn.addEventListener('click', async () => {
      const settings = await mockApi.getSettings();
      openPolicyModal({
        title: 'Equipment Care, Damage & Loss Policy',
        policyText: (currentBooking && currentBooking.damagePolicy) || settings.damagePolicy,
        version: (currentBooking && currentBooking.policyVersion) || settings.policyVersion
      });
    });
  }
}


function bindChangeRequestModal() {
  const modal = document.getElementById('changeRequestModal');
  const btnOpen = document.getElementById('btnRequestChange');
  const btnClose = document.getElementById('closeChangeModalBtn');
  const btnCancel = document.getElementById('btnCancelChangeModal');
  const backdrop = document.getElementById('changeModalBackdrop');
  const form = document.getElementById('changeRequestForm');
  const typeSelect = document.getElementById('changeTypeSelect');
  const dateGroup = document.getElementById('preferredDateGroup');

  if (typeSelect && dateGroup) {
    typeSelect.addEventListener('change', () => {
      dateGroup.style.display = typeSelect.value === 'Reschedule' ? 'block' : 'none';
    });
  }

  const messengerGroup = document.getElementById('changeMessengerGroup');
  const messengerInput = document.getElementById('changeMessengerName');
  document.querySelectorAll('input[name="changeContactMethod"]').forEach(r => {
    r.addEventListener('change', (e) => {
      const isMessenger = e.target.value === 'Messenger';
      if (messengerGroup) messengerGroup.style.display = isMessenger ? 'block' : 'none';
      if (messengerInput) messengerInput.required = isMessenger;
    });
  });

  const openModal = () => {
    if (!currentBooking) return;
    if (modal) modal.style.display = 'flex';
  };

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (btnOpen) btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', closeModal);

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentBooking) return;

      const type = document.getElementById('changeTypeSelect').value;
      const preferredDate = document.getElementById('preferredNewDate').value;
      const contactMethod = document.querySelector('input[name="changeContactMethod"]:checked')?.value || 'SMS';
      const messengerName = (document.getElementById('changeMessengerName')?.value || '').trim();
      const reason = document.getElementById('changeReason').value.trim();

      if (contactMethod === 'Messenger' && !messengerName) {
        alert('Please enter your Facebook Messenger name.');
        return;
      }

      const changeReq = {
        bookingId: currentBooking.id,
        ref: currentBooking.ref,
        customerName: currentBooking.customer?.name || currentBooking.customerName || 'Customer',
        mobile: currentBooking.customer?.mobile || currentBooking.mobile || '',
        contactMethod,
        messengerName: contactMethod === 'Messenger' ? messengerName : '',
        type,
        preferredDate: preferredDate || 'N/A',
        reason,
        status: 'Pending Review',
        createdAt: new Date().toISOString()
      };

      try {
        // Save to booking record
        await mockApi.updateBooking(currentBooking.id, {
          changeRequest: changeReq
        });

        // Store in global change requests array for Admin Messages queue
        const existing = JSON.parse(localStorage.getItem('tikim.change_requests') || '[]');
        existing.unshift(changeReq);
        localStorage.setItem('tikim.change_requests', JSON.stringify(existing));

        // Queue SMS acknowledgment
        simulateSms('change_requested', {
          name: currentBooking.customer?.name || 'Customer',
          ref: currentBooking.ref,
          date: currentBooking.eventDate || '',
          balance: type,
          dueDate: 'Coordinator will review within 24h'
        });

        closeModal();
        form.reset();

        if (window.tikimLayout && window.tikimLayout.showToast) {
          window.tikimLayout.showToast('Change request submitted to coordinator!', 'success');
        }

        // Refresh booking details
        const refreshed = await mockApi.getBookingByRef(currentBooking.ref, currentBooking.customer?.mobile?.slice(-4) || '0000');
        if (refreshed) {
          currentBooking = refreshed;
          renderBookingDetails(refreshed);
        }
      } catch (err) {
        console.error('Error submitting change request:', err);
        alert('Could not submit change request. Please try again.');
      }
    });
  }
}

function renderQuotationBreakdown(booking) {
  const container = document.getElementById('breakdownLinesContainer');
  const badge = document.getElementById('awaitingFinalQuoteBadge');
  if (!container) return;

  const quote = booking.quoteSnapshot;
  if (!quote || !quote.lines || quote.lines.length === 0) {
    container.innerHTML = '<p style="font-size: 11px; color: var(--color-slate-60); margin: 0;">Quotation snapshot not available.</p>';
    if (badge) badge.style.display = 'none';
    return;
  }

  const hasTbc = !!(quote.flags && quote.flags.hasTbc);
  if (badge) badge.style.display = hasTbc ? 'inline-block' : 'none';

  container.innerHTML = quote.lines.map(line => {
    if (line.isTbc) {
      return `
        <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; padding: 0.35rem 0; border-bottom: 1px dashed var(--color-slate-10);">
          <div>
            <strong>${line.name}</strong>
            <div style="font-size: 10px; color: var(--color-slate-60);">${line.formula || 'Price on request'}</div>
          </div>
          <span class="badge badge-rust" style="font-size: 9px;">To be quoted</span>
        </div>
      `;
    }

    return `
      <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; padding: 0.35rem 0; border-bottom: 1px dashed var(--color-slate-10);">
        <div>
          <strong>${line.name}</strong>
          <div style="font-size: 10px; color: var(--color-slate-60);">${line.formula || ''}</div>
        </div>
        <strong style="color: var(--color-slate);">${line.amount === 0 ? '₱0' : formatPeso(line.amount)}</strong>
      </div>
    `;
  }).join('');

  if (quote.flags && quote.flags.usesEstimates) {
    container.innerHTML += `
      <div class="quote-estimate-notice" style="font-size: 11px; color: var(--color-rust); margin-top: 0.6rem; font-weight: 600;">
        Includes estimated prices, to be confirmed by Dack's
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', initTracker);
