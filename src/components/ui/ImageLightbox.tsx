import { X } from 'lucide-react'

// Visualizador de imagem em tela cheia DENTRO do app. Nasceu porque o antigo
// "Abrir em tamanho cheio" era um <a target="_blank"> apontando pro data: da
// foto — e navegador moderno BLOQUEIA aba nova com data: URL, então o toque
// simplesmente não fazia nada. Overlay próprio funciona em qualquer lugar
// (inclusive no PWA instalado): toca fora ou no X pra fechar.
export default function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-label="Comprovante em tamanho cheio"
    >
      <img
        src={src}
        alt="Comprovante"
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-3 right-3 bg-white/15 hover:bg-white/25 text-white rounded-full p-2"
      >
        <X size={20} />
      </button>
    </div>
  )
}
