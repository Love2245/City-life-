import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const source=fs.readFileSync('src/lib/culinaryIllustration.ts','utf8')+'\n'+fs.readFileSync('src/lib/culinarySceneArt.ts','utf8').replace(/^import .*;\r?\n/m,'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {roomBackground}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const dir=path.resolve('src/assets/ui/v1.475/restaurant');
for(const scene of ['cafe','western','netbar','netbar-night','street','fair']){
 fs.writeFileSync(path.join(dir,`${scene}-illustrated-v3.svg`),roomBackground(scene));
}
console.log('Generated six original, complete SVG room illustrations.');
