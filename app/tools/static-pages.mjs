import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { SAMPLES } from '../src/data/samples.mjs';
import { MOSAIC_SAMPLES } from '../src/data/mosaic-samples.mjs';
import { modelPath, mosaicPath } from '../src/ui/navigation.mjs';

const messages = JSON.parse(await readFile(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
const directory = new URL('../dist/', import.meta.url);
const source = await readFile(new URL('index.html', directory), 'utf8');
const origin = 'https://mocsmith.lifeven.com';
const hasSharingImage = existsSync(new URL('social/mocsmith-desktop.jpg', directory));
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const homeDescription = 'Convert a 3D model into an editable brick design. Adjust parts and colours, follow building steps, and export PDF instructions or LDraw files. Free in your browser.';
const pages = [
  { path: '/', title: '3D model to brick converter | MOCsmith', description: homeDescription, heading: 'Turn a 3D model into a brick design', body: 'Bring a GLB model or an LDraw file, or start with a sample. Adjust the size, colours and individual parts, then follow the generated building steps and download a PDF instruction book.', links: Object.entries(SAMPLES).map(([key]) => [modelPath(key), messages[`sample.${key}.label`]]) },
  { path: '/about/', title: 'About MOCsmith | Privacy and credits', description: 'How MOCsmith converts models into brick designs, processes files in your browser, and credits its software, data and sample creators.', heading: 'About MOCsmith', body: 'MOCsmith is a browser-based brick design tool by LifeVen. Models and photos are processed on your device. The optional relief model is downloaded from Hugging Face; set names and inventories load from this site.' },
  { path: '/model/', title: 'Edit a brick model | MOCsmith', description: homeDescription, heading: 'Open your model in MOCsmith', body: 'Choose a local GLB, LDR or MPD file on the start page. Files and edit history stay in your current browser session.', noindex: true },
  { path: '/mosaic/', title: 'Photo to brick mosaic converter | MOCsmith', description: 'Turn a photo into a brick mosaic. Choose colours and base panels, fit the result to your parts, and export PDF instructions, LDraw and a parts list.', heading: 'Turn a photo into a brick mosaic', body: 'Choose a photo on the start page or try a bundled example. Adjust the size, crop, colours and surface parts. Export a PDF guide, LDraw model or CSV parts list.', links: Object.keys(MOSAIC_SAMPLES).map((key) => [mosaicPath(key), messages[`mosaicSample.${key}.label`]]) },
  ...Object.entries(SAMPLES).map(([key, sample]) => ({ path: modelPath(key), title: `${messages[`sample.${key}.label`]} brick model | MOCsmith`, heading: `${messages[`sample.${key}.label`]} brick model`, description: `Explore the ${messages[`sample.${key}.label`].toLowerCase()} sample as a brick design. Change its size and colours, edit parts, and export building instructions in MOCsmith.`, body: 'Open the sample in the interactive editor. Adjust the design, inspect connectivity, follow the automatic steps and export a PDF instruction book or LDraw file.', image: sample.thumb })),
  ...Object.entries(MOSAIC_SAMPLES).map(([key, sample]) => ({ path: mosaicPath(key), title: `${messages[`mosaicSample.${key}.label`]} brick mosaic | MOCsmith`, heading: `${messages[`mosaicSample.${key}.label`]} brick mosaic`, description: `Try the ${messages[`mosaicSample.${key}.label`]} mosaic in MOCsmith. Adjust colours, size, surface parts and base panels, then export a printable guide.`, body: 'Explore a real sample photo as a brick mosaic. Choose the size, colours, surface pieces and base panels, then export a PDF or LDraw model.', image: sample.preview })),
];

function metadata(page) {
  const url = origin + page.path;
  const image = `${origin}/social/mocsmith-desktop.jpg`;
  const schema = page.path === '/' ? { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'MOCsmith', url, description: homeDescription, applicationCategory: 'DesignApplication', operatingSystem: 'Web browser', inLanguage: ['en', 'zh-CN'], creator: { '@type': 'Organization', name: 'LifeVen LLC', url: 'https://www.lifeven.com/' }, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } } : { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, description: page.description, url, isPartOf: { '@type': 'WebSite', name: 'MOCsmith', url: origin + '/' } };
  return `<title>${escape(page.title)}</title>
  <meta name="description" content="${escape(page.description)}">
  <meta name="robots" content="${page.noindex ? 'noindex, follow' : 'index, follow'}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MOCsmith by LifeVen">
  <meta property="og:title" content="${escape(page.title)}">
  <meta property="og:description" content="${escape(page.description)}">
  <meta property="og:url" content="${url}">
  ${hasSharingImage ? `<meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="MOCsmith desktop editor with a brick model and building controls">` : ''}
  <meta name="twitter:card" content="${hasSharingImage ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escape(page.title)}">
  <meta name="twitter:description" content="${escape(page.description)}">
  ${hasSharingImage ? `<meta name="twitter:image" content="${image}">` : ''}
  <script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`;
}

for (const page of pages) {
  let html = source.replace(/<title[^>]*>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '');
  html = html.replace('</head>', metadata(page) + '\n</head>');
  const links = page.links?.map(([href, label]) => `<li><a href="${href}">${escape(label)}</a></li>`).join('') ?? '';
  const content = `<div class="start-inner"><h1 id="static-title">${escape(page.heading)}</h1><p class="lead">${escape(page.body)}</p>${page.image ? `<img src="${page.image}" width="480" alt="${escape(page.heading)}">` : ''}${links ? `<ul>${links}</ul>` : ''}<p><a href="/">Choose a model or photo</a> · <a href="/about/">About and credits</a></p><noscript>Enable JavaScript to use the editor. Your model and photo are processed in your browser.</noscript></div>`;
  html = html.replace(/(<section id="start"[^>]*>)[\s\S]*?(<\/section>)/, (_, start, end) => start.replace('aria-labelledby="start-title"', 'aria-labelledby="static-title"') + content + end);
  const path = page.path === '/' ? new URL('index.html', directory) : new URL(page.path.slice(1) + 'index.html', directory);
  await mkdir(new URL('./', path), { recursive: true });
  await writeFile(path, html);
}
await writeFile(new URL('sitemap.xml', directory), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.filter((p) => !p.noindex).map((p) => `<url><loc>${origin}${p.path}</loc></url>`).join('')}</urlset>\n`);
await writeFile(new URL('robots.txt', directory), `User-agent: *\nAllow: /\nDisallow: /*?*debug\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(new URL('404.html', directory), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | MOCsmith</title><body><main><h1>Page not found</h1><p>This address does not open a MOCsmith page.</p><a href="/">Open MOCsmith</a></main></body></html>`);
console.log(`Generated ${pages.length} clean routes, page metadata, sitemap, robots and a real 404.`);

// Repository documentation is excluded from the deployed static assets.
async function omitNotes(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await omitNotes(path);
    else if (entry.name.endsWith('.md')) await rm(path);
  }
}
await omitNotes(directory);
