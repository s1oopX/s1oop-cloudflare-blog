import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
let shuttingDown = false;

const children = [
  {
    name: 'api',
    command: process.execPath,
    args: ['scripts/local-api.mjs'],
  },
  {
    name: 'astro',
    command: isWindows ? 'cmd.exe' : 'npx',
    args: isWindows
      ? ['/d', '/s', '/c', 'npx astro dev --host 127.0.0.1 --port 4322']
      : ['astro', 'dev', '--host', '127.0.0.1', '--port', '4322'],
  },
];

const processes = children.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${name}] exited with ${signal ?? code}`);
    shutdown(code ?? 1);
  });

  return child;
});

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 100);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
