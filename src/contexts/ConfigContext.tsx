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
    try {
      const [permissions, levels, badges, settings] = await Promise.all([
        listRolePermissions(),
        listHiveLevelsConfig(),
        listBadgeDefsConfig(),
        getAppSettings()
      ])
      setRolePermissions(permissions)
      setHiveLevels(levels)
      setBadgeDefs(badges)
      setAppSettings(settings)
      // Nome do app instalado e título da aba saem do banco. Só afeta quem
      // instalar daqui pra frente — ver comentário em lib/pwaManifest.ts.
      applyPwaManifest(settings)
    } catch (err) {
      // Se a configuração não carregar (ex: tabelas novas ainda não aplicadas),
      // seguimos com os valores padrão embutidos no código.
      console.error('Falha ao carregar configurações:', err)
    } finally {
      setLoading(false)
    }
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
