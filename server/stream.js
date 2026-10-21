// Tool names and argument fragments are assembled by index, never parsed mid-stream.
export async function collectCompletion(response, onEvent = () => {}) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;
    if (text) onEvent('text', { text });
    return result;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', content = '', finished = false;
  const calls = new Map();
  const line = (value) => {
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') { finished = true; return; }
    const event = JSON.parse(data);
    if (event.error) throw new Error(event.error.message || 'Upstream stream error.');
    const choice = event.choices?.[0];
    if (!choice) return;
    if (choice.delta?.content) { content += choice.delta.content; onEvent('text', { text: choice.delta.content }); }
    for (const part of choice.delta?.tool_calls || []) {
      if (!Number.isInteger(part.index) || part.index < 0 || part.index >= 20) throw new Error('Tool index tidak valid.');
      const call = calls.get(part.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
      call.id += part.id || '';
      call.function.name += part.function?.name || '';
      call.function.arguments += part.function?.arguments || '';
      if (call.function.arguments.length > 100000) throw new Error('Argumen tool terlalu besar.');
      calls.set(part.index, call);
    }
    if (choice.finish_reason != null) finished = true;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const value of lines) line(value.trim());
      if (done) { if (buffer.trim()) line(buffer.trim()); break; }
      if (finished) break;
    }
    if (!finished) throw new Error('Stream agent terputus sebelum selesai.');
    return { choices: [{ message: { role: 'assistant', content: content || null, ...(calls.size ? { tool_calls: [...calls].sort(([a], [b]) => a - b).map(([, call]) => call) } : {}) } }] };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}