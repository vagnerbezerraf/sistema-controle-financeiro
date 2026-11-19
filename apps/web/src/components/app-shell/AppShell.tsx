'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Target,
  PiggyBank,
  FileBarChart,
  LogOut,
  Settings,
  Wallet,
  Tags,
  CalendarRange,
  CalendarClock,
  BellRing,
  TrendingUp,
  FlaskConical,
  Upload,
  GitMerge,
  Users,
  ChevronsUpDown,
} from 'lucide-react';
import { cls } from '@/lib/format';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
}

const navItems: NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/transactions', label: 'Lancamentos', icon: ArrowLeftRight },
  { href: '/app/accounts', label: 'Contas', icon: Wallet },
  { href: '/app/categories', label: 'Categorias', icon: Tags },
  { href: '/app/calendar', label: 'Calendario', icon: CalendarRange },
  { href: '/app/obligations', label: 'Contas a pagar', icon: CalendarClock },
  { href: '/app/alerts', label: 'Alertas', icon: BellRing },
  { href: '/app/cards', label: 'Cartoes e faturas', icon: CreditCard },
  { href: '/app/budgets', label: 'Orcamentos', icon: PiggyBank },
  { href: '/app/goals', label: 'Metas', icon: Target },
  { href: '/app/projection', label: 'Saldo projetado', icon: TrendingUp },
  { href: '/app/scenarios', label: 'Cenarios', icon: FlaskConical },
  { href: '/app/imports', label: 'Importar extrato', icon: Upload },
  { href: '/app/reconciliation', label: 'Conciliacao', icon: GitMerge },
  { href: '/app/members', label: 'Membros', icon: Users },
  { href: '/app/reports', label: 'Relatorios', icon: FileBarChart },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, spaces, currentSpaceId, setCurrentSpace, logout } = useAuth();

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-600 text-white font-bold">S</span>
          <div>
            <div className="text-sm font-semibold">SCF</div>
            <div className="text-xs text-neutral-500">Controle Financeiro</div>
          </div>
        </div>
        <div className="border-b border-neutral-100 px-3 py-3">
          <label className="sr-only">Espaco financeiro</label>
          <div className="relative">
            <select
              className="input w-full appearance-none pr-8"
              value={currentSpaceId ?? ''}
              onChange={(e) => setCurrentSpace(e.target.value)}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((n) => {
            const active = pathname?.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cls(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition duration-fast',
                  active ? 'bg-brand-50 text-brand-700' : 'text-neutral-700 hover:bg-neutral-100',
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-neutral-100 p-3 space-y-1">
          <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs">
            <div className="font-medium text-neutral-800 truncate">{user?.name ?? user?.email}</div>
            <div className="text-neutral-500 truncate">{user?.email}</div>
          </div>
          <Link href="/app/settings" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
            <Settings className="h-4 w-4" /> Configuracoes
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-danger-700 hover:bg-danger-50"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-white font-bold">S</span>
            <span className="font-semibold">SCF</span>
          </div>
          <div className="hidden md:block text-sm text-neutral-600">
            {navItems.find((n) => pathname?.startsWith(n.href))?.label ?? 'SCF'}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/app/transactions/new" className="btn-primary hidden sm:inline-flex">
              <ArrowLeftRight className="h-4 w-4" />
              Novo lancamento
            </Link>
            <button type="button" onClick={logout} className="btn-outline md:hidden" aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main id="conteudo" className="flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
