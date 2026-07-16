import { Routes, Route } from 'react-router-dom'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TeamDirectory from './pages/TeamDirectory'
import ProfilePage from './pages/ProfilePage'
import HiveMap from './pages/HiveMap'
import Birthdays from './pages/Birthdays'
import Escala from './pages/Escala'
import Stock from './pages/Stock'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import EventsList from './pages/events/EventsList'
import EventDetail from './pages/events/EventDetail'
import EventForm from './pages/events/EventForm'
import FinanceExpenses from './pages/FinanceExpenses'
import FinanceDashboard from './pages/finance/FinanceDashboard'
import Suppliers from './pages/Suppliers'
import Repasses from './pages/Repasses'
import Receipts from './pages/Receipts'
import AllSettlements from './pages/AllSettlements'
import Ranking from './pages/Ranking'
import Info from './pages/Info'
import NotFound from './pages/NotFound'
import OnboardingWizard from './pages/onboarding/OnboardingWizard'
import ProtectedRoute from './components/ProtectedRoute'
import ProducerProtectedRoute from './components/ProducerProtectedRoute'
import ProducerLogin from './pages/producer/ProducerLogin'
import ProducerOnboarding from './pages/producer/ProducerOnboarding'
import ProducerDashboard from './pages/producer/ProducerDashboard'
import ProducerNewProposal from './pages/producer/ProducerNewProposal'
import ProducerEventDetail from './pages/producer/ProducerEventDetail'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/entrar" element={<Login />} />

      <Route path="/cadastro" element={
        <ProtectedRoute requireOnboarding={false}><OnboardingWizard /></ProtectedRoute>
      } />

      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/turma" element={<ProtectedRoute><TeamDirectory /></ProtectedRoute>} />
      <Route path="/perfil/:id" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/mapa" element={<ProtectedRoute><HiveMap /></ProtectedRoute>} />
      <Route path="/aniversariantes" element={<ProtectedRoute><Birthdays /></ProtectedRoute>} />
      <Route path="/escala" element={<ProtectedRoute><Escala /></ProtectedRoute>} />
      <Route path="/eventos" element={<ProtectedRoute><EventsList /></ProtectedRoute>} />
      <Route path="/eventos/novo" element={<ProtectedRoute><EventForm /></ProtectedRoute>} />
      <Route path="/eventos/:id" element={<ProtectedRoute><EventDetail /></ProtectedRoute>} />
      <Route path="/estoque" element={<ProtectedRoute><Stock /></ProtectedRoute>} />
      {/* /financeiro agora é o dashboard; a lista de lançamentos (onde se
          cadastra e edita despesa) ganhou endereço próprio. */}
      <Route path="/financeiro" element={<ProtectedRoute><FinanceDashboard /></ProtectedRoute>} />
      <Route path="/financeiro/despesas" element={<ProtectedRoute><FinanceExpenses /></ProtectedRoute>} />
      <Route path="/financeiro/fornecedores" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
      <Route path="/financeiro/repasses" element={<ProtectedRoute><Repasses /></ProtectedRoute>} />
      <Route path="/financeiro/recebimentos" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />
      <Route path="/financeiro/fechamentos" element={<ProtectedRoute><AllSettlements /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
      <Route path="/informacoes" element={<ProtectedRoute><Info /></ProtectedRoute>} />

      <Route path="/produtor/entrar" element={<ProducerLogin />} />
      <Route path="/produtor/cadastro" element={
        <ProducerProtectedRoute requireProfile={false}><ProducerOnboarding /></ProducerProtectedRoute>
      } />
      <Route path="/produtor" element={<ProducerProtectedRoute><ProducerDashboard /></ProducerProtectedRoute>} />
      <Route path="/produtor/nova-proposta" element={<ProducerProtectedRoute><ProducerNewProposal /></ProducerProtectedRoute>} />
      <Route path="/produtor/eventos/:id" element={<ProducerProtectedRoute><ProducerEventDetail /></ProducerProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
