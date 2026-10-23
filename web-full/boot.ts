import { installDesktopShim } from './shim'
import { mountHostPanel } from './panel'
import { isEmbedded } from './embed-protocol'
const api = installDesktopShim()
// host.css hides the parts of the app an embedding host does not offer (the AI panel, AutoSave)
if (isEmbedded()) document.documentElement.classList.add('vound-embedded')
// the app's own entry point, unchanged: it reads window.desktop, applies theme and language, mounts <App/>
import('../apps/docs/src/renderer/main.tsx').then(async () => {
  await import('./host.css')
  if (!isEmbedded()) mountHostPanel(api)
})
