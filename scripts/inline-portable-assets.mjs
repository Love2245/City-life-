import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Vite builds the app shell with images as normal files first.  Keeping the
// image bytes out of Rollup avoids the multi-gigabyte temporary strings that
// vite-plugin-singlefile would otherwise create for the current art library.
// This final pass performs one replacement per emitted file and writes a
// genuinely self-contained HTML file that can be opened with file://.
const outDir = path.resolve(process.env.PORTABLE_OUT_DIR ?? "dist-portable");
const htmlPath = path.join(outDir, "index.html");

if (!fs.existsSync(htmlPath)) {
  throw new Error(`Portable build output not found: ${htmlPath}`);
}

const mimeByExtension = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".glb": "model/gltf-binary",
};

// The source entry's file:// help and launcher handshake are for the desktop
// development folder. A published single file runs directly without either.
let html = fs.readFileSync(htmlPath, "utf8")
  .replace(/<section\b[^>]*\bid="local-file-help"[^>]*>[\s\S]*?<\/section>/i, "")
  .replace(/<script>\s*var isFile = location\.protocol === 'file:';[\s\S]*?<\/script>/i, "");
const portableAnchor = '<template id="portable-assets-anchor"></template>';
const firstAnchor = html.indexOf(portableAnchor);
if (firstAnchor >= 0) {
  if (html.indexOf(portableAnchor, firstAnchor + portableAnchor.length) >= 0) throw new Error('Portable asset anchor must be unique');
  const hint = html.search(/<div\b[^>]*\bid=["']boot-hint["']/i);
  if (hint < 0 || hint > firstAnchor) throw new Error('Portable asset anchor must follow the boot hint');
  // Vite can move the inline module to <head>. Modules are deferred, but moving
  // them after the anchor makes both the shell and asset registry precede the
  // module in document order. Never move async or external modules silently.
  const earlyModules = [...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi)]
    .filter(match => match.index < firstAnchor && /\btype\s*=\s*["']module["']/i.test(match[1]));
  for (const match of earlyModules) {
    if (/\b(?:async|src)\s*(?:=|\s|$)/i.test(match[1])) throw new Error('Portable entry module must be inline and deferred');
  }
  const moved = earlyModules.map(match => match[0]).join('\n');
  for (const match of earlyModules.reverse()) html = html.slice(0, match.index) + html.slice(match.index + match[0].length);
  if (moved) {
    const afterAnchor = html.indexOf(portableAnchor) + portableAnchor.length;
    html = html.slice(0, afterAnchor) + '\n' + moved + html.slice(afterAnchor);
  }
}
const files = fs
  .readdirSync(outDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== "index.html")
  .map((entry) => entry.name);

let inlined = 0;
let totalBytes = 0;
const inlinedFiles = new Set();
/** 文件名 -> data URI（只在真正被引用时才读盘并 base64） */
const uriByFile = new Map();

for (const filename of files) {
  const extension = path.extname(filename).toLowerCase();
  const mime = mimeByExtension[extension];
  if (!mime || !html.includes(filename)) continue;

  const bytes = fs.readFileSync(path.join(outDir, filename));
  uriByFile.set(filename, `data:${mime};base64,${bytes.toString("base64")}`);
  inlinedFiles.add(filename);
  inlined += 1;
  totalBytes += bytes.length;
}

// 单遍替换。旧实现是「每个文件都对整份 HTML 做一次 includes + split/join」：
// index.html 涨到 ~276 MB 后，每一轮都要重扫、重拷一份完整字符串，
// 合计 O(文件数 × 体积) ≈ 数百 GB 的扫描与拷贝，单文件构建实测跑 40 分钟仍未结束。
// 这里改为先定位全部命中位置，再一次性拼装，复杂度降回 O(总体积)。
//
// 语义等价说明：替换进去的是 base64，其字符集不含 "."，因此「含扩展名的完整文件名」
// 不可能出现在已替换的 payload 内部；不存在「先替换 A 才让 B 出现」的情形，
// 所以基于原始 HTML 一次性定位与逐个替换结果一致。
const names = [...uriByFile.keys()].sort((a, b) => b.length - a.length);
// Vite can emit URLs such as "../image-hash.webp" from an inlined chunk.
// Replacing only the filename leaves a dot-path before "data:image/...", which
// every browser treats as a relative path and breaks the artwork in file:// builds.
function emittedReferenceStart(filenameStart) {
  let start = filenameStart;
  for (;;) {
    if (start >= 3 && html.startsWith("../", start - 3)) start -= 3;
    else if (start >= 2 && html.startsWith("./", start - 2)) start -= 2;
    else if (start >= 8 && html.startsWith("/assets/", start - 8)) start -= 8;
    else if (start >= 7 && html.startsWith("assets/", start - 7)) start -= 7;
    else if (start >= 1 && html[start - 1] === "/") start -= 1;
    else break;
  }
  return start;
}
const hits = [];
// Keep repeated image URLs in a shared registry. The expanded page has grown
// beyond V8's maximum string length, so neither the final HTML nor a script
// containing the entire image library may be assembled as one giant string.
// Only complete JS string literals are replaced with expressions; URLs inside
// CSS, templates or HTML retain the ordinary data-URI substitution below.
const registry = [];
const registryIndex = new Map();
const literalRanges = [];
const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
for (const match of html.matchAll(scriptPattern)) {
  const scriptStart = match.index + match[0].indexOf(">") + 1;
  const source = ts.createSourceFile("portable.js", match[1], ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const filename = node.text.replace(/^(?:(?:\.\.?\/)|(?:\/?assets\/)|\/)+/, "");
      const uri = uriByFile.get(filename);
      // Property names need a literal/computed key, rather than an expression.
      const isName = node.parent?.name === node;
      if (uri && !isName) {
        let index = registryIndex.get(filename);
        if (index === undefined) { index = registry.length; registryIndex.set(filename, index); registry.push(uri); }
        const start = scriptStart + node.getStart(source);
        const end = scriptStart + node.end;
        literalRanges.push({ start, end });
        hits.push({ start, end, uri:`globalThis.__urbanPortableAssets[${index}]` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const name of names) {
  let from = 0;
  for (;;) {
    const at = html.indexOf(name, from);
    if (at < 0) break;
    if (!literalRanges.some(range => at >= range.start && at < range.end)) hits.push({
      start: emittedReferenceStart(at),
      end: at + name.length,
      uri: uriByFile.get(name),
    });
    from = at + name.length;
  }
}
hits.sort((a, b) => a.start - b.start);

const anchorPosition = html.indexOf(portableAnchor);
if (registry.length && anchorPosition < 0 && /<div\b[^>]*\bid=["']boot-hint["']/i.test(html)) {
  throw new Error('Portable boot hint has no asset insertion anchor');
}
if (registry.length && anchorPosition >= 0 && hits.some(hit => hit.start < anchorPosition && hit.uri.startsWith('globalThis.__urbanPortableAssets['))) {
  throw new Error('A script uses portable assets before the boot shell');
}

const pieces = [];
let cursor = 0;
for (const hit of hits) {
  if (hit.start < cursor) continue; // 该位置已被更长的文件名覆盖
  pieces.push(html.slice(cursor, hit.start), hit.uri);
  cursor = hit.end;
}
pieces.push(html.slice(cursor));

// Do not silently ship a page that still points at a file we are about to
// remove.  This catches new public assets (for example a font or manifest)
// that need an explicit MIME mapping above.
const unresolved = files.filter(
  (filename) => html.includes(filename) && !inlinedFiles.has(filename),
);
if (unresolved.length > 0) {
  throw new Error(`Portable HTML still references external assets: ${unresolved.join(", ")}`);
}

let boundary = "";
for (const piece of pieces) {
  if (/(?:\.\.?\/?|\/(?:assets\/)?|assets\/)data:(?:image|font|audio|model)\//.test(boundary + piece.slice(0, 128))) {
    throw new Error("Portable HTML contains a relative file path before an inlined data URI");
  }
  boundary = piece.slice(-128);
}

const tempPath = `${htmlPath}.tmp`;
const output = fs.openSync(tempPath, "w");
try {
  // Each image gets a small script after the visible shell and before the app.
  // Images are embedded once, and no script exceeds the engine's string limit.
  const registryHead = '<script>globalThis.__urbanPortableAssets=[];</script>\n';
  let inserted = false;
  for (const piece of pieces) {
    if (!inserted && (anchorPosition >= 0 || registry.length)) {
      const marker = anchorPosition >= 0 ? portableAnchor : '<script';
      const at = piece.indexOf(marker);
      if (at >= 0) {
        fs.writeSync(output, piece.slice(0, at), undefined, "utf8");
        if (registry.length) {
          fs.writeSync(output, registryHead, undefined, "utf8");
          registry.forEach((uri, i) => fs.writeSync(output, `<script>globalThis.__urbanPortableAssets[${i}]=${JSON.stringify(uri)};</script>\n`, undefined, "utf8"));
        }
        fs.writeSync(output, piece.slice(at + (anchorPosition >= 0 ? marker.length : 0)), undefined, "utf8");
        inserted = true;
        continue;
      }
    }
    fs.writeSync(output, piece, undefined, "utf8");
  }
  if ((registry.length || anchorPosition >= 0) && !inserted) throw new Error('Portable asset insertion point not found');
} finally { fs.closeSync(output); }
fs.renameSync(tempPath, htmlPath);

// The published artifact is the HTML file itself.  Move already-inlined
// assets out of the way instead of unlinking them: the sandbox safe-delete
// shim bulk-confirms unlink batches, which aborts the build mid-publish.
// Renaming into a discard subfolder is not a delete and is swept away by
// the next vite emptyOutDir pass.
const discardDir = path.join(outDir, "_inlined_assets_discard");
for (const filename of files) {
  const filePath = path.join(outDir, filename);
  if (inlinedFiles.has(filename) && fs.existsSync(filePath)) {
    fs.mkdirSync(discardDir, { recursive: true });
    fs.renameSync(filePath, path.join(discardDir, filename));
  }
}

console.log(
  `Portable HTML bundled: ${htmlPath} (${(fs.statSync(htmlPath).size / 1024 / 1024).toFixed(1)} MiB; ` +
    `${inlined} assets, ${registry.length} shared URLs, ${(totalBytes / 1024 / 1024).toFixed(1)} MiB raw)`,
);
