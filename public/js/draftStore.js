// Unified reactive draft store managing shared reservation state and internal reset lifecycle.

import { mockApi } from './mockApi.js';

const DRAFT_KEY = 'tikim.draft';
const DRAFT_STEP_KEY = 'tikim.draftStep';
const TRAY_CART_KEY = 'tikim.trayCart';

export function showConfirmDialog(opts = {}) {
  const title = (typeof opts === 'object' && opts.title) || 'Confirm';
  const desc = (typeof opts === 'object' && (opts.desc || opts.text)) || 'Are you sure you want to proceed?';
  const confirmText = (typeof opts === 'object' && opts.confirmText) || 'Confirm';
  const cancelText = (typeof opts === 'object' && opts.cancelText) || 'Cancel';

  return new Promise((resolve) => {
    let dialog = document.getElementById('tikimConfirmDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'tikimConfirmDialog';
      dialog.className = 'confirm-dialog';
      dialog.setAttribute('aria-labelledby', 'confirmDialogTitle');
      dialog.setAttribute('aria-describedby', 'confirmDialogDesc');
      document.body.appendChild(dialog);
    }

    dialog.innerHTML = `
      <div class="confirm-card">
        <h2 id="confirmDialogTitle" class="confirm-dialog-title">${title}</h2>
        <p id="confirmDialogDesc" class="confirm-dialog-desc">${desc}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="btn btn-outline" id="btnCancelConfirmDialog">${cancelText}</button>
          <button type="button" class="btn btn-primary" id="btnOkConfirmDialog" style="background: var(--rust, #ab4b2e); border-color: var(--rust, #ab4b2e);">${confirmText}</button>
        </div>
      </div>
    `;

    const cancelBtn = dialog.querySelector('#btnCancelConfirmDialog');
    const confirmBtn = dialog.querySelector('#btnOkConfirmDialog');

    const handleClose = (confirmed) => {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      resolve(confirmed);
    };

    cancelBtn.onclick = () => handleClose(false);
    confirmBtn.onclick = () => handleClose(true);
    dialog.oncancel = (e) => {
      e.preventDefault();
      handleClose(false);
    };

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    cancelBtn.focus();
  });
}

let debounceTimer = null;

export const draftStore = {
  getDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  setDraft(draft) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) {
      console.warn('Could not save draft to localStorage:', e);
    }
    this.notify();
  },

  updateDraft(patch, immediate = false) {
    const current = this.getDraft();
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    clearTimeout(debounceTimer);
    if (immediate) {
      this.setDraft(updated);
    } else {
      debounceTimer = setTimeout(() => {
        this.setDraft(updated);
      }, 300);
      this.notify();
    }
    return updated;
  },

  notify() {
    const draft = this.getDraft();
    window.dispatchEvent(new CustomEvent('tikim:draft-changed', { detail: draft }));
    window.dispatchEvent(new CustomEvent('tikim:draft-updated', { detail: draft }));
  },

  // Internal reset: used after successful reservation, draft expiration, and pricing changes.
  async reset() {
    clearTimeout(debounceTimer);
    debounceTimer = null;
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_STEP_KEY);
      localStorage.removeItem(TRAY_CART_KEY);
      localStorage.removeItem('tikim.trays');
      await mockApi.clearDraft();
      await mockApi.releaseHold();
    } catch (e) {
      console.warn('Error clearing draft storage:', e);
    }

    if (typeof window.__closeMyEventDrawer === 'function') {
      window.__closeMyEventDrawer();
    }

    this.notify();
    window.dispatchEvent(new CustomEvent('tikim:draft-reset'));
    return true;
  },

  subscribe(callback) {
    const handler = (e) => callback(e.detail);
    window.addEventListener('tikim:draft-changed', handler);
    return () => window.removeEventListener('tikim:draft-changed', handler);
  }
};

// Cross-tab synchronization via storage event
window.addEventListener('storage', (e) => {
  if (e.key === DRAFT_KEY) {
    draftStore.notify();
  }
});

window.draftStore = draftStore;
window.showConfirmDialog = showConfirmDialog;
