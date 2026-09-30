import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'SCF - Sistema de Controle Financeiro',
    template: '%s | SCF',
  },
  description:
    'Plataforma de controle financeiro pessoal e familiar: registre o que aconteceu, entenda sua situacao atual e planeje compromissos futuros.',
  applicationName: 'SCF',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-full bg-neutral-50 text-neutral-900">
        <Providers>
          <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-white">
            Pular para o conteudo
          </a>
          {children}
          <footer className="w-full border-t border-neutral-200 bg-white py-6 text-center text-xs text-neutral-500">
            <div className="mx-auto max-w-6xl px-4">
              <Link href="/" className="hover:text-brand-700">SCF</Link> — Sistema de Controle Financeiro.
              Dados sensiveis, privacidade por padrao.
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
