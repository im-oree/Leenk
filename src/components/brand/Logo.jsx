import { motion } from 'framer-motion'
import { usePerf } from '../../lib/PerfContext'

/**
 * Leenk mark — two interlocking hearts forming a chain link.
 * `animated` draws the two links on, then settles.
 */
export function LogoMark({ size = 40, animated = false, className = '' }) {
  const { flags } = usePerf()
  const play = animated && flags.springy

  const heart =
    'M46 84C29 72 20 61 20 50a16 16 0 0 1 26-12 16 16 0 0 1 26 12c0 11-9 22-26 34Z'

  const draw = {
    initial: { pathLength: 0, opacity: 0 },
    animate: (i) => ({
      pathLength: 1,
      opacity: 1,
      transition: { pathLength: { duration: 0.9, delay: i * 0.18, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.2, delay: i * 0.18 } },
    }),
  }

  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lkA" x1="10" y1="10" x2="118" y2="118" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff8fab" />
          <stop offset="0.55" stopColor="#fb3f6d" />
          <stop offset="1" stopColor="#c31048" />
        </linearGradient>
        <linearGradient id="lkB" x1="118" y1="10" x2="10" y2="118" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffb3c6" />
          <stop offset="0.5" stopColor="#ff5c85" />
          <stop offset="1" stopColor="#e81f57" />
        </linearGradient>
        <mask id="lkCut">
          <rect width="128" height="128" fill="#fff" />
          <circle cx="64" cy="49" r="12.5" fill="#000" />
        </mask>
      </defs>

      <g transform="rotate(-38 64 64)">
        <motion.path
          d={heart}
          transform="translate(18 -6)"
          stroke="url(#lkA)"
          strokeWidth="11"
          strokeLinejoin="round"
          strokeLinecap="round"
          variants={play ? draw : undefined}
          initial={play ? 'initial' : false}
          animate={play ? 'animate' : false}
          custom={0}
        />
      </g>
      <g transform="rotate(142 64 64)" mask="url(#lkCut)">
        <motion.path
          d={heart}
          transform="translate(18 -6)"
          stroke="url(#lkB)"
          strokeWidth="11"
          strokeLinejoin="round"
          strokeLinecap="round"
          variants={play ? draw : undefined}
          initial={play ? 'initial' : false}
          animate={play ? 'animate' : false}
          custom={1}
        />
      </g>
    </svg>
  )
}

export function Wordmark({ size = 28, animated = false, showMark = true, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showMark && <LogoMark size={size * 1.28} animated={animated} />}
      <span
        className="font-display font-600 tracking-[-0.03em] brand-text"
        style={{ fontSize: size, fontWeight: 600, lineHeight: 1 }}
      >
        Leenk
      </span>
    </div>
  )
}
