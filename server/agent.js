export class AgentError extends Error {
  constructor(message, code, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Race also bounds handlers that ignore AbortSignal. Side-effecting handlers
// must cooperate with cancellation; racing cannot undo an external write.
async function bounded(operation, signal) {
  signal.throwIfAborted();
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason || new Error('Operation aborted.'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(operation), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

export async function runAgent({ messages, model, tools, complete, onEvent = () => {}, signal = new AbortController().signal,
  maxIterations = 15, toolTimeoutMs = 30000, modelTimeoutMs = 120000 }) {
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 15 ||
      !Number.isFinite(toolTimeoutMs) || toolTimeoutMs < 1 ||
      !Number.isFinite(modelTimeoutMs) || modelTimeoutMs < 1) {
    throw new AgentError('Konfigurasi batas agent tidak valid.', 'bad_config', 500);
  }
  const history = structuredClone(messages);
  const registry = new Map(tools.map((tool) => [tool.definition.function.name, tool]));
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const modelSignal = AbortSignal.any([signal, AbortSignal.timeout(modelTimeoutMs)]);
    let response;
    try {
      response = await bounded(() => complete({ model, messages: structuredClone(history),
        tools: tools.map((tool) => tool.definition), tool_choice: 'auto', stream: false }, modelSignal), modelSignal);
    } catch (error) {
      signal.throwIfAborted();
      if (modelSignal.aborted) throw new AgentError('Panggilan model timeout.', 'model_timeout', 504);
      throw error;
    }
    const message = response?.choices?.[0]?.message;
    if (!message || message.role !== 'assistant') throw new AgentError('Respons agent tidak valid.', 'bad_response');
    const calls = message.tool_calls;
    if (calls !== undefined && !Array.isArray(calls)) throw new AgentError('Format tool_calls tidak valid.', 'bad_response');
    if (!calls?.length) {
      if (typeof message.content !== 'string' || !message.content.trim()) throw new AgentError('Model mengembalikan jawaban kosong.', 'empty_response');
      return { ...response, iterations: iteration, toolExecutions: history.filter((item) => item.role === 'tool').length };
    }
    if (calls.length > 20 || new Set(calls.map((call) => call.id)).size !== calls.length ||
        calls.some((call) => !call.id || typeof call.id !== 'string' || call.type !== 'function' || typeof call.function?.name !== 'string')) {
      throw new AgentError('Tool calls tidak valid atau terlalu banyak (maksimal 20 per iterasi).', 'bad_tool_calls');
    }
    history.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls });
    // Do not execute another batch when there is no budget left to interpret it.
    if (iteration === maxIterations) throw new AgentError('Agent mencapai batas iterasi sebelum selesai.', 'iteration_limit', 422);
    for (const call of calls) {
      signal.throwIfAborted();
      let result;
      onEvent('tool_start', { id: call.id, name: call.function.name });
      try {
        const tool = registry.get(call.function.name);
        if (!tool) throw new Error(`Tool tidak diizinkan: ${call.function.name}`);
        if (typeof call.function.arguments !== 'string' || call.function.arguments.length > 100000) throw new Error('Argumen tool tidak valid atau terlalu besar.');
        const args = JSON.parse(call.function.arguments);
        const toolSignal = AbortSignal.any([signal, AbortSignal.timeout(toolTimeoutMs)]);
        result = await bounded(() => tool.execute(args, { signal: toolSignal }), toolSignal);
        result = JSON.stringify({ ok: true, result });
        if (result.length > 200000) throw new Error('Hasil tool terlalu besar.');
      } catch (error) {
        signal.throwIfAborted();
        result = JSON.stringify({ ok: false, error: error.name === 'TimeoutError' ? 'Tool timeout.' : String(error.message || 'Tool gagal.').slice(0, 1000) });
      }
      history.push({ role: 'tool', tool_call_id: call.id, content: result });
      onEvent('tool_result', { id: call.id, name: call.function.name, ...JSON.parse(result) });
    }
  }
}