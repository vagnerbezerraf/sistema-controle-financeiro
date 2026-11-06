'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { KeyRound, ShieldCheck, ShieldOff, Copy, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface MeResponse {
  id?: string;
  email?: string;
  mfaEnabled?: boolean;
}

interface MfaSetup {
  secret: string;
  otpauthUrl: string;
}

type Phase = 'idle' | 'setup' | 'recovery';

export default function SettingsPage() {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>('/identity/me')
      .then((me) => setMfaEnabled(Boolean(me.mfaEnabled)))
      .catch(() => setMfaEnabled(false));
  }, []);

  function reset() {
    setCode('');
    setError(null);
    setSetup(null);
    setRecoveryCodes([]);
    setPhase('idle');
  }

  async function startSetup() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await apiFetch<MfaSetup>('/identity/mfa/setup', { method: 'POST' });
      setSetup(res);
      setPhase('setup');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Nao foi possivel iniciar a configuracao');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ recoveryCodes: string[] }>('/identity/mfa/enable', {
        method: 'POST',
        json: { code: code.trim() },
      });
      setRecoveryCodes(res.recoveryCodes ?? []);
      setMfaEnabled(true);
      setPhase('recovery');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Codigo invalido');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/identity/mfa/disable', { method: 'POST', json: { code: code.trim() } });
      setMfaEnabled(false);
      reset();
      setNotice('MFA desativado.');
    } catch (e: any) {
      setError(e?.details?.message ?? e?.message ?? 'Codigo invalido');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configuracoes</h1>
        <p className="text-sm text-neutral-500">
          Perfil, preferencias, exportacao de dados e gerenciamento de seguranca.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-neutral-500" />
              <h2 className="card-title text-lg">Perfil</h2>
            </div>
          </div>
          <div className="card-body space-y-3 text-sm text-neutral-700">
            <p>As preferencias de perfil e notificacoes serao gerenciadas aqui.</p>
            <p className="text-neutral-500">
              A primeira versao do MVP permite exportar e excluir sua conta via contato de suporte.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              {mfaEnabled ? (
                <ShieldCheck className="h-5 w-5 text-success-600" />
              ) : (
                <ShieldOff className="h-5 w-5 text-neutral-500" />
              )}
              <h2 className="card-title text-lg">Autenticacao em dois fatores (MFA)</h2>
            </div>
          </div>
          <div className="card-body space-y-4 text-sm text-neutral-700">
            {mfaEnabled === null && <p className="text-neutral-500">Carregando...</p>}

            {notice && (
              <div className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700">
                {notice}
              </div>
            )}
            {error && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {error}
              </div>
            )}

            {mfaEnabled === false && phase === 'idle' && (
              <>
                <p className="text-neutral-600">
                  Adicione uma camada extra de seguranca exigindo um codigo do seu app
                  autenticador a cada login.
                </p>
                <button type="button" className="btn-primary" onClick={startSetup} disabled={busy}>
                  {busy ? 'Preparando...' : 'Ativar MFA'}
                </button>
              </>
            )}

            {phase === 'setup' && setup && (
              <div className="space-y-4">
                <p className="text-neutral-600">
                  Escaneie o codigo abaixo no seu app autenticador (Google Authenticator,
                  Authy, 1Password) e informe o codigo de 6 digitos.
                </p>
                <div className="flex flex-col items-center gap-3 rounded-md border border-neutral-200 bg-white p-4">
                  <QRCodeSVG value={setup.otpauthUrl} size={176} level="M" />
                  <div className="text-center">
                    <p className="text-xs text-neutral-500">Nao consegue escanear? Use a chave manual:</p>
                    <CopyField value={setup.secret} />
                  </div>
                </div>
                <div>
                  <label htmlFor="mfaCode" className="label block">Codigo de verificacao</label>
                  <input
                    id="mfaCode"
                    className="input mt-1"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" onClick={confirmEnable} disabled={busy || code.trim().length < 6}>
                    {busy ? 'Confirmando...' : 'Confirmar e ativar'}
                  </button>
                  <button type="button" className="btn-outline" onClick={reset} disabled={busy}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {phase === 'recovery' && (
              <div className="space-y-4">
                <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
                  Guarde estes codigos de recuperacao em local seguro. Cada um so pode ser usado
                  uma vez e o acesso ao app autenticador pode ser perdido.
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800">
                  {recoveryCodes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                <CopyField value={recoveryCodes.join('\n')} label="Copiar todos" />
                <button type="button" className="btn-primary" onClick={() => { reset(); setNotice('MFA ativado com sucesso.'); }}>
                  Concluir
                </button>
              </div>
            )}

            {mfaEnabled === true && phase === 'idle' && (
              <div className="space-y-4">
                <p className="text-success-700">MFA esta ativo nesta conta.</p>
                <div>
                  <label htmlFor="mfaDisableCode" className="label block">Informe um codigo para desativar</label>
                  <input
                    id="mfaDisableCode"
                    className="input mt-1"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456 ou codigo de recuperacao"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <button type="button" className="btn-outline" onClick={confirmDisable} disabled={busy || code.trim().length < 6}>
                  {busy ? 'Desativando...' : 'Desativar MFA'}
                </button>
              </div>
            )}

            <p className="text-neutral-500">
              Revogacao de sessoes ativas e exportacao/exclusao de dados pessoais serao
              disponibilizadas nas proximas versoes.
            </p>
            <Link href="/app/dashboard" className="btn-outline">Voltar ao dashboard</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function CopyField({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="mt-2 inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copiado' : label}
    </button>
  );
}
