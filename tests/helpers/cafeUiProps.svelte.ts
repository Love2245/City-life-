export function cafeUiProps(onOrder:()=>void,onNpc:()=>void){
  const props=$state({night:false,linPresent:true,linKnown:false,onOrder,onNpc});
  return props;
}
