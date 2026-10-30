// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
const sound=vi.hoisted(()=>vi.fn());vi.mock('../src/lib/audio',()=>({playInteractionSound:sound}));
import {computerClicks} from '../src/lib/computerClicks';
afterEach(()=>{document.body.replaceChildren();sound.mockClear();});
describe('电脑桌面统一鼠标声',()=>{
  it('桌面、嵌套软件和按钮子元素一次点击只播放一次',()=>{
    const desktop=document.createElement('div'),app=document.createElement('section');app.innerHTML='<button><span>买入</span></button>';desktop.append(app);document.body.append(desktop);
    const a=computerClicks(desktop),b=computerClicks(app);app.querySelector('span')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(sound).toHaveBeenCalledExactlyOnceWith('mouse');a.destroy();b.destroy();
  });
  it('键盘激活、下拉选择、输入框操作有反馈，禁用控件和空白处无声',()=>{
    const node=document.createElement('div');node.innerHTML='<button disabled>禁用</button><input><select><option>行情</option></select>';document.body.append(node);const action=computerClicks(node);
    node.querySelector('button')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));node.dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(sound).not.toHaveBeenCalled();
    node.querySelector('input')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}));node.querySelector('select')!.dispatchEvent(new Event('change',{bubbles:true}));expect(sound).toHaveBeenCalledTimes(2);
    action.destroy();node.querySelector('input')!.click();expect(sound).toHaveBeenCalledTimes(2);
  });
});
