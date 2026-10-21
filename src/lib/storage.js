const KEY = '9router-chat:conversations:v1';
const MODEL_KEY = '9router-chat:model';

export function loadConversations() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Jika kuota penuh, buang data biner lampiran (metadata tetap disimpan).
export function saveConversations(convs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(convs));
    return { ok: true, stripped: false };
  } catch {
    try {
      const slim = convs.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.attachments?.length
            ? { ...m, attachments: m.attachments.map((a) => ({ ...a, dataUrl: undefined, text: undefined, dropped: true })) }
            : m
        ),
      }));
      localStorage.setItem(KEY, JSON.stringify(slim));
      return { ok: true, stripped: true };
    } catch {
      return { ok: false, stripped: false };
    }
  }
}

export const loadModel = () => { try { return localStorage.getItem(MODEL_KEY) || ''; } catch { return ''; } };
export const saveModel = (m) => { try { localStorage.setItem(MODEL_KEY, m); } catch {} };