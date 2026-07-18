import { useConfig } from '../../contexts/ConfigContext'

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Mostra o nome e o nome curto ao lado do símbolo. */
  withName?: boolean
  /** Cor do texto — o menu é escuro, o login é claro. */
  tone?: 'light' | 'dark'
  /** Sobrescreve o nome curto. O portal do produtor diz "Portal do Produtor"
   *  ali, não "Colmeia" — é outro público, não é a marca interna. */
  subtitle?: string
}

const BOX = {
  sm: 'w-9 h-9 rounded-lg text-lg',
  md: 'w-10 h-10 rounded-xl text-xl',
  lg: 'w-14 h-14 rounded-2xl text-3xl',
  xl: 'w-20 h-20 rounded-2xl text-4xl'
}

// O símbolo da marca num lugar só. Antes o 🐝 estava escrito em 6 arquivos
// (menu, login, portal do produtor, onboarding), o que garantia que trocar a
// marca fosse esquecer de algum. Sem logo enviado, cai no emoji de sempre —
// então o app nunca fica sem símbolo, nem no primeiro carregamento.
export default function BrandLogo({ size = 'sm', withName = false, tone = 'light', subtitle }: BrandLogoProps) {
  const { appSettings } = useConfig()
  const logo = appSettings.logo_url

  const symbol = logo ? (
    // object-contain e não cover: logo cortado é logo estragado. O fundo claro
    // atrás garante que um PNG transparente de traço escuro continue visível
    // em cima do menu preto.
    <div className={`${BOX[size]} bg-white overflow-hidden flex items-center justify-center shrink-0`}>
      <img src={logo} alt={appSettings.company_name} className="w-full h-full object-contain" />
    </div>
  ) : (
    <div className={`${BOX[size]} honey-gradient flex items-center justify-center shrink-0`}>🐝</div>
  )

  if (!withName) return symbol

  return (
    <div className="flex items-center gap-2">
      {symbol}
      <div className="min-w-0">
        <p className={`font-extrabold leading-none truncate ${tone === 'light' ? '' : 'text-beetz-dark'}`}>
          {appSettings.company_name}
        </p>
        <p className={`text-[11px] leading-none mt-0.5 truncate ${
          tone === 'light' ? 'text-beetz-yellow/80' : 'text-beetz-dark/50'
        }`}>
          {subtitle ?? appSettings.short_name}
        </p>
      </div>
    </div>
  )
}
