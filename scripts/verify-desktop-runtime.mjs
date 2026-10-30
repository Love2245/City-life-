import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { desktopEnvironment, identityPath, projectId, startGame } from './start-game.mjs';

// Isolated source-server checks: never launch a game window or touch a player save.
process.argv.push('--dev');
const tempRoot = path.resolve(tmpdir());
const runtimeDirectory = await mkdtemp(path.join(tempRoot, 'urban-life-desktop-check-'));
const reserve = async () => {
  const socket = createServer(connection => connection.destroy());
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  return { socket, port: socket.address().port };
};
const release = socket => new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
const phases = [];
let runtime, foreign;
try {
  const env = desktopEnvironment({ USERPROFILE: 'C:\\Users\\RuntimeCheck', Path: 'existing-path' });
  assert.match(env.PATH, /existing-path/);
  assert.match(env.CARGO_TARGET_DIR, /src-tauri[\\/]target$/);
  for (const port of [0, -1, 65536, 1420.5]) await assert.rejects(startGame({ port, launchNative: false }), /无效/);
  const available = await reserve(); await release(available.socket);
  runtime = await startGame({ port: available.port, launchNative: false, runtimeDirectory, notify: s => phases.push(s.phase) });
  const identityUrl = new URL(identityPath, runtime.url);
  assert.equal((await (await fetch(identityUrl)).json()).projectId, projectId);
  assert.equal((await fetch(new URL(`${identityPath}/shutdown`, runtime.url), { method: 'POST' })).status, 403);
  const duplicate = await startGame({ port: available.port, launchNative: false, runtimeDirectory });
  assert.equal(duplicate.reused, true);
  assert.equal((await (await fetch(identityUrl)).json()).focusRequest, 1);
  await fetch(new URL(`${identityPath}/ready`, runtime.url), { method: 'POST', headers: { 'x-urban-life-launcher': projectId } });
  assert.equal((await (await fetch(identityUrl)).json()).phase, 'ready');
  await runtime.close(); runtime = undefined;
  const final = JSON.parse(await readFile(path.join(runtimeDirectory, 'status.json'), 'utf8'));
  assert.equal(final.phase, 'closed');
  assert.deepEqual(phases, ['starting', 'starting', 'ready', 'closed']);
  foreign = await reserve();
  await assert.rejects(startGame({ port: foreign.port, launchNative: false, runtimeDirectory }), /端口已被其他程序占用/);
  console.log(JSON.stringify({ passed: 11, checks: ['environment', 'invalid ports', 'source server', 'identity', 'protected shutdown', 'duplicate reuse', 'focus request', 'ready handshake', 'close status', 'listener cleanup', 'occupied foreign port'], nativeWindow: 'not run', playerSaves: 'untouched' }));
} finally {
  await runtime?.close();
  if (foreign) await release(foreign.socket);
  const target = path.resolve(runtimeDirectory);
  assert.equal(path.dirname(target), tempRoot);
  assert.ok(path.basename(target).startsWith('urban-life-desktop-check-'));
  await rm(target, { recursive: true, force: true });
}
