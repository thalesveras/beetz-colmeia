import type { AppSettings } from './types'

// O manifest é um arquivo estático (public/manifest.webmanifest) — o navegador
// o lê pra saber nome e ícone na hora de instalar. Pra o nome vir do banco, a
// gente troca o <link rel="manifest"> por um Blob gerado aqui.
//
// LIMITE REAL, e não tem contorno: o celular grava nome e ícone NO MOMENTO da
// instalação. Quem já instalou continua vendo o nome antigo até desinstalar e
// instalar de novo. Isso é do sistema operacional, não do nosso código.
//
// Ícones: com logo enviado em Configurações → Marca, o upload já gerou os
// PNGs certos (192/512/maskable) no bucket brand — pwa_icon_version marca que
// eles existem e serve de cache-buster. Sem logo (ou se a geração falhou),
// valem os PNGs do repo. As URLs dos gerados saem da mesma pasta do logo_url,
// então não precisamos importar o client do Supabase aqui.
const REPO_ICONS = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

function brandIcons(settings: AppSettings): { icons: typeof REPO_ICONS, appleTouch: string } {
  if (settings.logo_url && settings.pwa_icon_version) {
    const base = settings.logo_url.split('?')[0].replace(/\/[^/]*$/, '')
    const v = `?v=${settings.pwa_icon_version}`
    return {
      icons: [
        { src: `${base}/pwa-192.png${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `${base}/pwa-512.png${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `${base}/pwa-maskable-512.png${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ],
      // O iOS compõe transparência sobre preto — o maskable (fundo branco) é
      // o único dos três que garante um atalho bonito na tela de início.
      appleTouch: `${base}/pwa-maskable-512.png${v}`
    }
  }
  return { icons: REPO_ICONS, appleTouch: '/apple-touch-icon.png' }
}

let currentBlobUrl: string | null = null

export function applyPwaManifest(settings: AppSettings) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) return

  const { icons, appleTouch } = brandIcons(settings)

  const manifest = {
    name: settings.pwa_name,
    short_name: settings.pwa_short_name,
    description: settings.pwa_description,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f4f5',
    theme_color: '#050505',
    lang: 'pt-BR',
    icons,
    shortcuts: [
      { name: 'Minha escala', short_name: 'Escala', url: '/escala' },
      { name: 'Eventos', short_name: 'Eventos', url: '/eventos' }
    ]
  }

  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
  const url = URL.createObjectURL(blob)

  // Solta o Blob anterior: sem isso, cada refresh de configuração deixa um
  // objeto preso na memória até a aba fechar.
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  currentBlobUrl = url
  link.href = url

  // iOS ignora o manifest e usa esta meta pro nome do atalho na tela inicial.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'apple-mobile-web-app-title'
    document.head.appendChild(meta)
  }
  meta.content = settings.pwa_short_name

  document.title = `${settings.company_name} ${settings.short_name}`.trim()

  // Favicon acompanha o logo da marca: com logo enviado, a aba mostra ele;
  // sem logo (ou ao remover), volta pro favo padrão do repo. Favicon não exige
  // same-origin como ícone de PWA, então a URL do Storage funciona direto.
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (favicon) {
    if (settings.logo_url) {
      favicon.href = settings.logo_url
      favicon.removeAttribute('type')
    } else {
      favicon.href = '/hive-favicon.svg'
      favicon.type = 'image/svg+xml'
    }
  }

  // iOS lê este link na hora do "Adicionar à Tela de Início" — igual ao
  // manifest, só afeta quem instalar dali em diante.
  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (apple) apple.href = appleTouch
}
