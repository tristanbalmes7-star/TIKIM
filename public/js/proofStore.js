// IndexedDB storage for payment proof blobs with zero localStorage quota impact.
const DB_NAME = 'tikim_proofs_db';
const DB_VERSION = 1;
const STORE_NAME = 'proofs';

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB is not supported in this environment'));
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function saveProofBlob(paymentId, blob) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(blob, String(paymentId));
    req.onsuccess = () => resolve(paymentId);
    req.onerror = () => reject(req.error);
  });
}

export async function getProofBlob(paymentId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(String(paymentId));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProofBlob(paymentId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(String(paymentId));
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function computeProofHash(blob) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }
  } catch (e) {
    // Fallback simple hash for older contexts
  }
  return 'hash_' + Date.now().toString(16) + Math.random().toString(16).slice(2, 8);
}
