import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const driverDir = path.resolve(here, '..', '..', '.e2e', 'msedgedriver');
const driverExe = path.join(driverDir, 'msedgedriver.exe');
const versionFile = path.join(driverDir, 'version.txt');

const WEBVIEW2_GUID = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function webview2Version(): string | null {
  const keys = [
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_GUID}`,
    `HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_GUID}`,
    `HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_GUID}`,
  ];
  for (const key of keys) {
    try {
      const out = execFileSync('reg', ['query', key, '/v', 'pv'], { encoding: 'utf8' });
      const match = out.match(/pv\s+REG_SZ\s+([\d.]+)/);
      if (match) return match[1];
    } catch {
      // chave ausente neste hive: tenta a proxima
    }
  }
  return null;
}

/**
 * Baixa o `msedgedriver` casado com o WebView2 instalado. Versoes divergentes
 * fazem o WebDriver travar ao conectar (ver doc de WebDriver do Tauri).
 */
export async function ensureMsedgedriver(): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('O E2E do desktop com tauri-driver so esta implementado para Windows.');
  }

  const version = process.env.E2E_MSEDGEDRIVER_VERSION ?? webview2Version();
  if (!version) {
    throw new Error('Nao foi possivel detectar a versao do WebView2 no registro (EdgeUpdate).');
  }

  if (existsSync(driverExe) && existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === version) {
    return driverExe;
  }

  const arch = process.arch === 'ia32' ? 'win32' : 'win64';
  const url = `https://msedgedriver.microsoft.com/${version}/edgedriver_${arch}.zip`;
  // O zip fica FORA de driverDir: a extracao recria o diretorio do zero para
  // nunca reaproveitar binario obsoleto de uma versao anterior.
  const zipPath = path.join(os.tmpdir(), `edgedriver-${version}-${arch}.zip`);

  console.log(`e2e:setup baixando msedgedriver ${version} (${arch})...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download do msedgedriver falhou (HTTP ${res.status}) em ${url}.`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

  rmSync(driverDir, { recursive: true, force: true });
  mkdirSync(driverDir, { recursive: true });
  // `Expand-Archive` quebra no PowerShell 7.7 com zips baixados da web
  // (mark-of-the-web -> overload ExtractToDirectory(3 args) inexistente), e o
  // erro nao interrompe a extracao de forma confiavel. Usamos o .NET direto.
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
        `[System.IO.Compression.ZipFile]::ExtractToDirectory('${zipPath}','${driverDir}')`,
    ],
    { stdio: 'inherit' },
  );
  rmSync(zipPath, { force: true });

  if (!existsSync(driverExe)) throw new Error('msedgedriver.exe nao encontrado apos extrair o zip.');

  // Guarda contra o bug historico: version.txt dizia .60 mas o binario era .46.
  const reported = execFileSync(driverExe, ['--version'], { encoding: 'utf8' }).trim();
  if (!reported.includes(version)) {
    throw new Error(`msedgedriver extraido reporta "${reported}", esperado ${version}.`);
  }
  writeFileSync(versionFile, `${version}\n`);
  console.log(`e2e:setup msedgedriver pronto -> ${driverExe} (${reported})`);
  return driverExe;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ensureMsedgedriver();
}
