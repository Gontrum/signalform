import { onScopeDispose } from 'vue'

/**
 * Pins the app shell to the real viewport height on iOS standalone PWAs.
 *
 * In standalone mode iOS reports too short a height to CSS length units
 * (`height: 100%`, `100dvh`, `position: fixed; inset: 0`), which leaves an
 * empty strip below the bottom nav where Safari's toolbar would sit in the
 * browser. `window.innerHeight`, however, is reported correctly as the full
 * physical screen height. We measure it in JS and expose it as the
 * `--app-height` custom property so the shell can size itself against the real
 * viewport, refreshed on `resize` and `orientationchange`.
 */
export const useViewportHeight = (): void => {
  const update = (): void => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
  }

  update()

  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)

  onScopeDispose(() => {
    window.removeEventListener('resize', update)
    window.removeEventListener('orientationchange', update)
  })
}
