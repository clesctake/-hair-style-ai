import { execFileSync, spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (branch !== 'phase-4-reconstructed') throw new Error('Automatic startup is restricted to phase-4-reconstructed.');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required.');
try {
  const r = await fetch('http://127.0.0.1:3000/fiole', { signal: AbortSignal.timeout(1500) });
  if (r.ok) { console.log('Already running: http://localhost:3000/fiole'); process.exit(0); }
} catch { /* No running server. */ }
await mkdir('.codespaces-runtime', { recursive: true });
const log = await open('.codespaces-runtime/server.log', 'a');
const child = spawn('npm', ['run', 'dev', '--', '--hostname', '0.0.0.0', '--port', '3000'], { detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env });
child.on('error', error => { console.error('Application startup failed:', error.message); process.exitCode = 1; });
child.unref(); await log.close();
console.log('COLOR FUTURE AI starting: http://localhost:3000/fiole');
