import { installDesktopShim } from './shim'
import { mountHostPanel } from './panel'
import { isEmbedded } from './embed-protocol'
const api = installDesktopShim()
// the app's own entry point, unchanged: it reads window.desktop, applies theme and language, mounts <App/>
import('../apps/docs/src/renderer/main.tsx').then(async () => {
  await import('./host.css')
  if (!isEmbedded()) mountHostPanel(api)
})
