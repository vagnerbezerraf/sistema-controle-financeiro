import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const PROGRAM_FILES = process.env.ProgramFiles ?? 'C:\\Program Files';
const PROGRAM_FILES_X86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';

function latestChildDir(parent: string): string | null {
  if (!existsSync(parent)) return null;
  const dirs = readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return dirs.length > 0 ? path.join(parent, dirs[dirs.length - 1]) : null;
}

/**
 * No Windows as variaveis de ambiente sao case-insensitive, mas o `process.env`
 * do Node preserva a grafia original (`Path` no shell do usuario). Criar uma
 * chave nova (`PATH`) faz o Windows descartar uma das duas ao montar o bloco de
 * ambiente do filho, perdendo entradas — logo, escrevemos sempre na chave existente.
 */
function envKey(env: NodeJS.ProcessEnv, name: string): string {
  return Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase()) ?? name;
}

/**
 * O `vcvars64.bat` nao sobrevive ao fim do processo, entao montamos `LIB`,
 * `INCLUDE` e `PATH` na mao. Sem isso o `link.exe` aborta com
 * `LNK1104: cannot open file 'msvcrt.lib'`.
 */
export function msvcEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (env[envKey(env, 'LIB')] && env[envKey(env, 'INCLUDE')]) return env;

  const vsRoot = process.env.E2E_VS_PATH ?? path.join(PROGRAM_FILES, 'Microsoft Visual Studio');
  const candidates = [
    process.env.E2E_VS_PATH,
    path.join(vsRoot, '2022', 'Community'),
    path.join(vsRoot, '2022', 'Professional'),
    path.join(vsRoot, '2022', 'Enterprise'),
    path.join(vsRoot, '2022', 'BuildTools'),
  ].filter((value): value is string => Boolean(value));

  const install = candidates.find((candidate) => existsSync(path.join(candidate, 'VC', 'Tools', 'MSVC')));
  if (!install) {
    throw new Error('Visual Studio com VC Tools nao encontrado. Defina E2E_VS_PATH com o diretorio da instalacao.');
  }

  const msvcRoot = latestChildDir(path.join(install, 'VC', 'Tools', 'MSVC'));
  const sdkRoot = path.join(PROGRAM_FILES_X86, 'Windows Kits', '10');
  const sdkVersion = latestChildDir(path.join(sdkRoot, 'Lib'));
  if (!msvcRoot || !sdkVersion) {
    throw new Error('Instalacao de MSVC ou Windows SDK incompleta.');
  }

  const pathKey = envKey(env, 'PATH');
  env[pathKey] = `${path.join(msvcRoot, 'bin', 'Hostx64', 'x64')};${env[pathKey] ?? ''}`;
  env[envKey(env, 'LIB')] = [
    path.join(msvcRoot, 'lib', 'x64'),
    path.join(sdkRoot, 'Lib', sdkVersion, 'ucrt', 'x64'),
    path.join(sdkRoot, 'Lib', sdkVersion, 'um', 'x64'),
  ].join(';');
  env[envKey(env, 'INCLUDE')] = [
    path.join(msvcRoot, 'include'),
    path.join(sdkRoot, 'Include', sdkVersion, 'ucrt'),
    path.join(sdkRoot, 'Include', sdkVersion, 'um'),
    path.join(sdkRoot, 'Include', sdkVersion, 'shared'),
  ].join(';');
  return env;
}
