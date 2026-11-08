// Simulated SMS gateway logging and phone mockup preview generator.

export const SMS_TEMPLATES = {
  booking_received: "DACK'S TIKIM: Kumusta {name}! We received your booking request {ref} for {date}. Your 48-hr date hold is ACTIVE. Please submit your 50% downpayment proof to lock your date.",
  hold_reminder_24h: "DACK'S TIKIM: Hi {name}! Reminder: 24 hours left on your date hold for {date} (Ref: {ref}). Secure your slot before it returns to public availability.",
  hold_reminder_6h: "DACK'S TIKIM: URGENT: Only 6 hours remaining on your date hold for {date} (Ref: {ref}). Pay your 50% downpayment now to lock your celebration date.",
  hold_expired: "DACK'S TIKIM: Your date hold for {date} (Ref: {ref}) has expired and returned to open availability. Visit studio.html anytime to rebook.",
  payment_approved: "DACK'S TIKIM: Salamat {name}! Your 50% downpayment for {date} (Ref: {ref}) is APPROVED. Your event date is officially CONFIRMED & LOCKED on our master calendar. Remaining balance of {balance} is due on {dueDate}.",
  payment_rejected: "DACK'S TIKIM: Hi {name}. We could not verify payment proof for {ref}. Reason: {note}. Please upload a clearer receipt on track.html or call us at (02) 8631-DACK.",
  balance_reminder_7d: "DACK'S TIKIM: Hi {name}! Your celebration on {date} is 7 days away. Remaining balance of {balance} is due on {dueDate}. See track.html for payment options.",
  balance_reminder_3d: "DACK'S TIKIM: Hi {name}! 3 days before your balance due date for event on {date}. Balance: {balance}. Thank you!",
  event_reminder: "DACK'S TIKIM: Handa na ba kayo? Tomorrow is your big event ({date})! Our catering team ingress starts 4 hours prior. Call your coordinator for assistance.",
  thank_you: "DACK'S TIKIM: Maraming salamat {name} for celebrating with Dack's Catering! We hope you and your guests enjoyed the feast. Please leave us a review!"
};

export function renderSmsText(templateKey, params = {}) {
  let text = SMS_TEMPLATES[templateKey] || templateKey;
  Object.keys(params).forEach(key => {
    const val = params[key] !== undefined && params[key] !== null ? params[key] : '';
    text = text.replaceAll(`{${key}}`, val);
  });
  return text;
}

export function openSmsMockupModal(messageText, recipientPhone = '0917-889-4421') {
  let modal = document.getElementById('smsMockupModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'smsMockupModal';
    modal.className = 'search-modal-backdrop';
    modal.style.alignItems = 'center';
    modal.innerHTML = `
      <div style="width: 340px; background: #111827; border-radius: 40px; padding: 14px; box-shadow: 0 25px 60px rgba(0,0,0,0.6); border: 4px solid #374151;">
        <div style="background: #f8fafc; border-radius: 28px; height: 480px; display: flex; flex-direction: column; overflow: hidden; position: relative;">
          <!-- Speaker notch -->
          <div style="width: 90px; height: 18px; background: #111827; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; margin: 0 auto;"></div>
          <!-- SMS Header bar -->
          <div style="padding: 0.75rem 1rem; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 0.85rem; font-weight: 700; color: #212e34;">
              Messages &bull; <span id="smsRecipientText">09XX</span>
            </div>
            <button id="closeSmsMockupBtn" style="color: #64748b; font-size: 1.3rem; line-height: 1; cursor: pointer;">&times;</button>
          </div>
          <!-- Bubbles -->
          <div style="flex: 1; padding: 1rem; display: flex; flex-direction: column; justify-content: flex-end; gap: 0.75rem;">
            <div style="background: #e2e8f0; border-radius: 16px; border-bottom-left-radius: 4px; padding: 0.85rem 1rem; font-size: 0.82rem; color: #1e293b; line-height: 1.45; box-shadow: 0 1px 3px rgba(0,0,0,0.06);" id="smsBubbleBody">
            </div>
            <div style="text-align: right; font-size: 0.7rem; color: #94a3b8;">Delivered via Tikim SMS Gateway</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#closeSmsMockupBtn').addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  modal.querySelector('#smsRecipientText').textContent = recipientPhone;
  modal.querySelector('#smsBubbleBody').textContent = messageText;
  modal.classList.add('open');
}

export function simulateSms(templateKey, payload = {}, recipientPhone = '0917-888-DACK') {
  const text = renderSmsText(templateKey, payload);
  const logs = JSON.parse(localStorage.getItem('tikim.sms') || '[]');
  const entry = {
    id: 'sms-' + Date.now(),
    timestamp: new Date().toISOString(),
    recipient: recipientPhone,
    template: templateKey,
    payload,
    message: text
  };
  logs.unshift(entry);
  localStorage.setItem('tikim.sms', JSON.stringify(logs));
  return entry;
}

export function getSmsLogs() {
  return JSON.parse(localStorage.getItem('tikim.sms') || '[]');
}
