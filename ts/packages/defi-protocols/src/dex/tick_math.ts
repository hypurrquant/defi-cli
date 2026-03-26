/**
 * Convert a ±percentage to tick delta.
 * tickDelta = ln(1 + pct/100) / ln(1.0001)
 */
export function pctToTickDelta(pct: number): number {
  return Math.round(Math.log(1 + pct / 100) / Math.log(1.0001));
}

/**
 * Align a tick down to the nearest multiple of tickSpacing.
 */
export function alignTickDown(tick: number, tickSpacing: number): number {
  return Math.floor(tick / tickSpacing) * tickSpacing;
}

/**
 * Align a tick up to the nearest multiple of tickSpacing.
 */
export function alignTickUp(tick: number, tickSpacing: number): number {
  return Math.ceil(tick / tickSpacing) * tickSpacing;
}

/**
 * Calculate ±pct% tick range centered on currentTick, aligned to tickSpacing.
 */
export function rangeToTicks(
  currentTick: number,
  rangePct: number,
  tickSpacing: number,
): { tickLower: number; tickUpper: number } {
  const delta = pctToTickDelta(rangePct);
  return {
    tickLower: alignTickDown(currentTick - delta, tickSpacing),
    tickUpper: alignTickUp(currentTick + delta, tickSpacing),
  };
}
