# Implementation and validation

MOCsmith implements browser-side GLB and LDraw import, brick conversion, part editing with undo and redo, automatic building steps, PDF/LDraw/CSV output, inventory fitting, photo mosaics and optional 2.5D relief. English and Chinese are supported.

Sample inputs and generated WebP previews are stored separately. Navigation uses clean paths and generated HTML entry pages. Unknown addresses have a 404 page. A reserved footer row carries the LifeVen credit at the bottom right. Short landscape windows reserve canvas space beside the controls and step panel.

## Local verification

- 300 Node tests pass, covering conversion, connectivity, edits, steps, mosaics, exports and data integrity.
- 24 Chromium browser checks pass across six viewport shapes in English and Chinese. They cover drawer transitions, primary-control access, canvas space, overflow and external photo requests.
- A production build and Cloudflare deployment dry-run pass. The build emits 44 route entries, structured metadata and a sitemap; the supplied desktop capture is used for sharing previews.
- Browser smoke checks exercise conversion, part selection, step navigation, set search, mosaics and actual PDF/LDraw/CSV downloads. Optional 2.5D inference also completes on the bundled Labrador photo; its only external requests are GET downloads from Hugging Face hosts. Product images and the step animation are captured from the running application; sources are in `media/provenance.json`.

The public app is live at https://mocsmith.lifeven.com/. Production verification compares all 44 entry pages, 17 JavaScript/CSS resources and the desktop sharing image with the local deployment artifact. Direct routes, 404 handling and security headers pass. Live Chromium checks cover model conversion, settings, step navigation, mosaics and a downloaded 63-page PDF. GitHub CI also passes.

The first release is built from the clean public application source and deployed with Wrangler. See [release evidence](releases/0.1.0.md). Physical-device Safari/Android compatibility and physical brick strength remain outside this validation.

## Current limits

Manual step sequencing, persistent project files, cloud sync, structural force certification and a connected image-to-3D service are not implemented. Some designs retain disconnected parts, which the interface highlights. Optional relief downloads its model on first use.
