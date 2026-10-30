import { Matrix4, Vector3, type Camera, type BufferGeometry } from 'three';

/** An orthographic camera sees a single direction, independent of panning. */
export function cameraFacingAngle(camera: Camera, scratch: Vector3): number {
  camera.getWorldDirection(scratch).negate();
  return Math.atan2(scratch.x, scratch.z);
}

/** A character-only affine billboard for this orthographic scene.
 * Screen right/up retain the source image's aspect at every camera pitch.
 * The extra view-depth component gives every painted height the depth of an
 * upright person, so facing the camera cannot sink the head under a tabletop.
 * The bottom anchor remains on the floor. No camera or building is changed. */
export function spriteCardMatrix(camera: Camera, width: number, height: number, anchorOffset = 0, target = new Matrix4()): Matrix4 {
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const screenUp = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const towardCamera = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize();
  const up = screenUp.addScaledVector(towardCamera, towardCamera.y);
  const center = up.clone().multiplyScalar(height / 2).addScaledVector(right, anchorOffset);
  target.makeBasis(right.multiplyScalar(width), up.multiplyScalar(height), towardCamera);
  return target.setPosition(center);
}

/** A shallow body volume in view depth only. At steep views a flat proxy can
 * let the far countertop cut through the lap. Keep the head and floor depth
 * unchanged, adding at most 38 cm around the seated torso/knees. */
export function spriteBodyDepthAmplitude(elevation: number): number {
  const t = Math.max(0, Math.min(1, (elevation - Math.PI / 4) / (35 * Math.PI / 180)));
  return .38 * t * t * (3 - 2 * t);
}

export function setSpriteBodyDepth(geometry: BufferGeometry, amplitude: number): void {
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const progress = Math.max(0, Math.min(1, positions.getY(i) + .5));
    positions.setZ(i, amplitude * Math.sin(Math.PI * progress));
  }
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
}

