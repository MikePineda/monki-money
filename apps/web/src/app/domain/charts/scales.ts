/**
 * Scales and tick math. Pure: thin, typed wrappers over d3-scale so the
 * components never touch d3 directly and the rules (clean money steps, at
 * most N intervals) live in one tested place.
 */
import { scaleBand, scaleLinear, scalePoint } from 'd3-scale'

export interface NiceTicks {
  /** Bottom of the nice domain (a tick). */
  min: number
  /** Top of the nice domain (a tick). */
  max: number
  step: number
  values: number[]
}

/** Step multipliers: 1, 2 and 5 times a power of ten read as round money. */
const STEP_FACTORS = [1, 2, 5] as const

/**
 * Clean ticks covering [min, max] with at most `maxIntervals` intervals.
 * Steps are 1, 2 or 5 times a power of ten and never smaller than
 * `minStep` (100 cents: axis ticks are whole dollars). The domain always
 * starts and ends on a tick, so the top gridline is the top of the plot.
 */
export function niceTicks(min: number, max: number, maxIntervals = 3, minStep = 100): NiceTicks {
  // A non-finite bound (no data, a bad value) must not spin the step search.
  const low = Math.min(finiteOrZero(min), finiteOrZero(max))
  const high = Math.max(finiteOrZero(min), finiteOrZero(max))
  const intervals = Math.max(1, Math.floor(maxIntervals))
  for (let power = minStep; ; power *= 10) {
    for (const factor of STEP_FACTORS) {
      const step = power * factor
      const start = Math.floor(low / step) * step
      let end = Math.ceil(high / step) * step
      if (end === start) {
        end = start + step
      }
      if ((end - start) / step <= intervals) {
        const values: number[] = []
        for (let value = start; value <= end; value += step) {
          values.push(value)
        }
        return { min: start, max: end, step, values }
      }
    }
  }
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export type LinearScale = (value: number) => number

/** Maps a value domain onto a pixel range (pass [bottom, top] to invert y). */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number]
): LinearScale {
  const scale = scaleLinear().domain([domain[0], domain[1]]).range([range[0], range[1]])
  return (value: number) => scale(value)
}

export interface BandScale {
  /** Left edge of a key's band, or undefined for an unknown key. */
  position(key: string): number | undefined
  bandwidth: number
  step: number
}

export interface BandOptions {
  /** Share of each step left empty between bands (0 to 1). */
  paddingInner?: number
  paddingOuter?: number
}

/** Equal bands for categories (hit areas, columns). */
export function bandScale(
  keys: readonly string[],
  range: readonly [number, number],
  options: BandOptions = {}
): BandScale {
  const scale = scaleBand<string>()
    .domain(keys)
    .range([range[0], range[1]])
    .paddingInner(options.paddingInner ?? 0)
    .paddingOuter(options.paddingOuter ?? 0)
  return {
    position: (key: string) => scale(key),
    bandwidth: scale.bandwidth(),
    step: scale.step(),
  }
}

/**
 * Evenly spaced positions for `count` ordered points from edge to edge; a
 * single point sits in the middle.
 */
export function pointPositions(count: number, range: readonly [number, number]): number[] {
  if (count <= 0) {
    return []
  }
  const keys = Array.from({ length: count }, (_, index) => String(index))
  const scale = scalePoint<string>().domain(keys).range([range[0], range[1]]).align(0.5)
  return keys.map((key) => scale(key) ?? range[0])
}
