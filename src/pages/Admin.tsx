import { useState } from 'react'
import { Globe, Link2, Users, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { canManageUsers } from '../lib/permissions'
import InviteSection from '../components/admin/InviteSection'
import ProfilesSection from '../components/admin/ProfilesSection'
import RedirectsSection from '../components/admin/RedirectsSection'
import SubdomainsSection from '../components/admin/SubdomainsSection'

// A página era uma pilha de quatro seções empilhadas numa rolagem só — pra
// chegar nos redirecionadores era preciso passar por toda a lista de perfis.
// Agora cada assunto é uma aba, no mesmo padrão do EventDetail e do Settings.
type TabKey = 'convidar' | 'perfis' | 'redirecionadores' | 'subdominios'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'convidar', label: 'Convidar para o time', icon: UserPlus },
  { key: 'perfis', label: 'Perfis e departamentos', icon: Users },
  { key: 'redirecionadores', label: 'Redirecionadores', icon: Link2 },
  { key: 'subdominios', label: 'Subdomínios', icon: Globe }
]

export default function Admin() {
  const { accessRole } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('convidar')

  if (!canManageUsers(accessRole)) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-soft border border-beetz-dark/5 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h1 className="text-xl font-bold mb-1">Acesso restrito</h1>
        <p className="text-sm text-beetz-dark/60">Essa área é exclusiva para a Diretoria.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold">Administração</h1>
        <p className="text-beetz-dark/60 mt-1">Gerencie o time e os links da colmeia.</p>
      </div>

      <div className="bg-white rounded-2xl p-1.5 shadow-soft border border-beetz-dark/5 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap transition-colors ${
                activeTab === key ? 'bg-beetz-dark text-white' : 'text-beetz-dark/60 hover:bg-beetz-gray'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'convidar' && <InviteSection />}
      {activeTab === 'perfis' && <ProfilesSection />}
      {activeTab === 'redirecionadores' && <RedirectsSection />}
      {activeTab === 'subdominios' && <SubdomainsSection />}
    </div>
  )
}
