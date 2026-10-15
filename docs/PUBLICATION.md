# Build and deployment

The app builds to static files in `app/dist/`. Cloudflare Workers Static Assets serves the result without an application backend.

```sh
cd app
npm ci
npm run check
npm run deploy:check
```

`deploy:check` builds the app and runs Wrangler in dry-run mode without uploading. A normal build uses the processed data and samples included in the repository. Optional data-generation tools require separately downloaded inputs; their source URLs and cache conventions are documented in the tools.

## Cloudflare configuration

The checked-in Worker name is `mocsmith` and the LifeVen deployment domain is `mocsmith.lifeven.com`. Forks should use their own Worker name and domain. Keep account credentials in Cloudflare or environment variables, never in the repository.

For Workers Builds, use repository directory `app`, Node 24, build command `npm run check` and deploy command `npm run deploy:ci`. Production should build from a reviewed revision of this source repository. Publish corresponding source for the exact application version served to users.

The build generates HTML entry pages for model samples, mosaics and About. Unknown addresses use `404-page` handling. Response headers are defined in `app/public/_headers`.

Before publishing, supply a desktop capture at `app/public/social/mocsmith-desktop.jpg` (1200 × 630); the build includes image metadata only when that file exists. Then verify notices and source access, and check the main workflows on desktop, tablet and phone. After publishing, verify HTTPS, direct-route refreshes, 404 responses, headers, conversion and exports. Record the deployed revision and validation scope.

Official references: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [static routing](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/).
