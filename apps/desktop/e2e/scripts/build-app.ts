import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { msvcEnv } from './msvc-env';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');

/** Compila o binario debug (sem instalador) que o tauri-driver vai abrir. */
export function buildApp(): void {
  const result = spawnSync(
    'pnpm',
    ['--filter', '@scf/desktop', 'exec', 'tauri', 'build', '--debug', '--no-bundle'],
    { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32', env: msvcEnv() },
  );
  if (result.status !== 0) {
    throw new Error(`tauri build --debug --no-bundle falhou (codigo ${result.status}).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildApp();
}
