type Signal = 'red' | 'green' | 'unknown'

export function createSignalHold(holdMs = 1500) {
  let held: Signal = 'unknown'
  let lastGreen = -Infinity
  let redSince: number | null = null
  return (next: Signal, now: number): Signal => {
    if (next === 'green') {
      held = 'green'
      lastGreen = now
      redSince = null
    } else if (next === 'red') {
      redSince ??= now
      // A half-second dark phase may look red. Require sustained red instead.
      if (now - redSince >= 800) held = 'red'
    } else {
      redSince = null
      if (held === 'red') held = 'unknown'
    }
    if (held === 'green' && now - lastGreen >= holdMs) held = 'unknown'
    return held
  }
}
