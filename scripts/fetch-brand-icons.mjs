// Roda antes do build (npm prebuild): puxa do Storage os ícones de PWA que o
// navegador gerou no último upload do logo (Configurações → Marca) e os grava
// por cima dos PNGs estáticos do repo. Assim o ícone de instalação (iOS lê o
// apple-touch-icon estático; Chrome lê o manifest no momento zero) fica sempre
// igual ao logo vigente — sem depender de alguém commitar imagem.
//
// Sem rede ou sem arquivos no bucket (logo nunca enviado), o build segue com
// os PNGs já commitados. Falha aqui NUNCA derruba o deploy.
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const BASE = 'https://ozqpiobnnuchaeasqura.supabase.co/storage/v1/object/public/brand'
const OUT = resolve(process.cwd(), 'public')

// destino no repo  ←  origem no bucket
const FILES = [
  ['icon-192.png', 'pwa-192.png'],
  ['icon-512.png', 'pwa-512.png'],
  ['icon-maskable-512.png', 'pwa-maskable-512.png'],
  // iOS compõe transparência sobre preto; o maskable é o único garantidamente
  // sólido de canto a canto, então ele vira o ícone de tela de início.
  ['apple-touch-icon.png', 'pwa-maskable-512.png']
]

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

let ok = 0
for (const [dest, src] of FILES) {
  try {
    const res = await fetch(`${BASE}/${src}?t=${Date.now()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000 || !buf.subarray(0, 4).equals(PNG_MAGIC)) {
      throw new Error('resposta não é um PNG válido')
    }
    await writeFile(resolve(OUT, dest), buf)
    ok++
    console.log(`[brand-icons] ${dest} ← ${src} (${buf.length} bytes)`)
  } catch (err) {
    console.warn(`[brand-icons] ${dest} mantido do repo (${err.message})`)
  }
}
console.log(`[brand-icons] ${ok}/${FILES.length} ícones atualizados do bucket.`)
