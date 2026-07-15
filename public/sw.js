// Service worker da Colmeia.
//
// Regra de ouro: NUNCA cachear chamada de API. Estoque, escala e financeiro
// mudam o tempo todo — mostrar dado velho aqui é pior do que mostrar erro de
// conexão. Então só cacheamos o "casco" do app (HTML/JS/CSS), que é o que
// deixa ele abrir rápido e funcionar como aplicativo de verdade.

const CACHE = 'colmeia-v1'
const SHELL = ['/', '/index.html', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

// Limpa caches de versões antigas quando o SW novo assume.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Qualquer coisa que não seja do nosso domínio (Supabase, Google Fonts,
  // storage de avatar...) passa direto pra rede, sem cache nosso no meio.
  if (url.origin !== self.location.origin) return

  // Navegação: rede primeiro (pra pegar deploy novo), cache só se estiver off.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    )
    return
  }

  // Assets do build têm hash no nome (/assets/index-a1b2c3.js), então quando o
  // conteúdo muda o nome muda — pode cachear à vontade sem servir coisa velha.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return res
        })
      })
    )
  }
})
