import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';

// Preserve the downloaded glTF and textures; assemble a self-contained GLB for the offline game.
const root=resolve(import.meta.dirname,'..');
const library='G:/都市生活/素材库/家居家具物件模型/PolyHaven咖啡馆物件_20261027';
const original=join(library,'原始');
const input=join(original,'potted_plant_04_1k.gltf');
const output=join(library,'多肉盆栽_PolyHaven_1k_游戏版.glb');
const runtime=join(root,'src/assets/scenes/cafe/polyhaven-potted-plant-04.glb');
assert(!existsSync(output)&&!existsSync(runtime),'Preserve existing files; refuse to overwrite');
const md5=file=>createHash('md5').update(readFileSync(file)).digest('hex');
const expected={
  'potted_plant_04_1k.gltf':'077d481764145f6e5e256593aab427bb',
  'potted_plant_04.bin':'03774ca8e28e2aa30fb26cb68d5e0093',
  'textures/potted_plant_04_nor_gl_1k.jpg':'1c0b87906fd92c7b7ce5508110976474',
  'textures/potted_plant_04_arm_1k.jpg':'ed0030c6085bba45b6f63f3043b0b237',
  'textures/potted_plant_04_diff_1k.jpg':'4a72fb3667fd3686ca4014f6676f59c4',
};
for(const [file,hash] of Object.entries(expected))assert.equal(md5(join(original,file)),hash,`Corrupted download: ${file}`);
const gltf=JSON.parse(readFileSync(input,'utf8'));
assert.equal(gltf.buffers.length,1);assert.equal(gltf.buffers[0].uri,'potted_plant_04.bin');
const buffers=[readFileSync(join(original,gltf.buffers[0].uri))];let offset=buffers[0].length;
assert.equal(offset,gltf.buffers[0].byteLength);delete gltf.buffers[0].uri;
for(const image of gltf.images){
  assert(Object.hasOwn(expected,image.uri));assert.equal(image.mimeType,'image/jpeg');
  const pad=(4-offset%4)%4;if(pad){buffers.push(Buffer.alloc(pad));offset+=pad;}
  const data=readFileSync(join(original,image.uri));image.bufferView=gltf.bufferViews.length;delete image.uri;
  gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length});buffers.push(data);offset+=data.length;
}
gltf.buffers[0].byteLength=offset;
const binPad=(4-offset%4)%4;if(binPad)buffers.push(Buffer.alloc(binPad));const bin=Buffer.concat(buffers);
const raw=Buffer.from(JSON.stringify(gltf));const jsonPad=(4-raw.length%4)%4;const json=Buffer.concat([raw,Buffer.alloc(jsonPad,0x20)]);
const header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);
jsonHeader.writeUInt32LE(json.length);jsonHeader.write('JSON',4);binHeader.writeUInt32LE(bin.length);binHeader.write('BIN\0',4);
writeFileSync(output,Buffer.concat([header,jsonHeader,json,binHeader,bin]));copyFileSync(output,runtime);
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');assert.equal(sha(output),sha(runtime));
console.log(JSON.stringify({source:'https://polyhaven.com/a/potted_plant_04',bytes:readFileSync(runtime).length,sha256:sha(runtime),embeddedImages:gltf.images.length},null,2));
