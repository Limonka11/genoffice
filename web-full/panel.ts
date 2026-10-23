// A small host panel (bottom left): pick a sample form, open a .docx from disk, download the last save.
export function mountHostPanel(api: { openSample: (n: string) => void; openFile: () => Promise<void>; downloadLastSave: () => void; lastSave: { name: string; bytes: Uint8Array | null } }) {
  const panel = document.createElement('div'); panel.className = 'host-panel'
  panel.innerHTML = `
    <strong>Vound host</strong>
    <select class="host-samples"><option value="">Sample form…</option></select>
    <button class="host-open">Open .docx…</button>
    <button class="host-download" disabled>Download last save</button>
    <span class="host-hint">Save with ⌘S, or File › Save As. Every save downloads the .docx and lands in the server folder.</span>`
  document.body.appendChild(panel)
  const select = panel.querySelector<HTMLSelectElement>('.host-samples')!
  fetch('/samples/index.txt').then((r) => r.text()).then((t) => {
    for (const name of t.split('\n').filter(Boolean)) { const o = document.createElement('option'); o.value = name; o.textContent = name; select.appendChild(o) }
  })
  select.onchange = () => { if (select.value) api.openSample(select.value) }
  panel.querySelector<HTMLButtonElement>('.host-open')!.onclick = () => void api.openFile()
  const dl = panel.querySelector<HTMLButtonElement>('.host-download')!
  dl.onclick = () => api.downloadLastSave()
  setInterval(() => { dl.disabled = !api.lastSave.bytes; if (api.lastSave.bytes) dl.textContent = `Download last save (${api.lastSave.name})` }, 800)
}
