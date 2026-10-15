# From a model to a build plan

MOCsmith combines a browser-side conversion pipeline, editable part layout and shared assembly plan. This guide describes the implementation. Source comments document the rules close to the functions; [NOTICE](../NOTICE) records the projects and literature that informed them.

## Geometry and colour

GLB geometry is sampled into a regular grid. Horizontal cells use stud units; vertical cells use plate units. This makes the layout and contact rules operate in the same coordinates as the output parts. LDraw files enter as existing part assemblies rather than being voxelised again.

Surface colours are matched to the available palette. Paint-patch grouping reduces small shade changes across a surface. A colour cap removes colours according to surface error while protecting small details when alternatives remain. Optional lighting removal fits a low-order spherical-harmonic model to neighbouring surface samples; it is disabled by default because deliberate colour changes can resemble shading.

Implementation: [voxel sampling](../app/src/convert/voxelize.mjs), [paint patches](../app/src/convert/shades.mjs), [colour reduction](../app/src/convert/colours.mjs), [lighting removal](../app/src/convert/delight.mjs).

## Parts and connections

The layout covers the occupied grid with supported bricks and plates. Part-and-colour availability constrains the catalogue. Seam preferences favour overlapping joints rather than repeated vertical stacks. Repair passes try larger replacements across disconnected areas.

The editable model tracks cell ownership and part contacts. Stable slot identifiers let a proposed replacement update the affected cells and graph edges. A local connectivity search checks the changed region; full checks remain available where a local result cannot settle a tie. Part order stays deterministic when the final result is produced.

These are geometric connectivity rules. They do not model clutch strength, bending, tolerances or loads.

Implementation: [layout](../app/src/convert/layout.mjs), [repair](../app/src/convert/repair.mjs), [editable layout](../app/src/core/editable.mjs), [contact graph](../app/src/core/graph.mjs).

## Surface finishing

Slopes match an occupied-and-empty-cell profile against the grid. Eligible donor parts are replaced with a slope and refill plates of the same colour. The replacement is accepted only if it does not increase disconnected parts or components. Inverted profiles handle overhangs; an optional two-plate tolerance admits more ledges. Tiles and round parts have their own eligibility passes.

The slope-profile rule follows [legolization](https://github.com/hbmartin/legolization). MOCsmith implements candidate discovery, donor replacement and graph checks in its JavaScript layout structures. The legolization reference and its licence are retained in NOTICE. Repair is informed by [Brickify](https://github.com/ad-si/Brickify).

Implementation: [slopes](../app/src/convert/slopes.mjs), [round parts](../app/src/convert/round.mjs), [surface pipeline](../app/src/convert/build.mjs).

## Building steps

The forward planner adds parts to the assembly without removing earlier work. A part can press onto an existing support or attach from below. Placement checks try to avoid leaving an unplaced part blocked between completed neighbours. Nearby compatible additions grow into a step, with colour grouping and mirrored partners where possible. Chapter and subassembly passes organise the resulting sequence.

When no eligible placement is available, the planner records a forced step rather than dropping a part from the plan. Every part is assigned exactly once. A generated sequence may still need the builder's judgement, especially for fragile or disconnected designs.

A single plan supplies the interactive player, step cameras, LDraw step markers and PDF pages. Camera selection uses visibility of newly added parts and retains the previous view when it remains useful. This keeps sequencing separate from rendering and document layout.

Implementation: [forward planner](../app/src/steps/forward.mjs), [subassemblies](../app/src/steps/subs.mjs), [shared plan](../app/src/steps/plan.mjs), [step views](../app/src/book/shots.mjs).

## Photo mosaics and inventories

Photos are sampled into a stud grid. Colours are compared in perceptual spaces, with CIE76, CIEDE2000 and Oklab options. Floyd–Steinberg and Atkinson error diffusion are optional. Inventory assignment accounts for finite quantities and reports shortages; set inventory data is loaded in shards as needed.

The fixed-inventory mosaic and raised-mosaic ideas are informed by [lego-art-remix](https://github.com/debkbanerji/lego-art-remix). The implementation here uses its own colour-assignment order and tolerance rules. Optional 2.5D relief runs Depth Anything V2 Small through ONNX Runtime Web, then turns relative depth into plate layers beneath the visible surface. Depth is an estimate, rather than a recovered 3D model.

Implementation: [colour matching](../app/src/mosaic/colour.mjs), [quantisation and dithering](../app/src/mosaic/quantize.mjs), [inventory assignment](../app/src/mosaic/stock.mjs), [relief](../app/src/mosaic/relief.mjs), [inventory loading](../app/src/io/set-library.mjs).

## Validation

Node tests cover geometry, colour maths, ownership and graph edits, conversion passes, inventory conservation, step coverage, import/export and document layout. Browser tests check that primary controls remain reachable after opening a drawer and entering build mode across short, narrow and wide viewports.

Tests establish the properties they check. They do not certify physical builds or prove that a heuristic finds a globally optimal part layout. See [validation scope](STATUS.md).
