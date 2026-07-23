// Validação e máscara de CPF — algoritmo oficial dos dígitos verificadores.
// Vive num arquivo próprio pra servir cadastro, edição de perfil e o que
// mais precisar no futuro (nota fiscal, contrato...).

export function cleanCpf(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '').slice(0, 11)
}

// Máscara progressiva: digita só número e o texto vira 000.000.000-00.
export function formatCpf(v: string | null | undefined): string {
  const d = cleanCpf(v)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function isValidCpf(v: string | null | undefined): boolean {
  const d = cleanCpf(v)
  if (d.length !== 11) return false
  // 111.111.111-11 e afins passam na conta mas não existem.
  if (/^(\d)\1{10}$/.test(d)) return false

  const dv = (corte: number) => {
    let soma = 0
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * (corte + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}
