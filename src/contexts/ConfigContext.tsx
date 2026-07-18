import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getAppSettings, listBadgeDefsConfig, listHiveLevelsConfig, listRolePermissions
} from '../lib/dataService'
import { setBadgeDefs, setHiveLevels } from '../lib/levels'
import { setRolePermissions } from '../lib/permissions'
import { applyPwaManifest } from '../lib/pwaManifest'
import { mockAppSettings } from '../lib/mockData'
import type { AppSettings } from '../lib/types'

interface ConfigContextValue {
  appSettings: AppSettings
  loading: boolean
  refreshConfig: () => Promise<void>
}

const ConfigContext = createContext<ConfigContextValue | undefined>(undefined)

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [appSettings, setAppSettings] = useState<AppSettings>(mockAppSettings)
  const [loading, setLoading] = useState(true)

  async function loadConfig() {
    // allSettled, não all: a marca (app_settings) é PÚBLICA e precisa aparecer
    // até deslogado — logo, favicon, textos da tela inicial. Já permissões,
    // níveis e medalhas exigem login; sem sessão essas três falham por RLS.
    // Com Promise.all, uma falha delas derrubava o pacote inteiro e o app
    // voltava pro 🐝 de fábrica em toda visita anônima.
    const [permissions, levels, badges, settings] = await Promise.allSettled([
      listRolePermissions(),
      listHiveLevelsConfig(),
      listBadgeDefsConfig(),
      getAppSettings()
    ])
    if (permissions.status === 'fulfilled') setRolePermissions(permissions.value)
    if (levels.status === 'fulfilled') setHiveLevels(levels.value)
    if (badges.status === 'fulfilled') setBadgeDefs(badges.value)
    if (settings.status === 'fulfilled') {
      setAppSettings(settings.value)
      // Nome do app instalado e título da aba saem do banco. Só afeta quem
      // instalar daqui pra frente — ver comentário em lib/pwaManifest.ts.
      applyPwaManifest(settings.value)
    } else {
      console.error('Falha ao carregar a marca:', settings.reason)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadConfig()
  }, [])

  return (
    <ConfigContext.Provider value={{ appSettings, loading, refreshConfig: loadConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig deve ser usado dentro de <ConfigProvider>')
  return ctx
}
