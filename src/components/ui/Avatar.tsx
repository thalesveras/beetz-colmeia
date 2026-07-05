interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = { sm: 'w-9 h-9 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-20 h-20 text-xl', xl: 'w-32 h-32 text-3xl' }

export default function Avatar({ src, name, size = 'md' }: AvatarProps) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase()
  return (
    <div className={`${sizeMap[size]} rounded-full overflow-hidden flex items-center justify-center bg-beetz-yellow text-beetz-dark font-bold border-2 border-beetz-dark shrink-0`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initials || '🐝'}</span>
      )}
    </div>
  )
}
