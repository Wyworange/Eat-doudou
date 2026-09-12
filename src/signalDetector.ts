// Score individual light-shaped regions instead of total color area.
export function detectLight(pixels: Uint8ClampedArray, width: number, height: number): 'red' | 'green' | 'unknown' {
  const labels = new Uint8Array(width * height)
  for (let i = 0; i < labels.length; i++) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2]
    if (Math.max(r, g, b) < 120) continue
    if (r > g * 1.22 && r > b * 1.18) labels[i] = 1
    else if (g > r * 1.12 && g >= b * .75) labels[i] = 2
  }
  const scores = [0, 0, 0]
  const queue = new Int32Array(labels.length)
  for (let seed = 0; seed < labels.length; seed++) {
    const color = labels[seed]
    if (!color) continue
    let tail = 1, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, perimeter = 0
    let minX = width, maxX = 0, minY = height, maxY = 0
    queue[0] = seed
    labels[seed] = 0
    for (let head = 0; head < tail; head++) {
      const index = queue[head], x = index % width, y = Math.floor(index / width)
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) { perimeter++; continue }
        const ni = ny * width + nx
        // Recover color from pixels because labels are cleared on enqueue.
        const r = pixels[ni * 4], g = pixels[ni * 4 + 1], b = pixels[ni * 4 + 2]
        const same = Math.max(r, g, b) >= 120 && (color === 1
          ? r > g * 1.22 && r > b * 1.18 : g > r * 1.12 && g >= b * .75)
        if (!same) perimeter++
        if (labels[ni] === color) { labels[ni] = 0; queue[tail++] = ni }
      }
    }
    if (tail < 3) continue
    const vx = sxx / tail - (sx / tail) ** 2
    const vy = syy / tail - (sy / tail) ** 2
    const cov = sxy / tail - sx * sy / tail ** 2
    const delta = Math.sqrt((vx - vy) ** 2 + 4 * cov ** 2)
    const elongation = Math.sqrt((vx + vy + delta) / Math.max(.01, vx + vy - delta))
    const roundness = 4 * Math.PI * tail / (perimeter * perimeter)
    const fill = tail / ((maxX - minX + 1) * (maxY - minY + 1))
    // Camera bloom and tiny LEDs rarely form perfect circles. Shape is a soft
    // penalty; proximity to the user's selected light is the primary cue.
    const distance = Math.hypot((sx / tail - width / 2) / width,
      (sy / tail - height / 2) / height)
    const proximity = Math.exp(-distance * distance / .035)
    const shape = Math.max(.08, Math.min(1, roundness * 2))
      * Math.max(.1, 1 / Math.max(1, elongation)) * Math.max(.3, fill)
    const score = Math.sqrt(Math.min(tail, 250)) * shape * proximity
    scores[color] = Math.max(scores[color], score)
  }
  if (scores[1] > .025 && scores[1] > scores[2] * 1.3) return 'red'
  if (scores[2] > .025 && scores[2] > scores[1] * 1.3) return 'green'
  return 'unknown'
}
