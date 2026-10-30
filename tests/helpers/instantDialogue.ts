/** 非字幕测试使用系统“减少动态效果”模式；逐字与两次点击契约由 dialogueRevealUi 单独覆盖。 */
import {beforeAll,afterAll,vi} from 'vitest';
beforeAll(()=>{vi.stubGlobal('matchMedia',(media:string)=>({matches:media==='(prefers-reduced-motion: reduce)',media,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return true;}}));});
afterAll(()=>vi.unstubAllGlobals());
