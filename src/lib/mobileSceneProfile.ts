import * as THREE from 'three';

/** A bounded light path for phones. Keep the original materials, textures and
 * geometry: changing a quality setting must never change an interaction owner. */
export function createMobileSceneProfile(renderer:THREE.WebGLRenderer,scene:THREE.Scene){
  const visibility=new Map<THREE.Light,boolean>();
  const originalShadows=renderer.shadowMap.enabled;
  let environment:THREE.Texture|null=scene.environment;
  const fill=new THREE.HemisphereLight('#e5eaf1','#9a8d78',.22);
  fill.name='mobile-soft-fill';scene.add(fill);
  const interior=new THREE.SpotLight('#ffe1b3',0,16,Math.PI*.42,1,2);interior.name='mobile-interior-key';scene.add(interior,interior.target);
  const sourcePosition=new THREE.Vector3();
  function prepare(){
    renderer.shadowMap.enabled=false;
    renderer.shadowMap.needsUpdate=false;
    if(scene.environment){environment=scene.environment;scene.environment=null;}
    let key:THREE.DirectionalLight|undefined;
    let indoor:THREE.Light|undefined;
    scene.traverse(object=>{
      if(!(object instanceof THREE.Light)||object===fill||object===interior)return;
      if(!visibility.has(object))visibility.set(object,object.visible);
      if(!visibility.get(object))return;
      if(object instanceof THREE.DirectionalLight&&(!key||object.intensity>key.intensity))key=object;
      if((object instanceof THREE.RectAreaLight||object instanceof THREE.PointLight||object instanceof THREE.SpotLight)&&(!indoor||object.intensity>indoor.intensity))indoor=object;
    });
    scene.traverse(object=>{
      if(!(object instanceof THREE.Light)||object===fill||object===interior)return;
      object.visible=!!visibility.get(object)&&(object instanceof THREE.HemisphereLight||object instanceof THREE.AmbientLight||object===key);
    });
    interior.intensity=indoor&&(key?.intensity??0)<.3?Math.min(70,indoor.intensity*6):0;
    if(indoor&&interior.intensity){indoor.getWorldPosition(sourcePosition);interior.position.copy(sourcePosition);interior.target.position.copy(sourcePosition);interior.target.position.y=.1;interior.color.copy(indoor.color);}
  }
  return {prepare,dispose(){
    for(const [light,visible]of visibility)light.visible=visible;
    visibility.clear();fill.removeFromParent();fill.dispose();interior.removeFromParent();interior.target.removeFromParent();interior.dispose();
    renderer.shadowMap.enabled=originalShadows;
    if(environment)scene.environment=environment;
  }};
}

/** Tint selected surfaces without drawing the room a second time. Only the
 * selected meshes borrow clones; shared materials elsewhere remain untouched. */
export function createMobileSelection(){
  const selected=new Map<THREE.Mesh,{source:THREE.Material|THREE.Material[];copies:THREE.Material[]}>();
  function clear(){for(const [mesh,entry]of selected){
    if(mesh.material===entry.copies[0]||mesh.material===entry.copies)mesh.material=entry.source;
    entry.copies.forEach(material=>material.dispose());
  }selected.clear();}
  function update(){for(const {source,copies}of selected.values()){
    const originals=Array.isArray(source)?source:[source];
    copies.forEach((copy,index)=>{
      copy.copy(originals[index]);
      if('color'in copy)(copy as THREE.MeshBasicMaterial).color.lerp(new THREE.Color('#fff6d9'),.16);
      if('emissive'in copy){const material=copy as THREE.MeshStandardMaterial;material.emissive.lerp(new THREE.Color('#8cacc4'),.12);material.emissiveIntensity=Math.max(.22,material.emissiveIntensity);}
    });
  }}
  return {update,select(objects:THREE.Object3D[]){
    clear();for(const object of objects)object.traverse(child=>{
      if(!(child instanceof THREE.Mesh)||selected.has(child))return;
      const source=child.material,copies=(Array.isArray(source)?source:[source]).map(material=>material.clone());
      selected.set(child,{source,copies});child.material=Array.isArray(source)?copies:copies[0];
    });update();
  },dispose:clear};
}
