// Gerador de QR (qrcodejs via CDN) — carregado sob demanda, só quando alguém
// abre um crachá/cartão. Mesmo padrão dos outros utilitários on-demand da
// casa (tesseract, jsQR, SheetJS): window.QRCode global + loader idempotente.
export async function loadQRCode(): Promise<any> {
  const w = window as any
  if (w.QRCode) return w.QRCode
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Não deu pra carregar o gerador de QR.'))
    document.head.appendChild(s)
  })
  return (window as any).QRCode
}
