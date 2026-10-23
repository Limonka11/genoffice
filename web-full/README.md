# GenOffice Docs as an embeddable web editor (Vound fork)

`web-full/` hosts the Docs app's complete renderer (`apps/docs/src/renderer/main.tsx`, unchanged) in a
plain web page. `shim.ts` stands in for the Electron bridge (`window.desktop`), `boot.ts` installs it and
loads the app, `host.css` and two transforms in `vite.config.ts` adjust the app for use as a viewer:

- header/footer strips take the document's base font (upstream rule only covered the body);
- header/footer strips are not dimmed;
- break-only spacer paragraphs are one line, not two (`.doc-br-line` inline);
- the host decides editability; a document's own `w:documentProtection` lock is not enforced.

Engine change in `packages/docx-engine/src/text-patch.ts` (`patchFieldParagraphText`, called from
`generate.ts` and `patch.ts`): a text edit inside a legacy form field or a content control patches
the `w:t` of the original paragraph and keeps the field machinery. Test:
`packages/docx-engine/tests/field-paragraph-text-patch.test.ts`.

## Build

```sh
npm ci --ignore-scripts        # repo root, Node 22+
npm run build:web-host         # -> web-full/dist (static, relative asset paths, ~22 MB with fonts)
```

## Embed

Serve `web-full/dist` under any path of the host's own origin and put it in an iframe. The contract
is `embed-protocol.ts`:

| direction | message |
|---|---|
| host → editor | `{ type: 'vound:open', name, bytes: ArrayBuffer }` open a document (transfer the buffer) |
| host → editor | `{ type: 'vound:command', command: 'save' }` save now, the same path as ⌘S |
| editor → host | `{ type: 'vound:ready' }` after the editor subscribed to open requests |
| editor → host | `{ type: 'vound:saved', name, bytes: ArrayBuffer }` on every save (⌘S, File › Save, the save command) |
| editor → host | `{ type: 'vound:dirty', dirty: boolean }` when unsaved changes appear or a save clears them |
| editor → host | `{ type: 'vound:error', message }` open or save failed |

Host and editor must share one origin. The editor accepts a message only when `event.origin` is its
own origin and `event.source` is `window.parent` (`embedMessages.ts`), reads it structurally and drops
anything else; it posts with `targetOrigin = window.location.origin`. The host should do the same in
reverse: accept only `frame.contentWindow` on its own origin, post with `location.origin`, never `'*'`.

`vound:dirty` comes from the app's own unsaved-changes state (`isDocDirty`, the one the close guard and
autosave read). The `hostReportsDirty` transform in `vite.config.ts` hands it to the shim after every
render, and the shim posts only when the value changed. Opening a document starts clean; a save that
completes reports `dirty: false`.

`embed-example.html` is a working host page. The editor never persists anything itself when embedded;
the host receives the bytes and stores them. Only explicit saves reach the host (⌘S, File › Save, the
`save` command): an auto save (`saveDocx(path, data, auto = true)`) posts nothing and leaves the document
unsaved (`embeddedSave.ts`), because every `vound:saved` becomes a published revision.

Embedded, `boot.ts` sets `html.vound-embedded` and `host.css` hides the Genspark AI dock, the ribbon's
AI commands (the Genspark AI group, Editor, Translate, AI Resolve Comments, AI Revision Summary) and the
AutoSave toggle; the page area takes the full width.

## Develop

```sh
npx vite --config web-full/vite.config.ts    # http://localhost:5201 (standalone mode with a sample panel)
```

Standalone mode serves `web-full/samples/*.docx` (gitignored), answers `fontMetrics` from this
machine's installed fonts through `@genoffice/font-metrics` (the dev-only `/__font-metrics` endpoint)
and writes saves to `GENOFFICE_SAVE_DIR`.

## Font metrics

The production build has no font provider: `shim.ts` leaves `window.desktop.fontMetrics` undefined
outside dev, and the renderer (`apps/docs/src/renderer/font-resolve.ts`) treats that as having no
installed-font index. It then lays out from the data it bundles anyway, `word-faces.json`: the macOS
snapshot (`system`) where Word for Mac uses the installed copy, Word's own face table (`faces`) for
everything else. The editor therefore measures text as Word for Mac does on a stock Mac, the same for
every reader. Times New Roman comes from the macOS copy (line factor 1.1499; Word's own copy is
1.1074); Arial, Calibri, Cambria and Verdana from Word's table.
`__tests__/fontResolution.test.ts` pins these answers.

The dev server answers from the machine's own fonts instead. On a Mac without Office that comes out
close to the snapshot; on another machine it may not.
