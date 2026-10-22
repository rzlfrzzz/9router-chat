import fs from 'node:fs';
import path from 'node:path';
import { runSandbox } from './sandbox.js';
import { artifactDiff } from './artifact-diff.js';
import { readSkill } from './skills.js';

export function workspaceTools(workspace, id, onEvent) {
  return [...tools, {
    definition: { type: 'function', function: { name: 'read_skill', description: 'Read unchanged office skill instructions. Scripts live in /skills/<name> in sandbox.', parameters: { type: 'object', properties: { name: { type: 'string', enum: ['xlsx', 'docx', 'pdf', 'pptx'] } }, required: ['name'], additionalProperties: false } } },
    execute: async (args) => readSkill(args?.name),
  }, {
    definition: { type: 'function', function: { name: 'list_files', description: 'List uploaded files and pending output files for this conversation.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
    execute: async () => workspace.listFiles(id),
  }, ...(process.env.ENABLE_PYTHON_SANDBOX === 'true' ? [{
    definition: { type: 'function', function: { name: 'run_python', description: 'Run offline Python. Read /workspace/uploads and approved /workspace/previous; write new /workspace/outputs. Set sourceFileId when revising a workbook for server-computed diff. XLSX formulas are recalculated and errors block publication. Use head() or ranges, not full tables.', parameters: { type: 'object', properties: { code: { type: 'string' }, preview: { type: 'string' }, sourceFileId: { type: 'string' } }, required: ['code', 'preview'], additionalProperties: false } } },
    execute: async (args, { signal }) => {
      if (!args || typeof args.code !== 'string' || typeof args.preview !== 'string' || args.preview.length > 10000 || Object.keys(args).some((key) => !['code', 'preview', 'sourceFileId'].includes(key))) throw new Error('Argumen Python tidak valid.');
      const uploads = workspace.folder(id, 'uploads');
      const available = workspace.listFiles(id);
      const approved = available.filter((file) => file.kind === 'outputs' && file.status === 'approved');
      const previous = fs.mkdtempSync(path.join(workspace.folder(id, 'outputs'), 'previous-'));
      fs.chmodSync(previous, 0o755);
      for (const file of approved) {
        const sourcePath = path.join(workspace.folder(id, 'outputs'), file.name);
        const stat = fs.lstatSync(sourcePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Artifact sebelumnya tidak aman.');
        fs.copyFileSync(sourcePath, path.join(previous, file.name), fs.constants.COPYFILE_EXCL);
        fs.chmodSync(path.join(previous, file.name), 0o644);
      }
      const sourceFile = args.sourceFileId ? available.find((file) => file.id === args.sourceFileId && file.status === 'approved') : null;
      if (args.sourceFileId && !sourceFile) throw new Error('File sumber tidak ditemukan atau belum disetujui.');
      // A fresh directory per run prevents later calls from mutating an approved artifact.
      const outputs = fs.mkdtempSync(path.join(workspace.folder(id, 'outputs'), 'run-'));
      fs.chmodSync(outputs, 0o777);
      let result;
      try { result = await runSandbox({ code: args.code, uploads, outputs, previous, signal }); }
      finally { fs.rmSync(previous, { recursive: true, force: true }); }
      const files = fs.readdirSync(outputs);
      if (files.length > 10) throw new Error('Maksimal 10 output per tool.');
      const artifacts = [];
      for (const name of files) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_. -]*\.(xlsx|csv|txt|json|md|png|jpg|jpeg|svg|pdf|docx|pptx)$/i.test(name)) continue;
        const source = path.join(outputs, name);
        if (/\.xlsx$/i.test(name) && !sourceFile && available.some((file) => /\.xlsx$/i.test(file.name))) throw new Error('Output XLSX memerlukan sourceFileId untuk diff terverifikasi terhadap workbook sumber.');
        const stat = fs.lstatSync(source);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 20 * 1024 * 1024) throw new Error('Output tidak aman atau terlalu besar.');
        const storedName = `${path.basename(outputs)}-${name}`;
        fs.copyFileSync(source, path.join(workspace.folder(id, 'outputs'), storedName), fs.constants.COPYFILE_EXCL);
        const sourcePath = sourceFile && /\.xlsx$/i.test(sourceFile.name) ? path.join(workspace.folder(id, sourceFile.kind), sourceFile.name) : null;
        const preview = await artifactDiff(sourcePath, source);
        const artifact = workspace.register(id, storedName, 'outputs', `Sumber pembanding: ${sourceFile?.name || '(workbook baru)'}\n${preview}\n\nCatatan agent (tidak diverifikasi): ${args.preview}`);
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