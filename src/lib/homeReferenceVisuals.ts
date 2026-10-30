import { DataTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three';
import type { HomePlan, HomePoint } from '../game/core/homeInterior';
import { HOME_FIXED_IDS } from '../game/core/homeInterior';
import type { HomeRoomVisuals, HomeVisualAddition, HomeVisualModel } from './homeVisualModels';
import { homeSceneQuality } from './homeQuality';

const urls = import.meta.glob('/src/assets/home/v1.49/reference/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const mobileUrls = import.meta.glob('/src/assets/home/v1.49/reference/*.glb', { eager: true, query: '?mobile-model&url', import: 'default' }) as Record<string, string>;

export { homeReferencePlan, homeReferenceState } from './homeReferencePlan';

export function createHomeReferenceVisuals(plan: HomePlan, quality: 'pc' | 'mobile' = 'pc', renderScale=1,resolution:import('./renderResolution').RenderResolution='auto'): HomeRoomVisuals {
  const profile = homeSceneQuality('auto', quality);
  const modelUrls=profile.id==='light'?mobileUrls:urls;
  const asset=(id:string,size:[number,number,number],extra:Partial<HomeVisualModel>={}):HomeVisualModel=>({id,url:modelUrls[`/src/assets/home/v1.49/reference/${id}.glb`],size,...extra});
  const fixed = !!plan.residenceId && HOME_FIXED_IDS.has(plan.residenceId);
  const pixels = new Uint8Array(64 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4, shade = y / 31;
    pixels[i] = 220 - 70 * shade; pixels[i + 1] = 225 - 78 * shade; pixels[i + 2] = 228 - 92 * shade; pixels[i + 3] = 255;
  }
  const environment = new DataTexture(pixels, 64, 32);
  environment.mapping = EquirectangularReflectionMapping;
  environment.colorSpace = SRGBColorSpace; environment.needsUpdate = true;
  const mirrored = !!plan.anchors.bed?.mirrorX;
  const point = (x: number, z: number): HomePoint => [mirrored ? plan.size[0] - x : x, z];
  const addition = (id: string, size: [number, number, number], position: HomePoint, owner: HomeVisualAddition['owner'], rotation = 0, height = 0): HomeVisualAddition => ({
    model: asset(id, size, { offset: [0, height, 0], mirrorX: mirrored }), position, owner, rotation: mirrored ? -rotation : rotation,
  });
  return {
    environment, renderScale, resolution, quality: profile, contactShadows: profile.contactShadows, pixelRatioCap: profile.pixelRatio,
    daylight: { bounceScale: .60, windowScale: .70, keyScale: 3.4, shadowScale: 2.1, environmentIntensity: .16, windowAim: 'room' },
    objects: {
      bed: object => asset('bed', [1.55, 1.05, 2.12], { stretch: true, plainCushionMaterials: ['pillow01_3'], materialColors: {
        blanket01_3: object.item === 'bed_premium' ? '#c4bca7' : object.item === 'bed_standard' ? '#9daebb' : '#adb69f',
      } }),
      kitchen: asset('kitchen', [plan.openKitchen ? 2.42 : 1.15, 1.04, .66], { mirrorX: true, stretch: true }),
      sofa: asset('sofa', [1.7, .95, .86], { upholsteryColors: { chair01_4: '#c8bea5' }, plainCushionMaterials: ['pillow01_3'] }),
      storage: asset('shoe-cabinet', [.95, .85, .40], { rotation: Math.PI }),
    },
    fixtures: { bathTub: asset('bath-tub', [2, .56, 1], { stretch: true, offset: [0, .025, 0] }) },
    windows: window => {
      const room = plan.rooms.find(room => room.name === window.room);
      if (room?.type === 'bath' || room?.type === 'kitchen') return [];
      return [
        asset('curtain-panel', [.34, 2.12, .13], { offset: [-window.width / 2 - .015, .26, .38], stretch: true }),
        asset('curtain-panel', [.34, 2.12, .13], { offset: [window.width / 2 + .015, .26, .38], stretch: true }),
        asset('curtain-rail', [window.width + .38, .08, .16], { offset: [0, 2.38, .38], stretch: true }),
      ];
    },
    additions: (objects, detail = profile.id) => {
      const additions: HomeVisualAddition[] = [];
      if(fixed){
        const bath=plan.rooms.find(room=>room.type==='bath');
        // Guest rooms have their own compact fittings; never inherit a washing
        // machine or decorations positioned for the permanent apartment plan.
        if(bath&&bath.rect[2]>=1.55&&bath.rect[3]>=1.7)additions.push(addition('toilet',[.44,.90,.68],[bath.rect[0]+.44,bath.rect[1]+.46],'shower',0,.025));
        const table=plan.fixtures?.find(f=>f.kind==='coffeeTable'||f.kind==='sideTable');
        if(table)additions.push(addition('tissue-box',[.13,.06,.25],[...table.position],table.owner??'sofa',0,.50));
        return detail==='light'?additions.filter(a=>a.model.id==='toilet'):additions;
      }
      const large = plan.id === 'premium' || plan.id === 'house', villa = plan.id === 'house';
      // A 1.45 m studio bathroom cannot fit these without blocking the shower.
      if (plan.id !== 'studio') {
        const bath = plan.rooms.find(room => room.type === 'bath')!;
        if (large) {
          additions.push(addition('toilet', [.47, 1, .77], villa ? [11.55, 3.65] : [9.53, 2.85], 'shower', Math.PI / 2, .025));
          additions.push(addition('washing-machine', [.65, .96, .70], villa ? [12.8, 2.55] : [12.92, 1.73], 'shower', 0, .025));
        } else {
          const baseX = mirrored ? plan.size[0] - bath.rect[0] - bath.rect[2] : bath.rect[0];
          additions.push(addition('toilet', [.47, .94, .77], point(baseX + .52, bath.rect[1] + .65), 'shower', 0, .025));
          // The compact bathroom has no room for a washer plus both fixture
          // approaches. Use the adjoining kitchen's dry corner by its front wall.
          const utility=plan.rooms.find(room=>room.type==='kitchen')!;
          additions.push(addition('washing-machine', [.60, .89, .66], point(baseX + .25, utility.rect[1] + utility.rect[3] - .46), 'shower', Math.PI, .025));
        }
      }
      if (large) {
        additions.push(addition('upper-cabinet', [1.5, .60, .42], villa ? [15.8, 11.77] : [12.8, 8.77], 'kitchen', Math.PI, 1.70));
        const kitchen = objects.find(object => object.kind === 'kitchen');
        if (kitchen?.item === 'cook_set_mid' || kitchen?.item === 'cook_set_high') {
          const counter = plan.fixtures?.find(fixture => fixture.kind === 'counter' && fixture.size[0] >= 2);
          if (counter) additions.push(addition('microwave', [.52, .35, .45], [...counter.position], 'kitchen', Math.PI, .945));
        }
        additions.push(addition('umbrella-stand', [.26, 1.15, .45], villa ? [3.48, 13.6] : [1.76, 10.0], 'storage'));
        additions.push(addition('indoor-plant', [.70, .9, .70], villa ? [3.55, 11.9] : [1.95, 8.85], 'storage'));
        additions.push(addition('pouf', [.62, .45, .62], villa ? [4.2, 12.7] : [2.32, 9.55], 'storage'));
      } else if (plan.id !== 'studio') {
        additions.push(addition('umbrella-stand', [.22, .98, .38], point(plan.id === 'compact' ? .35 : .28, plan.id === 'compact' ? 7.6 : 5.70), 'storage'));
      }
      const table = plan.fixtures?.find(fixture => fixture.kind === 'coffeeTable');
      if (table) {
        additions.push(addition('tissue-box', [.13, .06, .25], [table.position[0] - table.size[0] * .22, table.position[1] - table.size[1] * .25], 'sofa', Math.PI / 2, .476));
      } else if (plan.id !== 'studio') {
        additions.push({ model: asset('tissue-box', [.13, .06, .25], { offset: [0, .452, 0] }), position: [0, 1.12], owner: 'sofa', attachToOwner: true });
      }
      return detail === 'light' ? additions.filter(addition => !['indoor-plant', 'pouf', 'umbrella-stand', 'tissue-box'].includes(addition.model.id)) : additions;
    },
  };
}
