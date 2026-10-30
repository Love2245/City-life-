import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const phase = process.argv[2] ?? 'after';
const out = path.resolve('docs/office-remaster-1497-20261024');
let baselineServer;
if (phase === 'before') {
  const { createServer } = await import('vite');
  const beforeFiles = new Set(['sceneLoadWork.ts', 'homeRoom3D.ts', 'cafeRoom3D.ts', 'convenienceStore3D.ts', 'sceneExterior/index.ts', 'sceneExterior/district.ts'].map(file => `${path.resolve('src/lib').replaceAll('\\', '/')}/${file}`));
  baselineServer = await createServer({ server: { port: 1432, strictPort: true }, plugins: [{ name: 'scene-performance-before-snapshot', enforce: 'pre',
    async load(id) { if (beforeFiles.has(id)) return readFile(path.join(out, 'before', path.relative(process.cwd(), id)), 'utf8'); },
  }] });
  await baselineServer.listen();
}
const base = process.env.QA_URL ?? (baselineServer ? 'http://127.0.0.1:1432' : 'http://127.0.0.1:1431');
const runtime = 'C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const imported = await import(pathToFileURL(runtime).href);
const chromium = imported.chromium ?? imported.default.chromium;
const browser = await chromium.launch({ executablePath: 'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] });
const results = [], errors = [];
try {
  for (const scene of ['cafe', 'store', 'home']) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
    page.on('pageerror', error => errors.push(`${scene}: ${error.message}`));
    await page.route(`${base}/`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}#scene{width:100vw;height:100vh}</style><div id="scene"></div>' }));
    await page.goto(`${base}/`);
    results.push(await page.evaluate(async kind => {
      const modules = kind === 'home' ? await Promise.all([import('/src/lib/homeRoom3D.ts'), import('/src/game/core/homeInterior.ts'), import('/src/lib/homeReferenceVisuals.ts')]) : [await import(kind === 'cafe' ? '/src/lib/cafeRoom3D.ts' : '/src/lib/convenienceStore3D.ts')];
      const records = [], tasks = [];
      const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration }))));
      observer.observe({ type: 'longtask', buffered: false });
      const host = document.querySelector('#scene');
      for (let visit = 1; visit <= 2; visit++) {
        let previous = performance.now(), raf, gaps = [];
        const frame = now => { gaps.push(now - previous); previous = now; raf = requestAnimationFrame(frame); };
        raf = requestAnimationFrame(frame);
        const started = performance.now();
        let room;
        if (kind === 'home') {
          const plan = modules[1].homePlanFor('old_apartment');
          const visuals = modules[2].createHomeReferenceVisuals(plan, 'mobile');
          room = modules[0].createHomeRoom(host, plan, () => {}, () => {}, undefined, visuals);
          room?.update(modules[0].homePreviewRoom(plan, false, 12));
        } else room = kind === 'cafe' ? modules[0].createCafeRoom(host, { quality: 'light' }) : modules[0].createStoreRoom(host, { quality: 'light' });
        const constructionMs = performance.now() - started;
        await Promise.race([room.ready, new Promise((_, reject) => setTimeout(() => reject(Error('Scene readiness timeout')), 90000))]);
        const readyMs = performance.now() - started;
        // Include the ready frame's actual drawing cost before stopping the
        // animation probe. Resolving ready runs inside the renderer's rAF.
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        cancelAnimationFrame(raf);
        await new Promise(resolve => setTimeout(resolve, 50));
        records.push({ visit, constructionMs, readyMs, frames: gaps.length, maxFrameGapMs: Math.max(...gaps), longTasks: tasks.filter(task => task.start >= started), data: { ...host.dataset } });
        room.dispose();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      observer.disconnect();
      return { kind, records };
    }, scene));
    await page.close();
    console.log(`${scene}: ${results.at(-1).records.map(record => `visit${record.visit} construct=${record.constructionMs.toFixed(1)}ms ready=${record.readyMs.toFixed(1)}ms maxGap=${record.maxFrameGapMs.toFixed(1)}ms`).join('; ')}`);
  }
} finally { await browser.close(); await baselineServer?.close(); }
await mkdir(out, { recursive: true });
await writeFile(path.join(out, `scene-load-${phase}.json`), JSON.stringify({ phase, base, renderer: 'Chrome headless SwiftShader; comparative desktop probe, not physical-device performance', results, errors }, null, 2));
if (errors.length) process.exitCode = 1;
