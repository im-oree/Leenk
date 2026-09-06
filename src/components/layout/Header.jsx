import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import IconButton from '../ui/IconButton'

/**
 * Universal page header. Every page gets a back or close affordance —
 * `back` for pushed pages, `close` for modal-style pages.
 */
export default function Header({
  title,
  subtitle,
  back = false,
  close = false,
  onBack,
  onClose,
  right,
  left,
  center = false,
  border = true,
  transparent = false,
  className = '',
}) {
  const navigate = useNavigate()
  const handleBack = () => (onBack ? onBack() : navigate(-1))
  const handleClose = () => (onClose ? onClose() : navigate(-1))

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={[
        'sticky top-0 z-40 safe-top',
        transparent ? '' : 'glass',
        border && !transparent ? 'border-b hairline' : '',
        className,
      ].join(' ')}
    >
      <div className="h-[56px] px-2.5 flex items-center gap-1.5">
        <div className="flex items-center gap-1 shrink-0">
          {back && <IconButton icon="back" label="Go back" onClick={handleBack} tone={transparent ? 'glass' : 'ghost'} />}
          {close && <IconButton icon="close" label="Close" onClick={handleClose} tone={transparent ? 'glass' : 'ghost'} />}
          {left}
        </div>
        <div className={`flex-1 min-w-0 ${center ? 'text-center' : 'px-1'}`}>
          {title && (
            <h1 className="font-display text-[17px] font-semibold tracking-[-0.02em] truncate leading-tight">{title}</h1>
          )}
          {subtitle && <p className="text-[12px] muted truncate leading-tight mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">{right}</div>
      </div>
    </motion.header>
  )
}
