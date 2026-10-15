# Browser application

Run npm commands in this directory using Node 24 LTS. Dependencies are pinned in `package-lock.json`.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on `127.0.0.1:5591` |
| `npm test` | Local conversion, editing, sequencing, mosaic and export tests |
| `npm run check` | Tests and production build |
| `npm run preview` | Preview `dist/` on `127.0.0.1:5592` |
| `npm run deploy:check` | Production build and Cloudflare dry-run |
| `npm run deploy:ci` | Deploy an already built `dist/` |

`public/samples/` contains converter inputs. `public/previews/` contains derived WebP display assets. Public credits are in About and the notice files; Markdown developer notes are omitted from the built site.

See [architecture](../docs/architecture.md), [deployment](../docs/PUBLICATION.md) and [credits](../docs/credits.md).
