import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTheme } from '../../lib/ThemeContext'
import { usePerf } from '../../lib/PerfContext'

/**
 * Animated splash.
 *
 * Sequence:
 *   1. logo draws itself on (SVG trim-path: pathLength 0 -> 1)
 *   2. "Leenk" + tagline fade up with a stagger
 *   3. a circular mask scales out from the centre, revealing the app
 *
 * The wipe is a real CSS `clip-path: circle()` on the splash layer, not an
 * expanding div. That way the app underneath is revealed through the hole
 * rather than being covered by something — no double-paint, and it composites
 * on the GPU so it stays smooth on cheap phones.
 *
 * Palette follows the active theme (dark #050506 / light #ffffff) so there's
 * no white flash before a dark-theme app appears.
 *
 * Respects reduced motion / low-end devices: those get a short fade instead
 * of the full sequence, never a broken half-animation.
 */

const HEART = 'M46 84C29 72 20 61 20 50a16 16 0 0 1 26-12 16 16 0 0 1 26 12c0 11-9 22-26 34Z'

export default function Splash({ onDone, minDuration = 2100 }) {
  const { theme } = useTheme()
  const { flags } = usePerf()
  const [phase, setPhase] = useState('draw')   // draw -> reveal -> gone
  const full = flags.springy                   // false = reduced motion / low-end

  const dark = theme === 'dark'
  const bg = dark ? '#050506' : '#ffffff'
  const tagline = dark ? 'rgba(255,255,255,0.62)' : 'rgba(18,18,21,0.55)'

  useEffect(() => {
    const hold = full ? minDuration : 650
    const t = setTimeout(() => setPhase('reveal'), hold)
    return () => clearTimeout(t)
  }, [full, minDuration])

  // Fires after the wipe finishes so the parent can unmount us.
  const finish = () => { setPhase('gone'); onDone?.() }

  const draw = {
    initial: { pathLength: 0, opacity: 0 },
    animate: (i) => ({
      pathLength: 1,
      opacity: 1,
      transition: {
        pathLength: { duration: 1.0, delay: 0.15 + i * 0.22, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.18, delay: 0.15 + i * 0.22 },
      },
    }),
  }

  // Text waits for the mark to finish drawing.
  const textStagger = {
    animate: { transition: { staggerChildren: 0.09, delayChildren: full ? 1.35 : 0 } },
  }
  const textItem = {
    initial: { opacity: 0, y: 14, filter: 'blur(6px)' },
    animate: {
      opacity: 1, y: 0, filter: 'blur(0px)',
      transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] },
    },
  }

  return (
    <AnimatePresence>
      {phase !== 'gone' && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[100] grid place-items-center"
          style={{ background: bg }}
          initial={full ? { clipPath: 'circle(150% at 50% 50%)' } : { opacity: 1 }}
          animate={
            phase === 'reveal'
              ? full
                // Shrink the visible disc to nothing -> app shows through.
                ? { clipPath: 'circle(0% at 50% 50%)' }
                : { opacity: 0 }
              : full
                ? { clipPath: 'circle(150% at 50% 50%)' }
                : { opacity: 1 }
          }
          transition={
            phase === 'reveal'
              ? { duration: full ? 0.86 : 0.3, ease: [0.65, 0, 0.35, 1] }
              : { duration: 0 }
          }
          onAnimationComplete={() => { if (phase === 'reveal') finish() }}
        >
          {/* The whole lockup lifts and scales slightly as the wipe starts,
              so the reveal feels like the app rushing forward. */}
          <motion.div
            className="flex flex-col items-center"
            animate={phase === 'reveal' && full ? { scale: 1.12, opacity: 0 } : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
          >
            <svg width={104} height={104} viewBox="0 0 128 128" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="spA" x1="10" y1="10" x2="118" y2="118" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff8fab" />
                  <stop offset="0.55" stopColor="#fb3f6d" />
                  <stop offset="1" stopColor="#c31048" />
                </linearGradient>
                <linearGradient id="spB" x1="118" y1="10" x2="10" y2="118" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ffb3c6" />
                  <stop offset="0.5" stopColor="#ff5c85" />
                  <stop offset="1" stopColor="#e81f57" />
                </linearGradient>
                <mask id="spCut">
                  <rect width="128" height="128" fill="#fff" />
                  <circle cx="64" cy="49" r="12.5" fill="#000" />
                </mask>
              </defs>

              <g transform="rotate(-38 64 64)">
                <motion.path
                  d={HEART}
                  transform="translate(18 -6)"
                  stroke="url(#spA)"
                  strokeWidth="11"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  variants={full ? draw : undefined}
                  initial={full ? 'initial' : false}
                  animate={full ? 'animate' : false}
                  custom={0}
                />
              </g>
              <g transform="rotate(142 64 64)" mask="url(#spCut)">
                <motion.path
                  d={HEART}
                  transform="translate(18 -6)"
                  stroke="url(#spB)"
                  strokeWidth="11"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  variants={full ? draw : undefined}
                  initial={full ? 'initial' : false}
                  animate={full ? 'animate' : false}
                  custom={1}
                />
              </g>
            </svg>

            <motion.div
              variants={textStagger}
              initial="initial"
              animate="animate"
              className="flex flex-col items-center mt-5"
            >
              <motion.span
                variants={textItem}
                className="font-display font-semibold tracking-[-0.035em] brand-text"
                style={{ fontSize: 40, lineHeight: 1 }}
              >
                Leenk
              </motion.span>
              <motion.span
                variants={textItem}
                className="text-[13.5px] mt-2.5 tracking-[0.01em]"
                style={{ color: tagline }}
              >
                Your campus, connected
              </motion.span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
