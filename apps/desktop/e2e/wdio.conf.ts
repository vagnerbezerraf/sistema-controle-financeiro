import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildApp } from './scripts/build-app';
import { ensureMsedgedriver } from './scripts/setup-drivers';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');

const exeName = process.platform === 'win32' ? 'scf-desktop.exe' : 'scf-desktop';
const appBinary = path.join(appRoot, 'src-tauri', 'target', 'debug', exeName);

const driverHost = '127.0.0.1';
const driverPort = Number(process.env.E2E_DRIVER_PORT ?? 4444);
const tauriDriverBin =
  process.env.E2E_TAURI_DRIVER ??
  path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'tauri-driver.exe' : 'tauri-driver');

let tauriDriver: ChildProcess | undefined;
let shuttingDown = false;

async function waitForDriver(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: driverHost, port: driverPort });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    if (Date.now() > deadline) throw new Error(`tauri-driver nao abriu ${driverHost}:${driverPort} em ${timeoutMs}ms.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function stopDriver(): void {
  shuttingDown = true;
  tauriDriver?.kill();
}

export const config: WebdriverIO.Config = {
  hostname: driverHost,
  port: driverPort,
  specs: [path.join(here, 'specs', '**', '*.e2e.ts')],
  maxInstances: 1,
  capabilities: [
    {
      'tauri:options': {
        application: appBinary,
      },
    } as WebdriverIO.Capabilities,
  ],
  reporters: ['spec'],
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120_000,
  },
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 1,

  onPrepare: async () => {
    const msedgedriver = await ensureMsedgedriver();
    process.env.E2E_MSEDGEDRIVER = msedgedriver;
    if (process.env.E2E_SKIP_BUILD !== '1') buildApp();
  },

  beforeSession: async () => {
    const msedgedriver = process.env.E2E_MSEDGEDRIVER;
    if (!msedgedriver) throw new Error('Caminho do msedgedriver nao definido.');
    tauriDriver = spawn(tauriDriverBin, ['--native-driver', msedgedriver], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    tauriDriver.on('exit', (code) => {
      if (!shuttingDown) console.error(`tauri-driver encerrou inesperadamente (codigo ${code}).`);
    });
    await waitForDriver();
  },

  afterSession: () => {
    stopDriver();
  },
};

// O `afterSession` nao roda se a sessao falhar ao iniciar, entao garantimos a
// limpeza do tauri-driver tambem na saida do processo.
const cleanup = () => stopDriver();
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});
