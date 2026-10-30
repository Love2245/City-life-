import * as THREE from 'three';
import { LIN_SEAT } from './layout';
import { atlasFrames, spriteSector, SPRITE_VIEWS, ATLAS_FRAME_FOR_CAMERA_SECTOR } from './spriteDirections';
import { cameraFacingAngle, spriteCardMatrix, spriteBodyDepthAmplitude, setSpriteBodyDepth } from './cameraPose';

export type LinSprite = Awaited<ReturnType<typeof createLinSprite>>;

/** Seated, painted views share one immutable source atlas and one scene card.
 * No game/NPC state or animation clock is needed for a quiet window seat. */
export async function createLinSprite(renderer: THREE.WebGLRenderer) {
  const texture = await new THREE.TextureLoader().loadAsync(new URL('../../assets/scenes/cafe/lin-seated-neutral-eight-v2.png', import.meta.url).href);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const image = texture.image as HTMLImageElement;
  const inspection = document.createElement('canvas');
  inspection.width = image.naturalWidth; inspection.height = image.naturalHeight;
  const context = inspection.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, inspection.width, inspection.height).data;
  const frames = atlasFrames(pixels, inspection.width, inspection.height);
  inspection.width = inspection.height = 0;
  // A 166 cm adult on the 74 cm stool; the beret brings the top to about 162 cm.
  const seatedHeight = 1.62, widthScale = 1;
  const pixelsPerMetre = Math.max(...frames.map(f => f.height)) / seatedHeight;
  const root = new THREE.Group(); root.name = '林小雨 · 窗边坐姿';
  root.position.set(LIN_SEAT.x, .014, LIN_SEAT.z); root.userData.zone = 'lin';
  const material = new THREE.MeshBasicMaterial({ map: texture, alphaTest: .16, depthTest: true, depthWrite: true, transparent: false, side: THREE.DoubleSide, toneMapped: false, alphaToCoverage: true });
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 16);
  const card = new THREE.Mesh(geometry, material);
  card.name = 'Lin eight-view alpha silhouette'; card.castShadow = false; card.receiveShadow = false;
  card.userData.skipContactAO = true; card.userData.cafeCharacterCard = true; card.matrixAutoUpdate = false; root.add(card);
  // Sample the atlas alpha for a silhouette stroke; a postprocess override
  // would outline the rectangular sprite plane instead of the person.
  const outlineMaterial=new THREE.ShaderMaterial({
    uniforms:{spriteMap:{value:texture},atlasOffset:{value:texture.offset},atlasRepeat:{value:texture.repeat},texel:{value:new THREE.Vector2(1/image.naturalWidth,1/image.naturalHeight)},radius:{value:3}},
    vertexShader:'varying vec2 imageUV;void main(){imageUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform sampler2D spriteMap;uniform vec2 atlasOffset,atlasRepeat,texel;uniform float radius;varying vec2 imageUV;
      float coverage(vec2 p){return texture2D(spriteMap,clamp(p,atlasOffset+texel*.5,atlasOffset+atlasRepeat-texel*.5)).a;}
      void main(){vec2 uv=atlasOffset+imageUV*atlasRepeat;float center=coverage(uv);if(center>=.16)discard;vec2 d=texel*radius;
      float edge=max(max(coverage(uv+vec2(d.x,0.)),coverage(uv-vec2(d.x,0.))),max(coverage(uv+vec2(0.,d.y)),coverage(uv-vec2(0.,d.y))));
      edge=max(edge,max(max(coverage(uv+d),coverage(uv-d)),max(coverage(uv+vec2(d.x,-d.y)),coverage(uv+vec2(-d.x,d.y)))));
      if(edge<.16)discard;gl_FragColor=vec4(1.0);}`,
    transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
  });
  const outline=new THREE.Mesh(geometry,outlineMaterial);outline.name='Lin selected silhouette';outline.visible=false;outline.matrixAutoUpdate=false;outline.renderOrder=2;outline.userData.skipContactAO=true;root.add(outline);
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const shade = shadowCanvas.getContext('2d')!, gradient = shade.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(24,31,22,.24)'); gradient.addColorStop(.5, 'rgba(24,31,22,.12)'); gradient.addColorStop(1, 'rgba(24,31,22,0)');
  shade.fillStyle = gradient; shade.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .68, depthWrite: false, toneMapped: false });
  const shadowGeometry = new THREE.PlaneGeometry(.78, .60), shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.005; shadow.renderOrder = 1; root.add(shadow);
  let sector: number | undefined, bodyDepth = -1;
  const cameraDirection = new THREE.Vector3();
  let audit = {};
  return {
    root,
    setSelected(selected:boolean){outline.visible=selected;},
    containsUV(uv: THREE.Vector2) {
      const x = Math.min(image.naturalWidth - 1, Math.max(0, Math.floor((texture.offset.x + uv.x * texture.repeat.x) * image.naturalWidth)));
      const y = Math.min(image.naturalHeight - 1, Math.max(0, Math.floor((1 - texture.offset.y - uv.y * texture.repeat.y) * image.naturalHeight)));
      return pixels[(y * image.naturalWidth + x) * 4 + 3] >= material.alphaTest * 255;
    },
    update(camera: THREE.Camera, night: boolean) {
      // Orthographic viewing direction is shared across the scene. Panning
      // must not switch the painted view or turn the card toward a camera point.
      const viewAngle = cameraFacingAngle(camera, cameraDirection);
      const cameraElevation = Math.asin(THREE.MathUtils.clamp(cameraDirection.y, -1, 1));
      const nextBodyDepth = spriteBodyDepthAmplitude(cameraElevation);
      if (Math.abs(nextBodyDepth - bodyDepth) > 1e-7) { setSpriteBodyDepth(geometry, nextBodyDepth); bodyDepth = nextBodyDepth; }
      sector = spriteSector(viewAngle - LIN_SEAT.yaw, sector);
      const atlasFrame = ATLAS_FRAME_FOR_CAMERA_SECTOR[sector], f = frames[atlasFrame];
      texture.repeat.set(f.width / image.naturalWidth, f.height / image.naturalHeight);
      texture.offset.set(f.x / image.naturalWidth, 1 - (f.y + f.height) / image.naturalHeight);
      const width = f.width / pixelsPerMetre * widthScale, height = f.height / pixelsPerMetre;
      spriteCardMatrix(camera, width, height, (f.x + f.width / 2 - f.anchorX) / pixelsPerMetre * widthScale, card.matrix);
      card.matrixWorldNeedsUpdate = true; card.updateWorldMatrix(true, false);
      outline.matrix.copy(card.matrix);outline.matrixWorldNeedsUpdate=true;
      material.color.set(night ? '#b8ae98' : '#f5f0e5'); shadowMaterial.opacity = night ? .50 : .68;
      const project = (x: number, y: number) => new THREE.Vector3(x, y, 0).applyMatrix4(card.matrixWorld).project(camera);
      const screenAnchor = root.position.clone().project(camera), screenTop = project(0, .5), screenBottom = project(0, -.5), screenLeft = project(-.5, 0), screenRight = project(.5, 0);
      outlineMaterial.uniforms.radius.value=Math.max(2,2*f.height/Math.max(1,Math.abs(screenTop.y-screenBottom.y)*renderer.domElement.height/2));
      const screenAspect = Math.abs((screenRight.x - screenLeft.x) / (screenTop.y - screenBottom.y)) * renderer.domElement.clientWidth / renderer.domElement.clientHeight;
      audit = { id: LIN_SEAT.npcId, name: LIN_SEAT.name, position: root.position.toArray(), standingHeight: 1.66, seatedHeight, stoolSeat: LIN_SEAT.stoolHeight, pose: 'relaxed-seated-v2', projection: 'camera-facing / upright-depth', bodyDepth, cameraElevation, screenAspect, sourceAspect: width / height, widthScale, sector, atlasFrame, view: SPRITE_VIEWS[sector], facing: '+Z / window', night, tint: material.color.getHexString(), depthWrite: true, alphaTest: material.alphaTest, castShadow: false, contactShadow: 'soft ellipse', atlasSize: [image.naturalWidth, image.naturalHeight], visibleFrame: f, screenAnchor: screenAnchor.toArray(), screenTop: screenTop.toArray(), screenBottom: screenBottom.toArray(), screenLeft: screenLeft.toArray(), screenRight: screenRight.toArray() };
      return audit;
    },
    dispose() { geometry.dispose(); material.dispose(); outlineMaterial.dispose(); texture.dispose(); shadowGeometry.dispose(); shadowMaterial.dispose(); shadowTexture.dispose(); },
  };
}
