/** About copy and public credits in English and Chinese; no user input is inserted here. */

const OWNER = { name: 'LifeVen LLC', credit: 'MOCsmith by LifeVen', year: 2026 };
/**
 * The source repository ("the original project" in NOTICE). Public access is
 * a publication prerequisite; see docs/PUBLICATION.md. The
 * licence line links it; an empty string drops the link.
 */
const SOURCE_URL = 'https://github.com/lifeven/mocsmith';

const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const SOURCE = SOURCE_URL ? ` (${a(SOURCE_URL, SOURCE_URL.replace(/^https:\/\//, ''))})` : '';

const FOX = a('https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox', 'Khronos glTF Sample Assets: Fox');
const KENNEY = a('https://kenney.nl/', 'Kenney');
const LDRAW = a('https://www.ldraw.org/', 'LDraw.org');
const REBRICKABLE = a('https://rebrickable.com/', 'Rebrickable');
const THREE = a('https://threejs.org/', 'three.js');
const JSPDF = a('https://github.com/parallax/jsPDF', 'jsPDF');
const NOTICES = a('/third-party-notices.txt', 'third-party-notices.txt');
const ORT = a('https://onnxruntime.ai/', 'ONNX Runtime Web');
const LUCIDE = a('https://lucide.dev/', 'Lucide');
const DEPTH = a('https://huggingface.co/depth-anything/Depth-Anything-V2-Small', 'Depth Anything V2 Small');
const PEARL = a('https://commons.wikimedia.org/wiki/File:1665_Girl_with_a_Pearl_Earring.jpg', 'Wikimedia Commons');
const STARRY = a('https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg', 'Wikimedia Commons');
const LABRADOR = a('https://commons.wikimedia.org/wiki/File:Portrait_of_a_labrador_retriever.jpg', 'Wikimedia Commons');
const WAVE = a('https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg', 'Wikimedia Commons');

const EN = `
<p>MOCsmith turns a 3D model into an editable brick design: which parts, in which colours, layer by layer. Change the size, recolour it, edit single parts, and download it as an <code>.ldr</code> file for Studio or LeoCAD, with a parts list.</p>
<h3>How it works</h3>
${ul([
  'The model is cut into small cells, matched to real LEGO colours, and covered with bricks and plates so that joints overlap.',
  'Repair passes try to join disconnected parts; any that remain disconnected are marked red.',
  'Slopes and smooth tiles go where the shape allows, and only parts that were really made in that colour are used.',
  'Conversion runs in your browser; processing time depends on the model and your device.',
  'A photo becomes a flat mosaic the same way: one round or square tile per stud, in the nearest colour LEGO really made it in, on LEGO Art panels or baseplates, with a page per base in the PDF. Near parts can optionally stand out on hidden plates (2.5D).',
])}
<h3>Private</h3>
<p>Everything is computed in your browser. Your model files, pictures and photos stay there and are never uploaded (the first time you turn on the mosaic's 2.5D option, your browser downloads a depth model from Hugging Face; your photo is not sent). Set names and inventories load from this site; no set photographs are requested. "I have a brick-style AI picture" is not connected to an image-to-3D service yet, so pictures cannot be uploaded there. No account, no ads, no tracking.</p>
<h3>Please note</h3>
${ul([
  'It checks that every part is joined to the model, but it does not calculate forces, so a model may still be weak in places.',
  'The software is provided as is, without warranty, to the extent permitted by applicable law.',
  'LEGO® is a trademark of the LEGO Group, which does not sponsor, authorise or endorse this site.',
])}
<h3>Data and credits</h3>
${ul([
  `Part numbers and colour values follow the ${LDRAW} parts library and its colour table LDConfig.ldr (the library is under CC BY 2.0 / CC BY 4.0).`,
  `Which parts were made in which colours, and what is in each LEGO set, comes from ${REBRICKABLE} data downloads.`,
  `3D drawing with ${THREE} (MIT License); the instruction book's PDF is made with ${JSPDF} (MIT License); icons from ${LUCIDE} (ISC License); built with Vite. Licence texts: ${NOTICES}.`,
  `The mosaic's 2.5D option works out near and far with the ${DEPTH} model (Lihe Yang et al., Apache 2.0), which your browser downloads from Hugging Face only when you turn it on, run by ${ORT} (MIT License).`,
])}
<h3>Sample models</h3>
${ul([
  `Fox: ${FOX}. Model by PixelMannen (CC0 1.0); rigging and animation by tomkranis and conversion to glTF by @AsoboStudio and @scurest (CC BY 4.0).`,
  `Coin block, little truck, little grove, fountain square and the five buildings: ${KENNEY} starter kits (CC0 1.0).`,
  `Cube animals, cars, food, hand cart, suburban houses, trees and planter: ${KENNEY} Cube Pets, Car Kit, Food Kit, Fantasy Town Kit and City Kit Suburban (CC0 1.0).`,
])}
<h3>Mosaic example pictures</h3>
${ul([
  `Labrador: photo by Dktue, CC0 1.0, from ${LABRADOR}.`,
  `The Great Wave off Kanagawa, Katsushika Hokusai, about 1830–32 (Metropolitan Museum of Art, New York): public domain, image from ${WAVE}.`,
  `Girl with a Pearl Earring, Johannes Vermeer, about 1665 (Mauritshuis, The Hague): public domain, image from ${PEARL}.`,
  `The Starry Night, Vincent van Gogh, 1889 (Museum of Modern Art, New York): public domain, image from ${STARRY} (Google Arts &amp; Culture).`,
])}
<h3>Copyright and licence</h3>
${ul([
  `© ${OWNER.year} ${OWNER.name}.`,
  `The code is under the GNU AGPL-3.0, with one added term: a version that others use, including a copy run as a website, keeps “Based on MOCsmith by LifeVen LLC” and a link to the original on its About page. Project documentation and original artwork are under CC BY 4.0; third-party samples keep their own licences. The full terms are in LICENSE and NOTICE in the source code${SOURCE}.`,
  'If you publish a changed version, please give it another name: the names MOCsmith and 积木匠 are not covered by the licence.',
  'The third-party material listed above keeps its own licence. You retain your rights to your own files; exported designs remain subject to any rights in the input materials.',
  `When you share screenshots or recordings, please credit “${OWNER.credit}” and link to this page.`,
])}`;

const ZH = `
<p>积木匠（MOCsmith）把一个 3D 模型变成可编辑的积木设计：用哪些零件、什么颜色、一层一层怎么搭。可以换大小、改颜色、一块一块改零件，再下载成 Studio、LeoCAD 能打开的 <code>.ldr</code> 文件和零件清单。</p>
<h3>怎么做的</h3>
${ul([
  '把模型切成小格子，换成真实存在的乐高颜色，再用砖和薄板铺满，让接缝错开。',
  '尝试把不连通的零件接回主体；仍未接上的零件标成红色。',
  '形状合适的地方换成斜面砖和光面板，而且只用这种颜色真的生产过的零件。',
  '转换在你的浏览器内进行，处理时间取决于模型复杂度和设备。',
  '照片拼平面画也是这样：每颗凸点放一块圆形或方形的小零件，用这种零件真的生产过的最接近的颜色，铺在 LEGO Art 底板或大底板上，PDF 里每块底板一页；还可以按远近把近处用藏在下面的薄板垫高（2.5D）。',
])}
<h3>隐私</h3>
<p>所有计算都在你的浏览器里完成，模型文件、图片和照片只留在浏览器里，不会上传（第一次勾上拼画的「立体（2.5D）」时，浏览器会从 Hugging Face 下载一个深度模型；照片不会发出去）。套装名称和库存数据从本站加载，不请求套装照片。「我有积木风格的 AI 图片」还没接上图转 3D 的服务，现在不能上传图片。不用注册，没有广告，不追踪。</p>
<h3>请注意</h3>
${ul([
  '它会检查每块零件都接在模型上，但不计算受力，搭出来有的地方可能不够结实。',
  '软件按现状提供，在适用法律允许的范围内不作担保。',
  'LEGO® 是乐高集团的商标，乐高集团没有赞助、授权或认可本网站。',
])}
<h3>数据和署名</h3>
${ul([
  `零件编号和颜色值按 ${LDRAW} 的零件库和它的色表 LDConfig.ldr（零件库按 CC BY 2.0 / CC BY 4.0 许可）。`,
  `哪些零件生产过哪些颜色、每个套装里有什么，来自 ${REBRICKABLE} 的公开数据下载。`,
  `3D 显示用 ${THREE}（MIT 许可），搭建说明书的 PDF 用 ${JSPDF} 生成（MIT 许可），图标来自 ${LUCIDE}（ISC 许可），用 Vite 打包。许可全文见 ${NOTICES}。`,
  `平面拼画的「立体（2.5D）」用 ${DEPTH} 模型（Lihe Yang 等，Apache 2.0）判断远近，只在你勾上时由浏览器从 Hugging Face 下载，用 ${ORT}（MIT 许可）运行。`,
])}
<h3>示例模型</h3>
${ul([
  `狐狸：${FOX}。模型作者 PixelMannen（CC0 1.0）；骨骼与动画 tomkranis，转成 glTF：@AsoboStudio、@scurest（CC BY 4.0）。`,
  `金币方块、小卡车、小树林、喷泉广场和五栋房子：${KENNEY} 的 Starter Kit（CC0 1.0）。`,
  `方块动物、车、食物、小推车、郊区房子、树和花坛：${KENNEY} 的 Cube Pets、Car Kit、Food Kit、Fantasy Town Kit、City Kit Suburban（CC0 1.0）。`,
])}
<h3>平面拼画的示例图片</h3>
${ul([
  `拉布拉多：照片作者 Dktue，CC0 1.0，来自 ${LABRADOR}。`,
  `《神奈川冲浪里》，葛饰北斋（Katsushika Hokusai），约 1830–1832 年（纽约大都会艺术博物馆）：公有领域，图片来自 ${WAVE}。`,
  `《戴珍珠耳环的少女》，维米尔（Johannes Vermeer），约 1665 年（海牙莫瑞泰斯皇家美术馆）：公有领域，图片来自 ${PEARL}。`,
  `《星月夜》，梵高（Vincent van Gogh），1889 年（纽约现代艺术博物馆）：公有领域，图片来自 ${STARRY}（Google Arts &amp; Culture）。`,
])}
<h3>版权和许可</h3>
${ul([
  `© ${OWNER.year} ${OWNER.name}。`,
  `代码按 GNU AGPL-3.0 许可，另加一条：别人用的版本（包括放到网上运行的副本）要在「关于」页保留「Based on MOCsmith by LifeVen LLC」和指向原项目的链接。项目文档和原创图片按 CC BY 4.0 许可，第三方示例材料保留原有许可。完整条款见源码里的 LICENSE 和 NOTICE${SOURCE}。`,
  '改过的版本如果要发布，请换一个名字：「积木匠」「MOCsmith」这两个名字不在许可范围内。',
  '上面列出的第三方材料按各自的许可。你保留对自己文件的权利；导出作品仍受输入素材相关权利的约束。',
  `分享截图或录屏时，请注明「${OWNER.credit}」并附上本页链接。`,
])}`;

/** About page HTML for a locale id ('zh-CN' or 'en'). */
export const aboutHtml = (locale) => (locale.startsWith('zh') ? ZH : EN);
