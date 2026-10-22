export async function probeTools({ model, baseUrl, headers, signal }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers, signal,
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: 'Call capability_probe with no arguments.' }], tools: [{ type: 'function', function: { name: 'capability_probe', description: 'Check function calling.', parameters: { type: 'object', properties: {}, additionalProperties: false } } }], tool_choice: { type: 'function', function: { name: 'capability_probe' } }, max_tokens: 100 }),
  });
  if (!response.ok) return { supported: null, warning: `Probe tool ditolak HTTP ${response.status}; model/provider mungkin tidak mendukung tool_choice. Gunakan panel Excel jika agent gagal.` };
  const data = await response.json();
  const supported = data.choices?.[0]?.message?.tool_calls?.some((call) => call.function?.name === 'capability_probe') || false;
  return { supported, warning: supported ? null : 'Model tidak menghasilkan tool call saat diuji. Pilih model lain atau gunakan panel Excel (JSON edit).' };
}