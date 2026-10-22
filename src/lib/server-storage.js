async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'X-9Router-Client': 'chat', ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message || 'Gagal mengakses penyimpanan server.');
  return response.json();
}
export async function getConversations() {
  for (let attempt = 0; ; attempt++) {
    try { return await request('/api/conversations'); }
    catch (error) {
      if (attempt >= 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}
export const putConversation = (conversation) => request(`/api/conversations/${conversation.id}`, { method: 'PUT', body: JSON.stringify(conversation) });
export const deleteConversation = (id) => request(`/api/conversations/${id}`, { method: 'DELETE' });
export const getFiles = (id) => request(`/api/conversations/${id}/files`);
export const approveFile = (id, fileId, status) => request(`/api/conversations/${id}/files/${fileId}/approval`, { method: 'POST', body: JSON.stringify({ status }) });
export async function uploadFiles(id, attachments) {
  const form = new FormData();
  attachments.forEach((a) => form.append('files', a.rawFile));
  return request(`/api/conversations/${id}/uploads`, { method: 'POST', body: form });
}

export async function streamAgent({ conversationId, model, messages, signal, onEvent }) {
  const response = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-9Router-Client': 'chat' }, body: JSON.stringify({ conversationId, model, messages }), signal });
  if (!response.ok) throw new Error((await response.json()).error?.message || 'Agent gagal.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', completed = false;
  const consume = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '[DONE]') { completed = true; return; }
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error.message);
    onEvent(event);
  };
  try {
    while (!completed) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) consume(line.trim());
      if (done) { if (buffer.trim()) consume(buffer.trim()); break; }
    }
    if (!completed) throw new Error('Stream agent terputus sebelum selesai.');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}