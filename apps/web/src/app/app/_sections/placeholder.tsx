'use client';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Calendar, CreditCard, FileBarChart, PiggyBank, Target, ArrowUpRight } from 'lucide-react';

interface PlaceholderProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  href: string;
  tone: string;
}

export default function Placeholder({ title, subtitle, icon: Icon, href, tone }: PlaceholderProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-neutral-500">{subtitle}</p>
      </header>
      <div className="card">
        <div className="card-body flex flex-col items-start gap-4 md:flex-row md:items-center">
          <span className={`rounded-xl p-4 ${tone}`}>
            <Icon className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <div className="font-semibold text-neutral-900">Em desenvolvimento</div>
            <p className="mt-1 text-sm text-neutral-600">
              Esta secao faz parte do proximo ciclo do MVP. Enquanto isso, voce pode acompanhar o progresso pelo dashboard
              ou continuar registrando seus lancamentos.
            </p>
          </div>
          <Link href={href} className="btn-outline">
            Voltar ao dashboard <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export const CalendarPage = () => (
  <Placeholder
    title="Calendario financeiro"
    subtitle="Vencimentos, parcelas, faturas e receitas previstas."
    icon={Calendar}
    href="/app/dashboard"
    tone="bg-brand-50 text-brand-700"
  />
);
export const CardsPage = () => (
  <Placeholder
    title="Cartoes e faturas"
    subtitle="Cartao de credito, ciclos, fechamento, faturas e pagamentos."
    icon={CreditCard}
    href="/app/dashboard"
    tone="bg-warning-50 text-warning-700"
  />
);
export const BudgetsPage = () => (
  <Placeholder
    title="Orcamentos"
    subtitle="Limites mensais por categoria, consumo e alertas."
    icon={PiggyBank}
    href="/app/dashboard"
    tone="bg-success-50 text-success-700"
  />
);
export const GoalsPage = () => (
  <Placeholder
    title="Metas"
    subtitle="Valores-alvo, prazos, contribuicoes e progresso."
    icon={Target}
    href="/app/dashboard"
    tone="bg-brand-50 text-brand-700"
  />
);
export const ReportsPage = () => (
  <Placeholder
    title="Relatorios"
    subtitle="Evolucao mensal, gastos por categoria e comparacoes."
    icon={FileBarChart}
    href="/app/dashboard"
    tone="bg-danger-50 text-danger-700"
  />
);

export { CalendarPage as Calendar };
export { CardsPage as Cards };
export { BudgetsPage as Budgets };
export { GoalsPage as Goals };
export { ReportsPage as Reports };
