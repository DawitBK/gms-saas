/**
 * Builds the `conic-gradient` colour-stop list for the status-distribution
 * donut shown on the dashboards and report pages.
 *
 * This existed six times over — admin/dashboard/host/host-reports/
 * reception-reports and OperationsDashboard each carried a byte-identical copy
 * differing only in the palette. Each copy also reassigned a `let offset`
 * accumulator inside a `.map()` running in a useMemo, which React Compiler
 * rejects (react-hooks/immutability: "Cannot reassign variable after render
 * completes"): a callback that mutates a variable captured from the render
 * scope produces a different result depending on when it runs. Accumulating
 * through `reduce` has no such variable.
 */
export const PIE_STOP_COLORS = [
  '#22d3ee',
  '#818cf8',
  '#34d399',
  '#f59e0b',
  '#f43f5e',
  '#64748b',
] as const;

export function buildPieStops(
  slices: readonly { percent: number }[],
  colors: readonly string[] = PIE_STOP_COLORS,
): string {
  return slices
    .reduce<{ offset: number; segments: string[] }>(
      ({ offset, segments }, item, index) => {
        const next = offset + item.percent;
        return {
          offset: next,
          segments: [...segments, `${colors[index % colors.length]} ${offset}% ${next}%`],
        };
      },
      { offset: 0, segments: [] },
    )
    .segments.join(', ');
}
