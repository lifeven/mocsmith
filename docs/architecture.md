# Architecture

The app is a static Vite site. Three.js renders the models; jsPDF produces instruction books. Conversion and optional depth inference run in Web Workers when available.

| Layer | Responsibility |
|---|---|
| `src/core`, `src/data` | Part catalogue, colours, grids, inventory, connectivity and editing rules |
| `src/convert` | Voxelisation, layout, repair and surface finishing |
| `src/steps` | Forward building sequence, chapters and subassemblies |
| `src/mosaic` | Image sampling, colour matching, inventory fitting and relief |
| `src/io` | GLB and LDraw input, LDraw and CSV output |
| `src/render`, `src/book` | Model views, step cameras and PDF pages |
| `src/runtime` | Worker messaging and depth inference |
| `src/session`, `src/ui` | In-memory history, controls, navigation and presentation |

The boundary tests restrict imports between layers. Pure conversion, layout and sequencing functions also run in Node tests. `convert/build.mjs` composes named stages, so a stage can be replaced without changing rendering or export code.

Part sizes use stud units horizontally and plate units vertically. Part numbers and colour references follow LDraw and Rebrickable data. The repository contains processed data used by the app; optional generation scripts read external raw caches. Credits and source links are preserved in NOTICE and the public third-party notices.

Model files and photos stay in browser memory. Editing is session-based. LDraw export preserves model parts and generated step markers, but is not a complete project snapshot.

## Surface finishing

The slope pass matches a part’s occupied and empty cells against the voxel shape, replaces eligible donor parts and refills leftover cells. Connectivity is checked before accepting a change. The implementation includes an optional two-plate tolerance and inverted slopes. Algorithm references are recorded in NOTICE.

## Routes

The app uses the History API for `/models/<sample>/`, `/model/`, `/mosaic/<sample>/`, `/mosaic/` and `/about/`. The build emits static entry pages for supported routes, so direct navigation works without a catch-all worker. Existing hash links are normalised on arrival. Unknown server paths remain 404s.
