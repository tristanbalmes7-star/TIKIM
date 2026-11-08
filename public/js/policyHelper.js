// Helper module for rendering and displaying formatted policies.

export const DEFAULT_CANCELLATION_POLICY = `Cancellations made 30 days prior to event date receive a full 100% refund of the downpayment.

Cancellations made within 14 to 29 days receive a 50% refund.

- Cancellations made under 14 days forfeit the 50% downpayment to cover perishable kitchen provisioning and blocked equipment.
- One reschedule request is granted without penalty if submitted at least 14 days prior.
[To be confirmed by Dack's]`;

export const DEFAULT_DAMAGE_POLICY = `Clients and organizers are expected to treat all catered equipment and venue styling installations with care.

- Serving utensils, chaffing warmers, and banquet tables must remain in the designated event area.
- Broken glassware, cracked chinaware, or burnt linens will be billed at standard commercial replacement value.
- A joint turnover inventory inspection is conducted with the coordinator upon ingress and egress conclusion.
[To be confirmed by Dack's]`;

export function formatPolicyHtml(text) {
  if (!text || typeof text !== 'string') return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const rawBlocks = escaped.split(/\n\s*\n/);
  return rawBlocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    const lines = trimmed.split('\n');
    const isList = lines.every(l => l.trim().startsWith('- ') || l.trim().startsWith('* '));
    if (isList) {
      const items = lines.map(l => `<li style="margin-bottom:0.35rem;">${l.trim().replace(/^[-*]\s*/, '')}</li>`).join('');
      return `<ul style="margin:0 0 1rem 1.25rem; padding-left:0.5rem; line-height:1.6; color:var(--color-slate, #212e34);">${items}</ul>`;
    }
    const paragraphLines = lines.map(l => {
      if (l.trim().startsWith('- ') || l.trim().startsWith('* ')) {
        return `&bull; ${l.trim().replace(/^[-*]\s*/, '')}`;
      }
      return l;
    });
    return `<p style="margin:0 0 1rem; line-height:1.65; color:var(--color-slate, #212e34);">${paragraphLines.join('<br>')}</p>`;
  }).filter(Boolean).join('');
}

export function openPolicyModal({ title, policyText, version }) {
  let modal = document.getElementById('tikimPolicyModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'tikimPolicyModal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:99999; display:none; align-items:center; justify-content:center; padding:1.25rem; box-sizing:border-box;';
    modal.innerHTML = `
      <div id="tikimPolicyBackdrop" style="position:fixed; inset:0; background:rgba(33,46,52,0.65); backdrop-filter:blur(2px);"></div>
      <div style="position:relative; background:#ffffff; border-radius:12px; max-width:640px; width:100%; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 16px 48px rgba(33,46,52,0.25); border:1px solid #e4dbcf; z-index:2; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 1.5rem; border-bottom:1px solid #e4dbcf; background:#faf7f2;">
          <div>
            <h3 id="tikimPolicyModalTitle" style="margin:0; font-size:16px; font-weight:700; color:#212e34; font-family:var(--font-heading, inherit);">Policy Document</h3>
            <span id="tikimPolicyModalVer" style="font-size:11px; color:#4fa49d; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;"></span>
          </div>
          <button type="button" id="btnClosePolicyModal" style="background:none; border:none; font-size:1.75rem; line-height:1; color:#212e34; cursor:pointer; padding:0 0.25rem;">&times;</button>
        </div>
        <div id="tikimPolicyModalBody" style="padding:1.5rem; overflow-y:auto; font-size:13px; line-height:1.65; max-height:60vh;">
        </div>
        <div style="display:flex; justify-content:flex-end; padding:1rem 1.5rem; border-top:1px solid #e4dbcf; background:#faf7f2;">
          <button type="button" id="btnClosePolicyModalFooter" class="btn btn-sm btn-outline">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };

    modal.querySelector('#tikimPolicyBackdrop').addEventListener('click', close);
    modal.querySelector('#btnClosePolicyModal').addEventListener('click', close);
    modal.querySelector('#btnClosePolicyModalFooter').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') close();
    });
  }

  const titleEl = modal.querySelector('#tikimPolicyModalTitle');
  const verEl = modal.querySelector('#tikimPolicyModalVer');
  const bodyEl = modal.querySelector('#tikimPolicyModalBody');

  if (titleEl) titleEl.textContent = title || 'Policy Agreement';
  if (verEl) verEl.textContent = version ? `Version ${version}` : 'Official Dack\'s Policy';
  if (bodyEl) bodyEl.innerHTML = formatPolicyHtml(policyText || '');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
