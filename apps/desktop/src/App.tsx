import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import AccountsPage from './pages/AccountsPage';
import CardsPage from './pages/CardsPage';
import ObligationsPage from './pages/ObligationsPage';
import CategoriesPage from './pages/CategoriesPage';
import CategorizationRulesPage from './pages/CategorizationRulesPage';
import ExchangeRatesPage from './pages/ExchangeRatesPage';
import ReportJobsPage from './pages/ReportJobsPage';
import BudgetsPage from './pages/BudgetsPage';
import GoalsPage from './pages/GoalsPage';
import AppShell from './shell/AppShell';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loggedIn, loading } = useAuth();
  if (loading) return <div className="p-10 text-sm text-neutral-500">Carregando SCF...</div>;
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { loggedIn, loading } = useAuth();
  if (loading) return null;
  if (loggedIn) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
        <Route path="/accounts" element={<RequireAuth><AccountsPage /></RequireAuth>} />
        <Route path="/cards" element={<RequireAuth><CardsPage /></RequireAuth>} />
        <Route path="/obligations" element={<RequireAuth><ObligationsPage /></RequireAuth>} />
        <Route path="/categories" element={<RequireAuth><CategoriesPage /></RequireAuth>} />
        <Route path="/categorization-rules" element={<RequireAuth><CategorizationRulesPage /></RequireAuth>} />
        <Route path="/exchange-rates" element={<RequireAuth><ExchangeRatesPage /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><ReportJobsPage /></RequireAuth>} />
        <Route path="/budgets" element={<RequireAuth><BudgetsPage /></RequireAuth>} />
        <Route path="/goals" element={<RequireAuth><GoalsPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
