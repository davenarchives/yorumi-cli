#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { dirname, resolve } = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const root = resolve(dirname(fileURLToPath(pathToFileURL(__filename))), '..');
const tsxCli = resolve(root, '..', 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const entry = resolve(root, 'src', 'index.ts');

const child = spawn(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
