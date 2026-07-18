import type { AppSettings } from './types'

// O manifest é um arquivo estático (public/manifest.webmanifest) — o navegador
// o lê pra saber nome e ícone na hora de instalar. Pra o nome vir do banco, a
// gente troca o <link rel="manifest"> por um Blob gerado aqui.
//
// LIMITE REAL, e não tem contorno: o celular grava nome e ícone NO MOMENTO da
// instalação. Quem já instalou continua vendo o nome antigo até desinstalar e
// instalar de novo. Isso é do sistema operacional, não do nosso código.
//
// Os ícones continuam apontando pros PNGs do repo de propósito: um Blob não
// pode referenciar arquivo do Storage sem CORS, e ícone de PWA precisa ser
// same-origin pra instalar em iOS.
const ICONS = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

let currentBlobUrl: string | null = null

export function applyPwaManifest(settings: AppSettings) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) return

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
    icons: ICONS,
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
}
