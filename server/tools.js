import fs from 'node:fs';
import path from 'node:path';
import { runSandbox } from './sandbox.js';

export function workspaceTools(workspace, id, onEvent) {
  return [...tools, {
    definition: { type: 'function', function: { name: 'list_files', description: 'List uploaded files and pending output files for this conversation.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
    execute: async () => workspace.listFiles(id),
  }, ...(process.env.ENABLE_PYTHON_SANDBOX === 'true' ? [{
    definition: { type: 'function', function: { name: 'run_python', description: 'Run Python in an offline isolated container with pandas/openpyxl. Inputs /workspace/uploads; write new files in /workspace/outputs. Include a human-readable preview of changes.', parameters: { type: 'object', properties: { code: { type: 'string' }, preview: { type: 'string' } }, required: ['code', 'preview'], additionalProperties: false } } },
    execute: async (args, { signal }) => {
      if (!args || typeof args.code !== 'string' || typeof args.preview !== 'string' || args.preview.length > 10000 || Object.keys(args).some((key) => !['code', 'preview'].includes(key))) throw new Error('Argumen Python tidak valid.');
      const uploads = workspace.folder(id, 'uploads');
      // A fresh directory per run prevents later calls from mutating an approved artifact.
      const outputs = fs.mkdtempSync(path.join(workspace.folder(id, 'outputs'), 'run-'));
      fs.chmodSync(outputs, 0o777);
      const result = await runSandbox({ code: args.code, uploads, outputs, signal });
      const files = fs.readdirSync(outputs);
      if (files.length > 10) throw new Error('Maksimal 10 output per tool.');
      const artifacts = [];
      for (const name of files) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_. -]*\.(xlsx|csv|txt|json|md)$/i.test(name)) continue;
        const source = path.join(outputs, name);
        const stat = fs.lstatSync(source);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 20 * 1024 * 1024) throw new Error('Output tidak aman atau terlalu besar.');
        const storedName = `${path.basename(outputs)}-${name}`;
        fs.copyFileSync(source, path.join(workspace.folder(id, 'outputs'), storedName), fs.constants.COPYFILE_EXCL);
        const artifact = workspace.register(id, storedName, 'outputs', args.preview);
        artifacts.push(artifact); onEvent('file', artifact);
      }
      return { ...result, files: artifacts };
    },
  }] : [])];
}

// Only server-owned definitions and handlers are exposed to the model.
export const tools = [{
  definition: {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time in an IANA time zone.',
      parameters: {
        type: 'object',
        properties: { timeZone: { type: 'string', description: 'IANA zone, for example Asia/Jakarta. Defaults to UTC.' } },
        additionalProperties: false,
      },
    },
  },
  async execute(args, { signal }) {
    signal.throwIfAborted();
    if (!args || typeof args !== 'object' || Array.isArray(args) ||
        Object.keys(args).some((key) => key !== 'timeZone') ||
        (args.timeZone !== undefined && typeof args.timeZone !== 'string')) {
      throw new Error('Invalid arguments: expected { timeZone?: string }.');
    }
    const timeZone = args.timeZone || 'UTC';
    return { timeZone, iso: new Date().toISOString(), local: new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone }).format(new Date()) };
  },
}];