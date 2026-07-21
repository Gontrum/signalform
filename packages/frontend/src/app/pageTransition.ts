// Derives the Vue <Transition> name for route navigation, mimicking iOS's
// push/pop navigation-stack animations based on route "depth" (see the
// `depth` meta on each route in `src/router/index.ts`).
//
// - Navigating to a deeper screen (e.g. home -> now-playing) pushes: the new
//   screen slides in from the right.
// - Navigating back to a shallower screen pops: the new screen slides in
//   from the left.
// - Navigating between screens at the same depth (e.g. switching top-level
//   tabs) does not animate — iOS does not animate tab switches either.
// - If either depth is unknown, no transition is applied.
export const getTransitionName = (
  fromDepth: number | undefined,
  toDepth: number | undefined,
): string => {
  if (fromDepth === undefined || toDepth === undefined) return ''
  if (toDepth > fromDepth) return 'push'
  if (toDepth < fromDepth) return 'pop'
  return ''
}
