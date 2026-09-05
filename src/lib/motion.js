/** Shared motion vocabulary so every screen feels like one product. */

export const spring = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 }
export const snappy = { type: 'spring', stiffness: 620, damping: 42 }
export const ease = [0.22, 1, 0.36, 1]

export const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.38, ease },
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.3, ease },
}

export const listStagger = (stagger = 0.045) => ({
  animate: { transition: { staggerChildren: stagger, delayChildren: 0.04 } },
})

export const listItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.34, ease } },
}

/** Directional page transitions: forward pushes left, back pushes right. */
export const pageVariants = {
  initial: (dir) => ({ opacity: 0, x: dir >= 0 ? 26 : -26 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.32, ease } },
  exit: (dir) => ({ opacity: 0, x: dir >= 0 ? -22 : 22, transition: { duration: 0.24, ease } }),
}

export const sheetVariants = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { type: 'spring', stiffness: 380, damping: 40 } },
  exit: { y: '100%', transition: { duration: 0.22, ease } },
}

export const tapScale = { whileTap: { scale: 0.965 } }
