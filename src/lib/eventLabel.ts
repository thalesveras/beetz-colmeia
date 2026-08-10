import type { EventItem } from './types'

// Rótulo padrão de evento em TODO formulário/filtro: "26/07 NOME DO EVENTO".
// A data vem SEMPRE da coluna event_date (a fonte da verdade) — ninguém mais
// precisa digitar a data no nome. E quem já digitou não vê duplicado: o
// prefixo digitado ("26/07 - X", "26/07 X", "2607 X") é ignorado NA EXIBIÇÃO.
// O nome gravado no banco não muda — é só rótulo, zero mexida em dado.

function pareceDiaMes(dd: number, mm: number): boolean {
  return dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12
}

// Tira prefixo de data digitado no começo do nome, com cuidado pra não comer
// nome legítimo (ex.: "2026 FESTIVAL" fica em paz — 20/26 não é dia/mês).
export function stripEventDatePrefix(name: string): string {
  const s = (name ?? '').trim()
  // "26/07 X", "26/07 - X", "26/07- X", "26/07/2026 X"
  const barra = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\s*[-–—·]?\s+(.+)$/)
  if (barra && pareceDiaMes(Number(barra[1]), Number(barra[2]))) return barra[3].trim()
  // "2607 X" (padrão antigo da casa: DDMM colado)
  const colado = s.match(/^(\d{2})(\d{2})\s*[-–—·]?\s+(.+)$/)
  if (colado && pareceDiaMes(Number(colado[1]), Number(colado[2]))) return colado[3].trim()
  return s
}

export function eventLabel(ev: Pick<EventItem, 'name' | 'event_date'>): string {
  const nome = stripEventDatePrefix(ev.name)
  const d = ev.event_date ?? ''
  if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return nome
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${nome}`
}
