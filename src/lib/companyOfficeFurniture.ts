import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { officeWorkerAppearance, type OfficeHeadgear } from './companyWorkerAppearance';
export { OFFICE_HEADGEAR, officeWorkerAppearance, type OfficeHeadgear } from './companyWorkerAppearance';

/** Office furniture uses metre units. Every returned group rests on y=0. */
export interface OfficeFurniture {
  desk(founder?: boolean): THREE.Group;
  executiveDesk(spacious?: boolean): THREE.Group;
  coffeeTable(): THREE.Group;
  chair(): THREE.Group;
  worker(index: number, stars: number, identity?: string): THREE.Group;
  meetingTable(width: number, depth: number): THREE.Group;
  shelf(): THREE.Group;
  plant(): THREE.Group;
  lounge(): THREE.Group;
  dispose(): void;
}

/**
 * Shared primitives are baked into one mesh per material in each model. This
 * keeps small details such as chair wheels and foliage out of the draw-call
 * count. The factory owns all geometry and material resources it creates.
 */
export function createOfficeFurniture(detail:'fine'|'light'='fine'): OfficeFurniture {
  const geometries = new Map<string, THREE.BufferGeometry>();
  const mergedGeometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const models = new Map<string, THREE.Group>();
  let disposed = false;

  function material(color: string, metalness = 0, roughness = .78): THREE.MeshStandardMaterial {
    const key = `${color}/${metalness}/${roughness}`;
    let value = materials.get(key);
    if (!value) {
      value = new THREE.MeshStandardMaterial({ color, metalness, roughness });
      materials.set(key, value);
    }
    return value;
  }
  const oak = material('#b8a284'), paleOak = material('#c8b99b');
  const woodEdge = material('#958369'), darkOak = material('#786c59');
  const ivory = material('#e2e0d5'), paper = material('#e6e3d7');
  const frame = material('#4b5653', .32, .48), chrome = material('#a4aaa3', .7, .3);
  const charcoal = material('#384541'), rubber = material('#303a37');
  const fabric = material('#7f9185'), cloth = material('#a8b19c');
  const seam = material('#687b70'), fern = material('#527660'), leafLight = material('#779275');
  const soil = material('#554d3d'), ceramic = material('#d0c8b5');
  const bookColors = ['#7f9594', '#b09b7f', '#9ba58a', '#8b858d', '#c1b29a'].map(c => material(c));

  function geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let value = geometries.get(key);
    if (!value) { value = make(); geometries.set(key, value); }
    return value;
  }
  const sphere = geometry('sphere', () => new THREE.SphereGeometry(1, detail==='light'?10:16, detail==='light'?6:12));
  const cylinder = geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, detail==='light'?8:16));
  const potGeometry = geometry('pot', () => new THREE.CylinderGeometry(.215, .165, .37, detail==='light'?10:24));
  function mesh(group: THREE.Group, name: string, shape: THREE.BufferGeometry, mat: THREE.Material,
    position: [number, number, number], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
    const item = new THREE.Mesh(shape, mat);
    item.name = name; item.position.set(...position); item.scale.set(...scale);
    item.castShadow = true; item.receiveShadow = true; group.add(item);
    return item;
  }
  function box(group: THREE.Group, name: string, x: number, y: number, z: number,
    width: number, height: number, depth: number, mat: THREE.Material, radius = .012): THREE.Mesh {
    const corner = Math.min(radius, width / 3, height / 3, depth / 3);
    const key = `box/${width}/${height}/${depth}/${corner}`;
    const shape = geometry(key, () => detail==='light'&&corner<.025?new THREE.BoxGeometry(width,height,depth):new RoundedBoxGeometry(width, height, depth, detail==='light'?1:2, corner));
    return mesh(group, name, shape, mat, [x, y, z]);
  }
  function ellipsoid(group: THREE.Group, name: string, x: number, y: number, z: number,
    rx: number, ry: number, rz: number, mat: THREE.Material): THREE.Mesh {
    return mesh(group, name, sphere, mat, [x, y, z], [rx, ry, rz]);
  }
  function rod(group: THREE.Group, name: string, from: THREE.Vector3, to: THREE.Vector3,
    radius: number, mat: THREE.Material): THREE.Mesh {
    const distance = from.distanceTo(to);
    const item = mesh(group, name, cylinder, mat, [(from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2], [radius, distance, radius]);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return item;
  }
  function limb(group: THREE.Group, name: string, a: [number, number, number], b: [number, number, number], radius: number, mat: THREE.Material): void {
    rod(group, name, new THREE.Vector3(...a), new THREE.Vector3(...b), radius, mat);
    ellipsoid(group, `${name}-joint`, ...b, radius, radius, radius, mat);
  }
  function bake(source: THREE.Group): THREE.Group {
    const result = new THREE.Group(); result.name = source.name;
    result.userData = { ...source.userData, parts: [] as string[] };
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    source.updateMatrixWorld(true);
    source.traverse(item => {
      if (!(item instanceof THREE.Mesh) || Array.isArray(item.material)) return;
      result.userData.parts.push(item.name);
      const shape = item.geometry.clone();
      // Primitive types expose compatible position/normal/uv attributes.
      shape.applyMatrix4(item.matrixWorld);
      const list = batches.get(item.material) ?? [];
      list.push(shape); batches.set(item.material, list);
    });
    batches.forEach((parts, mat) => {
      const nonIndexed = parts.map(part => part.index ? part.toNonIndexed() : part);
      const shape = mergeGeometries(nonIndexed, false);
      if (shape) {
        shape.computeBoundingSphere(); mergedGeometries.add(shape);
        const item = new THREE.Mesh(shape, mat);
        item.name = `${source.name}-surface`; item.castShadow = true; item.receiveShadow = true;
        result.add(item);
      }
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] !== nonIndexed[i]) nonIndexed[i].dispose();
        parts[i].dispose();
      }
    });
    return result;
  }
  function cached(key: string, make: () => THREE.Group): THREE.Group {
    if (disposed) throw new Error('Office furniture factory has been disposed');
    let model = models.get(key);
    if (!model) { model = bake(make()); models.set(key, model); }
    return model.clone();
  }

  function desk(founder = false): THREE.Group {
    return cached(`desk/${founder}`, () => {
      const g = new THREE.Group(); g.name = founder ? 'office-founder-desk' : 'office-desk';
      // The computer models sit on a genuine 0.805 m work surface.
      box(g, 'desktop-edge', 0, .760, 0, 1.7, .074, .85, woodEdge, .022);
      box(g, 'desktop-oak', 0, .791, 0, 1.69, .028, .842, founder ? oak : paleOak, .014);
      for (const x of [-.715, .715]) {
        for (const z of [-.27, .27]) box(g, 'desk-frame-leg', x, .384, z, .048, .72, .048, frame, .009);
        box(g, 'desk-frame-top-rail', x, .73, 0, .048, .045, .60, frame, .008);
        box(g, 'desk-frame-foot', x, .04, 0, .10, .06, .71, frame, .018);
        for (const z of [-.28, .28]) box(g, 'desk-leveling-foot', x, .012, z, .10, .024, .10, rubber, .009);
      }
      box(g, 'desk-underframe', 0, .712, -.17, 1.46, .06, .045, frame, .008);
      box(g, 'desk-cable-tray', 0, .657, -.27, 1.14, .065, .12, charcoal, .008);
      // A modest drawer under one side leaves the knee space clear.
      box(g, 'desk-drawer-body', -.53, .666, .07, .34, .17, .48, ivory, .018);
      box(g, 'desk-drawer-front', -.53, .662, .316, .326, .139, .026, ivory, .009);
      box(g, 'desk-drawer-pull', -.53, .68, .337, .12, .014, .018, chrome, .005);
      for (const x of [-.57, .57]) {
        mesh(g, 'desk-cable-grommet', cylinder, charcoal, [x, .806, -.30], [.035, .004, .035]);
        box(g, 'desk-grommet-slot', x, .809, -.30, .034, .003, .007, frame, .001);
      }
      // Shared desktop stationery makes empty workstations read as offices.
      box(g, 'desk-notebook', -.60, .818, .20, .18, .024, .24, bookColors[founder ? 1 : 0], .009);
      box(g, 'desk-notebook-pages', -.60, .819, .205, .169, .015, .225, paper, .004);
      box(g, 'desk-pen', -.59, .834, .20, .008, .008, .17, charcoal, .003).rotation.y = .25;
      mesh(g, 'desk-pencil-cup', cylinder, ceramic, [.68, .857, -.23], [.045, .103, .045]);
      for (let i = 0; i < 3; i++) {
        const pen = rod(g, 'desk-cup-pencil', new THREE.Vector3(.665 + i * .012, .85, -.23), new THREE.Vector3(.66 + i * .014, .955 + i * .008, -.235), .004, bookColors[i]);
        pen.castShadow = false;
      }
      return g;
    });
  }

  function executiveDesk(spacious = false): THREE.Group {
    return cached(`executive-desk/${spacious}`, () => {
      const g = new THREE.Group(); g.name = 'office-executive-desk';
      const width = spacious ? 2.45 : 2.15, side = -width / 2 - .20;
      const walnut = material('#a18567'), walnutEdge = material('#74604d');
      const leather = material('#53685f', 0, .88), brass = material('#b7a079', .6, .36);
      // Keep the same .805 m top as the assigned computer models.
      box(g, 'executive-desktop-edge', 0, .760, 0, width, .074, 1.02, walnutEdge, .026);
      box(g, 'executive-walnut-desktop', 0, .791, 0, width - .012, .028, 1.008, walnut, .018);
      for (const x of [-width / 2 + .12, width / 2 - .12]) {
        box(g, 'executive-slab-leg', x, .385, -.015, .10, .73, .83, walnutEdge, .014);
        box(g, 'executive-leg-brass-shoe', x, .047, -.015, .12, .07, .86, brass, .01);
      }
      box(g, 'executive-modesty-panel', 0, .455, -.31, width - .24, .45, .06, walnut, .012);
      // A lower side return stores project files without taking away knee space.
      box(g, 'executive-return-plinth', side, .07, .38, .62, .14, 1.68, walnutEdge, .012);
      box(g, 'executive-side-storage', side, .38, .38, .65, .60, 1.70, ivory, .019);
      box(g, 'executive-return-top', side, .704, .38, .69, .046, 1.75, walnut, .017);
      for (let row = 0; row < 3; row++) {
        box(g, 'executive-file-drawer', side + .335, .19 + row * .19, .28, .028, .17, 1.05, ivory, .008);
        box(g, 'executive-drawer-pull', side + .357, .225 + row * .19, .28, .022, .018, .23, brass, .005);
      }
      for (let i = 0; i < 3; i++) box(g, 'executive-file-stack', side, .751 + i * .025, .91, .40, .022, .26, bookColors[i], .005);
      box(g, 'executive-leather-desk-pad', 0, .810, .045, 1.24, .009, .49, leather, .016);
      box(g, 'executive-project-journal', -.82, .824, .08, .24, .028, .31, darkOak, .01);
      box(g, 'executive-journal-pages', -.82, .827, .085, .225, .018, .295, paper, .005);
      box(g, 'executive-journal-pen', -.81, .848, .08, .009, .009, .21, brass, .003).rotation.y = .18;
      mesh(g, 'executive-pen-holder', cylinder, charcoal, [.77, .86, .26], [.045, .11, .045]);
      for (let i = 0; i < 3; i++) rod(g, 'executive-pencil', new THREE.Vector3(.75 + i * .013, .86, .26), new THREE.Vector3(.75 + i * .015, .985, .25), .004, brass);
      mesh(g, 'executive-task-lamp-base', cylinder, frame, [.84, .824, -.29], [.115, .028, .115]);
      rod(g, 'executive-task-lamp-stem', new THREE.Vector3(.84, .84, -.29), new THREE.Vector3(.84, 1.21, -.30), .018, brass);
      rod(g, 'executive-task-lamp-arm', new THREE.Vector3(.84, 1.21, -.30), new THREE.Vector3(.58, 1.24, -.30), .018, brass);
      box(g, 'executive-task-lamp-shade', .56, 1.223, -.30, .30, .065, .16, frame, .025);
      box(g, 'executive-task-lamp-diffuser', .56, 1.186, -.30, .25, .012, .12, paper, .005);
      return g;
    });
  }

  function coffeeTable(): THREE.Group {
    return cached('coffee-table', () => {
      const g = new THREE.Group(); g.name = 'office-coffee-table';
      for (const x of [-.38,.38]) for (const z of [-.20,.20]) box(g,'coffee-table-leg',x,.205,z,.035,.37,.035,frame,.008);
      box(g,'coffee-table-lower-shelf',0,.18,0,.82,.035,.44,darkOak,.018);
      box(g,'coffee-table-oak-edge',0,.408,0,1.02,.055,.62,darkOak,.035);
      box(g,'coffee-table-stone-top',0,.44,0,1.008,.018,.608,ivory,.028);
      box(g,'coffee-table-magazine',-.19,.46,.03,.23,.022,.30,bookColors[2],.005);
      box(g,'coffee-table-magazine-pages',-.19,.464,.035,.218,.012,.29,paper,.003);
      for(const x of [.19,.36]) {
        mesh(g,'coffee-table-cup',cylinder,ceramic,[x,.491,-.05],[.045,.082,.045]);
        mesh(g,'coffee-table-tea',cylinder,darkOak,[x,.534,-.05],[.037,.002,.037]);
      }
      return g;
    });
  }

  function chair(): THREE.Group {
    return cached('chair', () => {
      const g = new THREE.Group(); g.name = 'office-ergonomic-chair';
      // Five castor legs, not the four legs of a dining chair.
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5 + Math.PI / 2;
        const x = Math.cos(angle) * .28, z = Math.sin(angle) * .28;
        rod(g, 'chair-five-star-leg', new THREE.Vector3(0, .155, 0), new THREE.Vector3(x, .09, z), .025, frame);
        const wheel = mesh(g, 'chair-castor-wheel', cylinder, rubber, [x, .055, z], [.042, .041, .042]);
        wheel.rotation.z = Math.PI / 2; wheel.rotation.y = angle;
        mesh(g, 'chair-castor-stem', cylinder, chrome, [x, .11, z], [.012, .055, .012]);
      }
      mesh(g, 'chair-gas-lift', cylinder, chrome, [0, .285, 0], [.025, .265, .025]);
      mesh(g, 'chair-lift-sleeve', cylinder, frame, [0, .21, 0], [.037, .13, .037]);
      box(g, 'chair-seat-pan', 0, .414, -.02, .48, .065, .46, charcoal, .025);
      box(g, 'chair-seat-cushion', 0, .462, -.035, .49, .075, .465, fabric, .037);
      // Thin vertical strips leave real negative space in the breathable back.
      box(g, 'chair-back-bottom', 0, .62, .207, .45, .045, .055, charcoal, .016);
      box(g, 'chair-back-top', 0, 1.027, .263, .42, .047, .055, charcoal, .016);
      for (const x of [-.216, .216]) {
        const side = box(g, 'chair-back-side', x, .824, .237, .033, .43, .043, charcoal, .014);
        side.rotation.x = .13;
      }
      for (let i = -5; i <= 5; i++) {
        const strip = box(g, 'chair-mesh-strap', i * .034, .824, .237, .016, .37, .012, seam, .004);
        strip.rotation.x = .13;
      }
      box(g, 'chair-lumbar-pad', 0, .682, .21, .34, .085, .045, fabric, .025);
      rod(g, 'chair-back-spine', new THREE.Vector3(0, .38, .15), new THREE.Vector3(0, .78, .29), .026, frame);
      for (const x of [-.288, .288]) {
        rod(g, 'chair-arm-support', new THREE.Vector3(x * .75, .425, .10), new THREE.Vector3(x, .67, .04), .018, frame);
        box(g, 'chair-arm-pad', x, .69, -.015, .067, .033, .27, charcoal, .018);
      }
      return g;
    });
  }

  function addHeadgear(g: THREE.Group, type: OfficeHeadgear): void {
    const kraft = material('#c7a477', 0, .92), crease = material('#a4855f', 0, .96);
    const printedInk = material('#364b46'), cream = material('#e2d7be');
    const faceZ = -.025;
    // Eighty broad facets retain the toy-like low-poly look without the pointed
    // cheeks and pentagonal forehead of the old twenty-face shells.
    const lowPoly = geometry('headgear-soft-polyhedron', () => new THREE.IcosahedronGeometry(1, 1));
    const eye = (x: number, y: number, z: number, width = .018) =>
      ellipsoid(g, 'headgear-printed-eye', x, y, z, width / 2, .019, .008, printedInk);

    const roundedEar = geometry('headgear-rounded-pointed-ear', () => {
      const outline = new THREE.Shape();
      outline.moveTo(-.082, -.034); outline.quadraticCurveTo(-.093, -.048, -.085, -.008);
      outline.lineTo(-.026, .127); outline.quadraticCurveTo(0, .175, .026, .127);
      outline.lineTo(.085, -.008); outline.quadraticCurveTo(.097, -.048, .072, -.042);
      outline.closePath();
      return new THREE.ExtrudeGeometry(outline, { depth: .065, steps: 1, bevelEnabled: true,
        bevelThickness: .009, bevelSize: .009, bevelSegments: 2, curveSegments: 4 });
    });

    if (type === 'paper-bag') {
      // A softly creased paper hood: rounded silhouette, thick folded edges and
      // small real eye cut-outs. The material stays matte rather than plastic.
      // The two holes are actual cut-outs with a dark lining, never a human face.
      box(g, 'headgear-paper-back', 0, 1.352, .123, .352, .414, .012, kraft, .002);
      for (const side of [-1, 1]) {
        box(g, 'headgear-paper-gusset', side * .171, 1.352, faceZ, .014, .398, .30, kraft, .005);
        box(g, 'headgear-paper-side-fold', side * .179, 1.352, faceZ, .004, .34, .017, crease, .001);
      }
      box(g, 'headgear-paper-top', 0, 1.557, faceZ, .354, .014, .31, kraft, .002);
      const front = geometry('headgear-paper-front', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-.153, -.207); shape.lineTo(.153, -.207);
        shape.quadraticCurveTo(.176, -.207, .176, -.184); shape.lineTo(.176, .184);
        shape.quadraticCurveTo(.176, .207, .153, .207); shape.lineTo(-.153, .207);
        shape.quadraticCurveTo(-.176, .207, -.176, .184); shape.lineTo(-.176, -.184);
        shape.quadraticCurveTo(-.176, -.207, -.153, -.207); shape.closePath();
        for (const x of [-.066, .066]) {
          const hole = new THREE.Path(); hole.absellipse(x, .026, .024, .018, 0, Math.PI * 2, true, 0); shape.holes.push(hole);
        }
        return new THREE.ShapeGeometry(shape, 8);
      });
      mesh(g, 'headgear-paper-front-cutouts', front, kraft, [0, 1.352, -.184]).rotation.y = Math.PI;
      box(g, 'headgear-paper-dark-lining', 0, 1.378, -.172, .21, .065, .008, printedInk, .001);
      for (const y of [1.15, 1.168]) box(g, 'headgear-paper-rolled-edge', 0, y, -.181, .355, .014, .018, crease, .003);
      const topFold = box(g, 'headgear-paper-top-fold', 0, 1.549, -.177, .352, .035, .015, crease, .002); topFold.rotation.x = -.22;
      box(g, 'headgear-paper-small-label', .10, 1.245, -.194, .071, .046, .003, cream, .001);
      box(g, 'headgear-paper-label-print', .10, 1.245, -.196, .041, .006, .002, crease, .001);
      // A hand-drawn smile makes the hood read as a friendly mascot, not a face.
      const smile = geometry('headgear-paper-smile', () => new THREE.TorusGeometry(.026, .003, 4, 12, Math.PI * .8));
      const print = mesh(g, 'headgear-paper-smile', smile, printedInk, [0, 1.295, -.186]); print.rotation.z = Math.PI * 1.1;
      return;
    }

    if (type === 'parcel-bag' || type === 'grocery-bag') {
      const bag = material(type === 'parcel-bag' ? '#bfa27f' : '#d2d7c3', 0, .93);
      const detail = material(type === 'parcel-bag' ? '#927658' : '#7e9d85', 0, .9);
      box(g, `headgear-${type}-shell`, 0, 1.35, faceZ, .35, .40, .29, bag, .025);
      box(g, `headgear-${type}-fold`, 0, 1.536, -.175, .34, .038, .014, detail, .004);
      box(g, `headgear-${type}-label`, 0, 1.335, -.177, .23, .17, .012, cream, .014);
      for (const x of [-.052,.052]) eye(x, 1.37, -.187, .025);
      box(g, `headgear-${type}-smile`, 0, 1.303, -.188, .06, .009, .005, detail, .003);
      if(type==='parcel-bag'){
        box(g, 'headgear-parcel-tape', 0, 1.55, faceZ, .055, .012, .30, cream, .002);
        box(g, 'headgear-parcel-stamp', .105, 1.24, -.181, .055, .038, .006, detail, .003);
      }else{
        const handle=geometry('headgear-grocery-handle',()=>new THREE.TorusGeometry(.075,.009,5,16,Math.PI));
        for(const z of [-.09,.04])mesh(g,'headgear-grocery-handle',handle,detail,[0,1.552,z]);
        box(g,'headgear-grocery-stripe',0,1.245,-.178,.27,.018,.009,detail,.003);
      }
      return;
    }

    if(type==='lightbulb' || type==='apple' || type==='orange' || type==='planet'){
      const paint=material(type==='lightbulb'?'#eadba9':type==='apple'?'#c97469':type==='orange'?'#dcaa68':'#83a7ae',type==='lightbulb'?.08:0,.78);
      mesh(g,`headgear-${type}-shell`,lowPoly,paint,[0,1.35,faceZ],[.225,.218,.20]);
      box(g,`headgear-${type}-neck-cover`,0,1.145,faceZ,.19,.075,.18,paint,.018);
      for(const x of [-.073,.073])eye(x,1.365,-.221,.025);
      const smile=geometry('headgear-round-smile',()=>new THREE.TorusGeometry(.025,.003,4,12,Math.PI*.8));
      mesh(g,`headgear-${type}-smile`,smile,printedInk,[0,1.295,-.221]).rotation.z=Math.PI*1.1;
      if(type==='lightbulb'){
        const metal=material('#9ca9a0',.5,.38);
        for(const y of [1.13,1.16,1.19])mesh(g,'headgear-bulb-base-ring',cylinder,metal,[0,y,faceZ],[.105,.018,.105]);
        box(g,'headgear-bulb-glint',-.09,1.42,-.21,.018,.07,.006,cream,.006).rotation.z=-.3;
      }else if(type==='planet'){
        const ring=geometry('headgear-planet-ring',()=>new THREE.TorusGeometry(.29,.018,6,32));
        const orbit=mesh(g,'headgear-planet-ring',ring,cream,[0,1.34,faceZ]);orbit.rotation.set(1.05,0,.28);
        ellipsoid(g,'headgear-planet-continent',.085,1.44,-.187,.068,.034,.015,cream);
      }else{
        const stem=material('#826c50'),leaf=material('#729679');
        box(g,`headgear-${type}-stem`,0,1.58,faceZ,.023,.08,.023,stem,.004).rotation.z=.18;
        const l=ellipsoid(g,`headgear-${type}-leaf`,.055,1.6,faceZ,.065,.025,.029,leaf);l.rotation.z=.35;
      }
      return;
    }

    if (type === 'drink-can') {
      const paint = material('#84a99b', .15, .46), silver = material('#c6d0c8', .72, .26);
      const canShape = geometry('headgear-can-shell', () => new THREE.LatheGeometry([
        [.145, -.20], [.163, -.191], [.178, -.166], [.18, -.135], [.18, .135],
        [.176, .165], [.159, .19], [.149, .198],
      ].map(([r, y]) => new THREE.Vector2(r, y)), 24));
      mesh(g, 'headgear-can-shell', canShape, paint, [0, 1.35, faceZ]);
      const disk = geometry('headgear-can-top', () => new THREE.CylinderGeometry(.149, .149, .012, 24));
      mesh(g, 'headgear-can-top', disk, silver, [0, 1.552, faceZ]);
      const lip = geometry('headgear-can-rolled-rim', () => new THREE.TorusGeometry(.151, .009, 5, 24));
      for (const y of [1.153, 1.548]) mesh(g, 'headgear-can-rolled-rim', lip, silver, [0, y, faceZ]).rotation.x = Math.PI / 2;
      // An open pull tab and recessed opening read clearly from the office camera.
      const ring = geometry('headgear-can-pull-tab', () => new THREE.TorusGeometry(.034, .008, 4, 12));
      const tab = mesh(g, 'headgear-can-pull-tab', ring, silver, [0, 1.569, faceZ - .013], [1, 1.45, 1]); tab.rotation.x = Math.PI / 2;
      const slot = mesh(g, 'headgear-can-opening', lowPoly, printedInk, [0, 1.56, faceZ - .078], [.033, .004, .022]); slot.castShadow = false;
      box(g, 'headgear-can-label', 0, 1.332, -.205, .195, .203, .008, cream, .032);
      for (const x of [-.043, .043]) eye(x, 1.365, -.212, .021);
      box(g, 'headgear-can-label-stripe', 0, 1.306, -.212, .073, .009, .003, paint, .003);
      for (const side of [-1, 1]) ellipsoid(g, 'headgear-can-label-cheek', side * .064, 1.333, -.212, .016, .008, .003, paint);
      return;
    }

    const fur = material(type === 'cat' ? '#9baeb2' : type === 'fox' ? '#c89161' : type === 'rabbit' ? '#d6cfbe' : type === 'panda' ? '#dedfd3' : '#b09a7f', 0, .93);
    const inner = material(type === 'cat' ? '#d1bbb0' : type === 'fox' ? '#a76f50' : type === 'rabbit' ? '#cdaaa5' : type === 'panda' ? '#52605c' : '#8d7660', 0, .95);
    // Closed, generously rounded mascot hood. No human head or neck is inside.
    mesh(g, `headgear-${type}-shell`, lowPoly, fur, [0, 1.345, faceZ], [.235, .224, .208]);
    box(g, `headgear-${type}-neck-cover`, 0, 1.143, faceZ, .20, .078, .185, fur, .024);
    for (const side of [-1, 1]) {
      if(type==='rabbit'){
        const ear=ellipsoid(g,'headgear-rabbit-long-ear',side*.13,1.565,faceZ,.055,.14,.05,fur);ear.rotation.z=-side*.18;
        const inset=ellipsoid(g,'headgear-rabbit-ear-inset',side*.13,1.57,-.073,.027,.09,.012,inner);inset.rotation.z=-side*.18;
      } else if (type === 'bear' || type === 'panda') {
        ellipsoid(g, `headgear-${type}-round-ear`, side * .173, 1.515, faceZ, .078, .079, .067, type==='panda'?inner:fur);
        ellipsoid(g, `headgear-${type}-ear-inset`, side * .173, 1.522, -.081, .044, .046, .015, inner);
      } else {
        const ear = mesh(g, `headgear-${type}-pointed-ear`, roundedEar, fur,
          [side * .146, 1.497, -.066], [1, type === 'fox' ? 1 : .82, 1]);
        ear.rotation.z = -side * .14;
        const inset = mesh(g, `headgear-${type}-ear-inset`, roundedEar, inner,
          [side * .146, 1.505, -.080], [.48, type === 'fox' ? .58 : .45, .09]);
        inset.rotation.z = -side * .14;
      }
      // These are sewn geometric prints on the mascot, with no facial skin below.
      const cheek = ellipsoid(g, `headgear-${type}-muzzle-panel`, side * .052,
        type === 'fox' ? 1.295 : 1.286, -.200, type === 'fox' ? .112 : .075, .069, .027, cream);
      cheek.rotation.z = side * (type === 'fox' ? -.20 : -.06);
      if(type==='panda')ellipsoid(g,'headgear-panda-eye-patch',side*.077,1.37,-.217,.05,.053,.015,inner);
      eye(side * .077, 1.37, type==='panda'?-.238:-.224, .026);
      ellipsoid(g, `headgear-${type}-cheek-stitch`, side * .135, 1.319, -.195, .017, .008, .005, inner);
    }
    ellipsoid(g, `headgear-${type}-mascot-nose`, 0, 1.312, -.232, .024, .017, .012, printedInk);
    for (const side of [-1, 1]) {
      const smile = rod(g, `headgear-${type}-muzzle-stitch`, new THREE.Vector3(0, 1.286, -.229),
        new THREE.Vector3(side * .023, 1.278, -.226), .003, printedInk); smile.castShadow = false;
    }
  }

  function worker(index: number, _stars: number, identity?: string): THREE.Group {
    const { look, headgear } = officeWorkerAppearance(index, identity);
    return cached(`worker/${look}/${headgear}`, () => {
      const g = new THREE.Group(); g.name = 'office-seated-employee';
      g.userData.headgear = headgear; g.userData.appearance = look;
      const skin = material(['#cfa98a', '#c3a184', '#d8b799'][look % 3]);
      const shirt = material(['#8b9f9a', '#9ba6bb', '#b09c8e', '#b4b39b', '#7e919d', '#a49baf'][look], 0, .94);
      const trousers = material(['#4f5a59', '#5c6269', '#655f58'][look % 3], 0, .93);
      const shoe = material('#393f3b');
      const trim = material('#e2d7be');
      // Compact seated doll proportions: a padded hip resting on the actual
      // chair, broad soft shoulders, relaxed elbows and feet flat on the floor.
      ellipsoid(g, 'employee-pelvis', 0, .565, -.005, .192, .095, .151, trousers);
      for (const side of [-1, 1]) {
        const x = side * .111;
        limb(g, 'employee-thigh', [x, .565, -.015], [x, .49, -.245], .089, trousers);
        limb(g, 'employee-shin', [x, .49, -.245], [x, .14, -.262], .068, trousers);
        box(g, 'employee-trouser-cuff', x, .147, -.264, .143, .042, .14, trousers, .013);
        box(g, 'employee-shoe', x, .078, -.323, .16, .105, .265, shoe, .043);
        box(g, 'employee-shoe-sole', x, .026, -.325, .17, .036, .277, trim, .014);
        box(g, 'employee-shoe-toe', x, .073, -.438, .149, .065, .044, trim, .020);
        for (const z of [-.327, -.352]) box(g, 'employee-shoe-lace', x, .135, z, .061, .006, .009, trim, .002);
      }
      const torso = box(g, 'employee-shirt-torso', 0, .879, -.012, .428, .422, .281, shirt, .089);
      torso.rotation.x = -.035;
      box(g, 'employee-shirt-hem', 0, .690, -.021, .37, .055, .269, shirt, .020);
      // Tonal seams and a little sewn label read as clothing rather than blocks.
      box(g, 'employee-shirt-seam', 0, .711, -.157, .285, .008, .004, trousers, .002);
      box(g, 'employee-shirt-label', .131, .731, -.163, .033, .025, .005, trim, .004);
      for (const side of [-1, 1]) {
        // Sleeves form a continuous bent volume; only small mitten-like hands
        // are exposed. Both hands rest at keyboard height, not on the arm rests.
        ellipsoid(g, 'employee-shirt-shoulder', side * .183, 1.016, -.008, .098, .084, .118, shirt);
        limb(g, 'employee-upper-arm', [side * .209, 1.012, -.018], [side * .258, .843, -.160], .074, shirt);
        limb(g, 'employee-forearm', [side * .258, .843, -.160], [side * .164, .821, -.366], .059, shirt);
        const cuff = box(g, 'employee-shirt-cuff', side * .168, .818, -.371, .118, .075, .054, shirt, .017);
        cuff.rotation.y = side * .37;
        ellipsoid(g, 'employee-hand', side * .158, .813, -.422, .047, .029, .064, skin);
        ellipsoid(g, 'employee-thumb', side * .117, .825, -.408, .020, .018, .030, skin);
      }
      box(g, 'employee-shirt-collar', 0, 1.112, -.024, .225, .078, .194, shirt, .021);
      addHeadgear(g, headgear);
      return g;
    });
  }

  function meetingTable(width: number, depth: number): THREE.Group {
    return cached(`meeting/${width}/${depth}`, () => {
      const g = new THREE.Group(); g.name = 'office-meeting-table';
      box(g, 'meeting-table-edge', 0, .738, 0, width, .075, depth, woodEdge, .045);
      box(g, 'meeting-table-top', 0, .775, 0, width - .014, .025, depth - .014, paleOak, .04);
      for (const x of [-width * .29, width * .29]) {
        box(g, 'meeting-table-pedestal', x, .365, 0, .115, .67, depth * .64, ivory, .026);
        box(g, 'meeting-table-plinth', x, .032, 0, .27, .045, depth * .69, frame, .016);
      }
      box(g, 'meeting-table-cable-hatch', 0, .79, 0, .26, .006, .095, frame, .012);
      // A folio and agenda book are visible from the room view.
      box(g, 'meeting-folder', -width * .27, .801, depth * .15, .21, .018, .28, bookColors[0], .007);
      box(g, 'meeting-agenda', width * .25, .80, -depth * .16, .22, .016, .27, paper, .004);
      return g;
    });
  }

  function shelf(): THREE.Group {
    return cached('shelf', () => {
      const g = new THREE.Group(); g.name = 'office-reference-shelf';
      box(g, 'shelf-recessed-back', 0, .98, .18, 1.10, 1.85, .032, darkOak, .007);
      for (const x of [-.55, .55]) box(g, 'shelf-side', x, .98, 0, .052, 1.9, .42, oak, .008);
      for (const y of [.055, .50, .95, 1.40, 1.91]) box(g, 'shelf-board', 0, y, 0, 1.15, .046, .43, paleOak, .007);
      for (const y of [.24, .68, 1.14]) {
        for (let i = 0; i < 7; i++) {
          const height = .25 + (i % 3) * .029;
          const book = box(g, 'shelf-project-binder', -.45 + i * .104, y + height / 2 - .16, -.025, .074, height, .25, bookColors[i % 5], .006);
          if (i === 6) book.rotation.z = -.12;
          box(g, 'shelf-binder-label', -.45 + i * .104, y + .015, -.153, .046, .055, .003, paper, .001);
          mesh(g, 'shelf-binder-finger-ring', cylinder, frame, [-.45 + i * .104, y - .055, -.157], [.009, .004, .009]).rotation.x = Math.PI / 2;
        }
      }
      box(g, 'shelf-storage-box', .22, 1.56, .015, .50, .255, .32, cloth, .012);
      box(g, 'shelf-box-label', .22, 1.56, -.15, .15, .045, .004, ivory, .003);
      box(g, 'shelf-box-handle', .22, 1.555, -.154, .06, .009, .004, frame, .002);
      return g;
    });
  }

  function plant(): THREE.Group {
    return cached('plant', () => {
      const g = new THREE.Group(); g.name = 'office-indoor-plant';
      mesh(g, 'plant-ceramic-pot', potGeometry, ceramic, [0, .195, 0]);
      mesh(g, 'plant-soil', cylinder, soil, [0, .378, 0], [.195, .012, .195]);
      const rim = geometry('pot-rim', () => new THREE.TorusGeometry(.207, .012, 8, 24));
      mesh(g, 'plant-pot-lip', rim, ceramic, [0, .381, 0]).rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.39996, height = .74 + (i % 3) * .17;
        const x = Math.cos(angle) * .20, z = Math.sin(angle) * .20;
        rod(g, 'plant-stem', new THREE.Vector3(0, .375, 0), new THREE.Vector3(x, height, z), .009, fern);
        for (let j = 0; j < 3; j++) {
          const a = angle + (j % 2 ? .8 : -.8), y = height - j * .115;
          const leaf = ellipsoid(g, 'plant-leaf', x + Math.cos(a) * .09, y, z + Math.sin(a) * .09, .071, .18, .022, j % 2 ? leafLight : fern);
          leaf.rotation.set(.55 + j * .13, -a, .3 + j * .14);
        }
      }
      return g;
    });
  }

  function lounge(): THREE.Group {
    return cached('lounge', () => {
      const g = new THREE.Group(); g.name = 'office-visitors-sofa';
      for (const x of [-.68, .68]) for (const z of [-.26, .26]) {
        mesh(g, 'lounge-oak-foot', cylinder, darkOak, [x, .095, z], [.035, .17, .035]);
      }
      box(g, 'lounge-lower-frame', 0, .264, 0, 1.60, .24, .74, seam, .055);
      box(g, 'lounge-back', 0, .685, .29, 1.57, .69, .16, fabric, .06);
      for (const x of [-.38, .38]) {
        box(g, 'lounge-seat-cushion', x, .45, -.02, .725, .16, .64, cloth, .055);
        box(g, 'lounge-back-cushion', x, .755, .18, .715, .42, .17, fabric, .055).rotation.x = -.09;
        box(g, 'lounge-seat-piping', x, .476, -.335, .62, .006, .006, seam, .002);
      }
      for (const x of [-.79, .79]) box(g, 'lounge-arm', x, .52, -.015, .15, .43, .79, fabric, .055);
      box(g, 'lounge-throw-cushion', -.56, .72, .04, .29, .31, .12, paleOak, .055).rotation.z = .15;
      return g;
    });
  }

  return { desk, executiveDesk, coffeeTable, chair, worker, meetingTable, shelf, plant, lounge,
    dispose() {
      if (disposed) return;
      disposed = true;
      mergedGeometries.forEach(shape => shape.dispose());
      geometries.forEach(shape => shape.dispose());
      materials.forEach(mat => mat.dispose());
      mergedGeometries.clear(); geometries.clear(); materials.clear(); models.clear();
    },
  };
}
