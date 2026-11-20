import { useAuth } from '../auth/AuthContext';
import { ArrowLeftRight, CalendarClock, Coins, CreditCard, Filter, LogOut, PiggyBank, Settings, Tags, Target, Wallet, LayoutDashboard } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { logout } = useAuth();
  void logout;
  return (
    <div className="flex h-full min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-600 text-white font-bold">S</span>
          <div>
            <div className="text-sm font-semibold">SCF Desktop</div>
            <div className="text-xs text-neutral-500">Instalado</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3 text-sm">
          <NavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} pathname={location.pathname} />
          <NavItem to="/transactions" label="Lancamentos" icon={ArrowLeftRight} pathname={location.pathname} />
          <NavItem to="/accounts" label="Contas" icon={Wallet} pathname={location.pathname} />
          <NavItem to="/categories" label="Categorias" icon={Tags} pathname={location.pathname} />
          <NavItem to="/categorization-rules" label="Regras de categorizacao" icon={Filter} pathname={location.pathname} />
          <NavItem to="/exchange-rates" label="Taxas de cambio" icon={Coins} pathname={location.pathname} />
          <NavItem to="/cards" label="Cartoes" icon={CreditCard} pathname={location.pathname} />
          <NavItem to="/obligations" label="Contas a pagar" icon={CalendarClock} pathname={location.pathname} />
          <NavItem to="/budgets" label="Orcamentos" icon={PiggyBank} pathname={location.pathname} />
          <NavItem to="/goals" label="Metas" icon={Target} pathname={location.pathname} />
        </nav>
        <footer className="border-t border-neutral-100 p-3 space-y-1 text-xs text-neutral-600">
          <div className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-neutral-50 cursor-pointer">
            <Settings className="h-4 w-4" /> Configuracoes
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-danger-700 hover:bg-danger-50"
            onClick={() => logout()}
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </footer>
      </aside>
      <main className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-6">
          <div className="text-sm font-medium text-neutral-800">{currentTitle(location.pathname)}</div>
          <div className="flex items-center gap-2 text-sm">
            <button className="btn-primary" onClick={() => alert('Formulario de novo lancamento (MVP)')}>Novo lancamento</button>
            <button className="btn-outline" onClick={() => alert('Atalhos: Ctrl+N novo, Ctrl+F pesquisa, Ctrl+I importar')}>Atalhos</button>
          </div>
        </header>
        <section className="flex-1 overflow-y-auto px-8 py-6">
          {children}
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, pathname }: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; pathname: string }) {
  const active = pathname.startsWith(to);
  return (
    <NavLink to={to} className={`flex items-center gap-2 rounded-md px-3 py-2 ${active ? 'bg-brand-50 text-brand-700' : 'text-neutral-700 hover:bg-neutral-100'}`}>
      <Icon className="h-4 w-4" />{label}
    </NavLink>
  );
}

function currentTitle(pathname: string) {
  switch (pathname) {
    case '/dashboard': return 'Dashboard';
    case '/transactions': return 'Lancamentos';
    case '/accounts': return 'Contas';
    case '/cards': return 'Cartoes e faturas';
    case '/obligations': return 'Contas a pagar e receber';
    case '/categories': return 'Categorias';
    case '/categorization-rules': return 'Regras de categorizacao';
    case '/exchange-rates': return 'Taxas de cambio';
    case '/budgets': return 'Orcamentos';
    case '/goals': return 'Metas';
    default: return 'SCF Desktop';
  }
}
