import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, realpathSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
export const desktopPort = 1420;
export const projectId = createHash('sha256').update(projectRoot.toLowerCase()).digest('hex');
export const identityPath = '/__urban_life_desktop';
const runtimeDir = path.join(projectRoot, '.cache/desktop-runtime');

export function desktopEnvironment(base = process.env) {
  const cargoDir = path.join(base.USERPROFILE || base.HOME || '', '.cargo/bin');
  return { ...base, PATH: [path.dirname(process.execPath), cargoDir, base.PATH || base.Path || ''].join(path.delimiter),
    CARGO_TARGET_DIR: path.join(projectRoot, 'src-tauri/target'), CARGO_TERM_COLOR: 'never' };
}
export async function probeDesktop(url) {
  try {
    const response = await fetch(new URL(identityPath, url), { signal: AbortSignal.timeout(1200) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
async function focusExisting(url) {
  const running = await probeDesktop(url);
  if (running?.projectId !== projectId) return false;
  await fetch(new URL(`${identityPath}/focus`, url), { method: 'POST', headers: { 'x-urban-life-launcher': projectId }, signal: AbortSignal.timeout(1500) });
  console.log('已恢复当前源码项目的游戏窗口。');
  return true;
}

/** Vite belongs to the CLI session, so rebuilding Rust does not stop the source server. */
/** Newest mtime across the sources, used to decide whether the bundle is stale. */
export function sourceMtime() {
  let newest = 0;
  // The entry file lives at the project root, not under src/, so it must be checked
  // explicitly or edits to it would never trigger a rebuild.
  const entry = path.join(projectRoot, 'index.html');
  if (existsSync(entry)) newest = statSync(entry).mtimeMs;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (!entry.isDirectory()) {
        newest = Math.max(newest, statSync(full).mtimeMs);
      } else walk(full);
    }
  };
  walk(path.join(projectRoot, 'src'));
  return newest;
}
/**
 * Vite empties the output directory before building, and that deletion is blocked in
 * this environment. Renaming first leaves nothing to empty, so the build proceeds.
 */
function buildBundle(env) {
  const distDir = path.join(projectRoot, 'dist');
  if (existsSync(distDir)) { try { renameSync(distDir, `${distDir}.old-${Date.now()}`); } catch { /* keep and let Vite handle it */ } }
  return spawnSync(process.execPath, ['--max-old-space-size=8192',
    path.join(projectRoot, 'node_modules/vite/bin/vite.js'), 'build', '--configLoader', 'runner'],
    { cwd: projectRoot, env, windowsHide: true, encoding: 'utf8' });
}
export async function startGame({ port = desktopPort, launchNative = true, notify = () => {}, runtimeDirectory = runtimeDir } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('无效的本地端口');
  const url = `http://127.0.0.1:${port}/`;
  if (await focusExisting(url)) return { reused: true, url, close: async () => {} };
  if (!existsSync(path.join(projectRoot, 'node_modules/vite/package.json'))) throw new Error('缺少项目依赖，请先在源码目录安装依赖。');
  const env = desktopEnvironment();
  if (launchNative && spawnSync('cargo', ['--version'], { env, windowsHide: true }).status !== 0)
    throw new Error('未找到 Rust/Cargo，请检查本机开发环境。');
  let status = { projectId, pid: process.pid, phase: 'starting', message: '正在启动游戏…', url, focusRequest: 0 };
  let native, closed = false, log, readyFallback;
  const publish = (phase, message) => {
    status = { ...status, phase, message };
    writeFileSync(path.join(runtimeDirectory, 'status.json'), JSON.stringify(status)); notify(status);
  };
  const runtimeHandler = (instance) => (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method === 'POST') {
      if (request.headers['x-urban-life-launcher'] !== projectId) { response.statusCode = 403; response.end('{}'); return; }
      if (request.url === '/focus') {
        status.focusRequest += 1;
        publish(status.phase, status.message);
        instance.ws?.send({ type: 'custom', event: 'urban-life:focus' });
      }
      if (request.url === '/ready') publish('ready', '游戏已启动');
      if (request.url === '/shutdown') { response.end('{}'); void close(); return; }
    }
    response.end(JSON.stringify(status));
  };
  const runtimePlugin = { name: 'urban-life-desktop-runtime',
    configureServer(instance) { instance.middlewares.use(identityPath, runtimeHandler(instance)); },
    configurePreviewServer(instance) { instance.middlewares.use(identityPath, runtimeHandler(instance)); } };
  // Serving the built bundle instead of the dev graph: the project has ~380 modules and
  // on-demand transformation made the window hang on "loading" with no way out.
  const distIndex = path.join(projectRoot, 'dist/index.html');
  const usePreview = !process.argv.includes('--dev') && existsSync(distIndex);
  let server;
  try {
    if (usePreview) {
      server = await (await import('vite')).preview({ root: projectRoot, configFile: false, base: './',
        plugins: [runtimePlugin], preview: { host: '127.0.0.1', port, strictPort: true, open: false } });
    } else {
      server = await (await import('vite')).createServer({ root: projectRoot, configLoader: 'runner',
        server: { host: '127.0.0.1', port, strictPort: true, open: false,
          warmup: { clientFiles: ['./src/main.ts'] } },
        plugins: [runtimePlugin] });
      await server.listen();
    }
  } catch (error) {
    await server?.close?.().catch?.(() => {});
    if (await focusExisting(url)) return { reused: true, url, close: async () => {} };
    throw new Error(`${port} 端口已被其他程序占用，游戏未启动。`, { cause: error });
  }
  mkdirSync(runtimeDirectory, { recursive: true });
  log = createWriteStream(path.join(runtimeDirectory, 'startup.log'), { flags: 'w' });
  if (usePreview && (!existsSync(distIndex) || sourceMtime() > statSync(distIndex).mtimeMs)) {
    publish('starting', '源码有更新，正在重新构建游戏…');
    const build = buildBundle(env);
    log.write(build.stdout || ''); log.write(build.stderr || '');
    if (build.status !== 0) {
      await server.close(); log.end();
      throw new Error('构建失败，请查看 .cache/desktop-runtime/startup.log。');
    }
  }
  publish('starting', launchNative ? (usePreview ? '正在准备游戏窗口…' : '正在准备游戏窗口，首次运行可能需要几分钟…') : '源码服务已启动');
  const onSignal = () => void close();
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  async function close(error) {
    if (closed) return;
    closed = true;
    clearTimeout(readyFallback);
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    if (native && native.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(native.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else native.kill('SIGTERM');
    }
    await server.close();
    publish(error ? 'error' : 'closed', error ? String(error.message || error) : '游戏已关闭');
    log.end(); if (error) process.exitCode = 1;
  }
  if (launchNative) {
    const config = JSON.stringify({ build: { beforeDevCommand: null, devUrl: url } });
    native = spawn(process.execPath, [path.join(projectRoot, 'node_modules/@tauri-apps/cli/tauri.js'), 'dev', '--config', config],
      { cwd: projectRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let pendingOutput = '';
    for (const stream of [native.stdout, native.stderr]) stream.on('data', chunk => {
      log.write(chunk); process.stdout.write(chunk);
      // Arm the fallback only once the window process is really running, so a long
      // first compile (about 90s cold) is never mistaken for a ready timeout.
      // Chunks split mid-line, so match against a rolling buffer instead of one chunk.
      if (!readyFallback) {
        pendingOutput = (pendingOutput + String(chunk)).slice(-8192);
        // No literal space after "Running": cargo emits ANSI codes around the word
        // (\x1b[92m Running\x1b[0m ...), which breaks any space-anchored pattern.
        if (/Running[\s\S]*urban-life\.exe/.test(pendingOutput)) {
          readyFallback = setTimeout(() => {
            if (status.phase !== 'starting') return;
            log.write('[launcher] 未收到页面 ready 确认，按窗口进程已运行处理。\n');
            publish('ready', '游戏窗口已启动');
          }, 30000);
        }
      }
    });
    native.once('error', error => void close(error));
    native.once('exit', (code, signal) => void close(code === 0 || closed ? undefined : new Error(`游戏窗口启动失败（${code ?? signal}），请查看 .cache/desktop-runtime/startup.log。`)));
  }
  return { reused: false, url, server, close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startGame({ launchNative: !process.argv.includes('--server-only') }).catch(error => {
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(path.join(runtimeDir, 'status.json'), JSON.stringify({ projectId, pid: process.pid, phase: 'error', message: error.message }));
    console.error(error); process.exitCode = 1;
  });
}
