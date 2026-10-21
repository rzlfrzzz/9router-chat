import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export function runSandbox({ code, uploads, outputs, signal }) {
  if (typeof code !== 'string' || code.length > 50000) throw new Error('Kode maksimal 50.000 karakter.');
  if (process.env.ENABLE_PYTHON_SANDBOX !== 'true') throw new Error('Sandbox Python dinonaktifkan. Administrator harus menyediakan Docker dan image terlebih dahulu.');
  const name = `9router-${randomUUID()}`;
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['run', '--rm', '--pull=never', '--name', name,
      '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--cpus=1', '--memory=512m', '--memory-swap=512m', '--pids-limit=64', '--user=65534:65534',
      '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
      '--mount', `type=bind,source=${uploads},target=/workspace/uploads,readonly`,
      '--mount', `type=bind,source=${outputs},target=/workspace/outputs`,
      '--workdir=/workspace', '-i', process.env.PYTHON_SANDBOX_IMAGE || '9router-python:local', 'python', '-I', '-'],
    { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', overflow = false;
    const kill = () => {
      child.kill('SIGKILL');
      const cleanup = spawn('docker', ['rm', '-f', name], { stdio: 'ignore' });
      cleanup.on('error', () => {});
    };
    const timer = setTimeout(kill, 30000);
    signal.addEventListener('abort', kill, { once: true });
    if (signal.aborted) kill();
    const capture = (field, data) => {
      if (field === 'out') stdout += data; else stderr += data;
      if (stdout.length + stderr.length > 100000) { overflow = true; kill(); }
    };
    child.stdout.on('data', (data) => capture('out', data));
    child.stderr.on('data', (data) => capture('err', data));
    child.stdin.on('error', () => {});
    child.stdin.end(code);
    child.on('error', (error) => {
      clearTimeout(timer); signal.removeEventListener('abort', kill); reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(timer); signal.removeEventListener('abort', kill);
      if (status !== 0 || overflow || signal.aborted) reject(new Error(`Sandbox gagal/dihentikan: ${stderr.slice(0, 2000)}`));
      else resolve({ stdout, stderr });
    });
  });
}