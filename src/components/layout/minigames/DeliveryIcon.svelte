<script lang="ts">
  import { deliverySymbols } from '../../../lib/deliveryArt';
  let { kind='bag',color='#bc825e' }: {kind?:'bag'|'parcel'|'car'|'scooter'|'van'|'person';color?:string}=$props();
  const box=$derived(kind==='parcel'?'-29 -27 58 54':kind==='bag'?'-26 -30 52 60':kind==='person'?'-14 -24 28 48':kind==='van'?'-40 -25 80 50':'-34 -23 68 46');
</script>
<svg viewBox={box} aria-hidden="true" style={`color:${color}`}><defs>{@html deliverySymbols}</defs><use href={`#dv-${kind}`} x={kind==='parcel'?-29:kind==='bag'?-26:kind==='person'?-14:kind==='van'?-40:-34} y={kind==='parcel'?-27:kind==='bag'?-30:kind==='person'?-24:kind==='van'?-25:-23} width={kind==='parcel'?58:kind==='bag'?52:kind==='person'?28:kind==='van'?80:68} height={kind==='parcel'?54:kind==='bag'?60:kind==='person'?48:kind==='van'?50:46}/></svg>
<style>svg{display:block;width:100%;height:100%;overflow:visible;}</style>
