'use client';
import Link from 'next/link';
import { UserCircle2 } from 'lucide-react';

export default function SettingsPage() {
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
              <UserCircle2 className="h-5 w-5 text-neutral-500" />
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
            <h2 className="card-title text-lg">Seguranca</h2>
          </div>
          <div className="card-body space-y-3 text-sm text-neutral-700">
            <ul className="list-disc space-y-1 pl-5 text-neutral-600">
              <li>Autenticacao multifator habilitavel via provedor de identidade</li>
              <li>Revogacao de sessoes ativas</li>
              <li>Exportacao e exclusao de dados pessoais</li>
            </ul>
            <Link href="/app/dashboard" className="btn-outline">Voltar ao dashboard</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
