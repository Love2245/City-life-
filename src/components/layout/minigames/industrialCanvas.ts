import { factoryBoardGeometry, type FactorySnapshot } from "./factoryShift";
import type { FactoryView } from "./factoryCanvas";

export type IndustrialTheme = "steel" | "aluminum" | "glass";
type Paint = string | CanvasGradient;

/** Industrial artwork is derived only from the supplied snapshot/view. It never advances game RNG. */
export function drawIndustrialScene(ctx: CanvasRenderingContext2D, state: FactorySnapshot, view: FactoryView, theme: IndustrialTheme) {
  const { width: W, height: H, visualTime, reducedMotion } = view;
  const geometry = factoryBoardGeometry(W, H, theme);
  const { x, y, w, h, scale } = geometry;
  const progress = Math.max(0, Math.min(1, state.animationProgress || 0));
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const operating = state.stage === "docking";
  const processed = state.stage !== "ready" && state.stage !== "docking";
  const preparation = processed ? 1 : operating ? ease(progress) : 0;
  const shipping = state.stage === "ship" || state.stage === "shipping";
  const checked = state.welded.filter(Boolean).length;
  const complete = checked === 4;
  let dx = view.dragX;
  if (state.stage === "shipping") dx += (W - x - dx + 25) * ease(progress);
  if (state.stage === "ready" && view.arrival > 0) dx -= Math.min(1, view.arrival / .3) * Math.min(35, x - 4);
  const materialX = x + dx;
  const compact = H < 260;
  const accent = theme === "steel" ? "#ffb347" : theme === "aluminum" ? "#b3dbe4" : "#a2ead3";

  function rr(px: number, py: number, width: number, height: number, radius: number, fill?: Paint, stroke?: string) {
    if (width <= 0 || height <= 0) return;
    ctx.beginPath(); ctx.roundRect(px, py, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)));
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function gradient(py: number, height: number, colors: string[]) {
    const result = ctx.createLinearGradient(0, py, 0, py + Math.max(1, height));
    colors.forEach((color, i) => result.addColorStop(i / Math.max(1, colors.length - 1), color));
    return result;
  }
  function text(label: string, px: number, py: number, font: string, color: string, align: CanvasTextAlign = "left") {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(label, px, py);
  }
  function circle(px: number, py: number, radius: number, fill?: Paint, stroke?: string) {
    ctx.beginPath(); ctx.arc(px, py, Math.max(.1, radius), 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  // Preserve the supplied steel sample's dark floor, furnace, roller rails and brushed metal palette.
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = gradient(0, H, theme === "glass" ? ["#263c3b", "#1d302f", "#172626"] : ["#29343d", "#202a31", "#182229"]);
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = theme === "glass" ? "#789b9222" : "#53616c25"; ctx.lineWidth = .6; ctx.beginPath();
  for (let gx = 0; gx < W; gx += 28) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
  for (let gy = 0; gy < H; gy += 28) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
  ctx.stroke();
  const padding = Math.max(3, Math.min(theme === "steel" ? 27 : 20, y - 12, H - y - h - 12));
  const bandHeight = compact ? 25 : 42;
  const bandY = Math.max(23, Math.min(57, y - padding - bandHeight - 6));
  rr(0, bandY, W, bandHeight, 0, "#131d24", "#42515d");
  const bayWidth = Math.min(94, W * .2);
  rr(17, bandY + 5, bayWidth, bandHeight - 10, 3, "#384049", "#56636c");
  if (theme === "steel") {
    rr(24, bandY + 9, bayWidth - 14, bandHeight - 18, 2, gradient(bandY + 9, bandHeight - 18, ["#ffba58", "#f56f2d", "#922c1a"]), "#fe9950");
    for (let slit = 0; slit < bayWidth - 19; slit += 12) { ctx.fillStyle = "#1d2728a0"; ctx.fillRect(30 + slit, bandY + 9, 3, bandHeight - 18); }
  } else {
    text(theme === "aluminum" ? "RECYCLE / AL" : "OPTICAL / QA", 24, bandY + bandHeight / 2 + 4, `${compact ? 8 : 10}px Consolas`, accent);
  }
  const flow = reducedMotion ? 0 : visualTime * 19;
  ctx.strokeStyle = "#647581"; ctx.lineWidth = 2;
  for (let arrow = bayWidth + 55 + flow % 115; arrow < W - 30; arrow += 115) {
    const cy = bandY + bandHeight / 2, arm = compact ? 6 : 9;
    ctx.beginPath(); ctx.moveTo(arrow, cy - arm); ctx.lineTo(arrow + arm, cy); ctx.lineTo(arrow, cy + arm); ctx.stroke();
  }

  if (theme === "glass") {
    // A backlit table stays fixed; the transparent pane moves above it.
    rr(x - 13, y - padding, w + 26, h + padding * 2, 5, "#2b4841", "#8aa99d");
    rr(x - 7, y - Math.min(padding, 8), w + 14, h + Math.min(padding, 8) * 2, 3, gradient(y, h, ["#c5e3ce", "#edf5df", "#a8cbbc"]), "#dcebd4");
    ctx.strokeStyle = "#6c8c7b55"; ctx.lineWidth = 1; ctx.beginPath();
    for (let line = 1; line < 8; line++) { ctx.moveTo(x + w * line / 8, y); ctx.lineTo(x + w * line / 8, y + h); }
    for (let line = 1; line < 5; line++) { ctx.moveTo(x, y + h * line / 5); ctx.lineTo(x + w, y + h * line / 5); }
    ctx.stroke();
    for (const bx of [x - 6, x + w + 6]) for (const by of [y - padding / 2, y + h + padding / 2]) circle(bx, by, 2, "#c4d6cc");
  } else {
    rr(x - 15, y - padding, w + 30, h + padding * 2, 5, "#34404a", "#60707d");
    rr(x - 8, y - Math.min(20, padding), w + 16, h + Math.min(20, padding) * 2, 3, "#1b272e");
    for (const rail of [x - 13, x + w + 2]) {
      rr(rail, y - padding + 4, 11, h + Math.max(0, padding * 2 - 8), 2, "#4a5d6b", "#8b9eaa");
      for (const boltY of [y - padding / 2, y + h + padding / 2]) circle(rail + 5.5, boltY, 2.5, "#afbcc4");
    }
  }

  if (shipping) {
    const dropX = Math.min(W - 40, Math.max(x + w + 18, W - 110));
    const dropWidth = Math.max(25, W - dropX - 12), dropY = Math.max(8, y - 6), dropHeight = Math.min(H - dropY - 8, h + 21);
    rr(dropX, dropY, dropWidth, dropHeight, 4, "#62897524", "#92bea1");
    const cy = y + h / 2;
    ctx.strokeStyle = "#bee6ba"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(dropX + 6, cy); ctx.lineTo(dropX + dropWidth - 6, cy); ctx.lineTo(dropX + dropWidth - 12, cy - 6);
    ctx.moveTo(dropX + dropWidth - 6, cy); ctx.lineTo(dropX + dropWidth - 12, cy + 6); ctx.stroke();
    if (dropWidth > 65 && h > 60) text(theme === "glass" ? "合格板" : "出货", dropX + dropWidth / 2, cy + 25, '12px "Microsoft YaHei"', "#c1dec7", "center");
  }

  function roller(px: number, py: number, width: number, height: number, phase: number) {
    rr(px - 7, py - 5, 20, height + 10, 3, "#182128", "#596773");
    rr(px + width - 13, py - 5, 20, height + 10, 3, "#182128", "#596773");
    rr(px, py, width, height, height / 2, gradient(py, height, ["#334550", "#9eafb8", "#dce5e8", "#8396a2", "#354650"]), "#25313b");
    ctx.save(); ctx.beginPath(); ctx.roundRect(px + 5, py + 1, Math.max(1, width - 10), Math.max(1, height - 2), height / 2); ctx.clip();
    ctx.strokeStyle = "#34455065"; ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 19) { ctx.beginPath(); ctx.moveTo(px + i, py); ctx.lineTo(px + i, py + height); ctx.stroke(); }
    const markY = py + height * (.5 + .32 * Math.sin(phase));
    ctx.strokeStyle = "#f3f9f6a0"; ctx.beginPath(); ctx.moveTo(px + 10, markY); ctx.lineTo(px + width - 10, markY); ctx.stroke(); ctx.restore();
    for (const endX of [px + 5, px + width - 5]) { ctx.fillStyle = "#5c707e"; ctx.beginPath(); ctx.ellipse(endX, py + height / 2, 5, Math.max(1, height / 2 - 2), 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#bfd1d7"; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function sparks(px: number, py: number, tint: string, strength = 1) {
    circle(px, py, reducedMotion ? 3 : 3 + strength * 3, "#fff3d4");
    if (reducedMotion) return;
    const maxDistance = Math.max(5, Math.min(44 * scale, py - 8, H - py - 8));
    for (let i = 0; i < 12; i++) {
      const phase = (visualTime * 3.6 + i * .163) % 1, angle = i * 2.4, distance = (8 + phase * maxDistance) * strength;
      const sx = px + Math.cos(angle) * distance, sy = py + Math.sin(angle) * distance * .6 + phase * phase * 7;
      ctx.strokeStyle = i % 3 ? tint : "#fff0bd"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(angle) * 5 * scale, sy + Math.sin(angle) * 4 * scale); ctx.stroke();
    }
  }

  function saw(px: number, cy: number, cuttingHeight: number, tint: string) {
    const radius = Math.max(9, Math.min(27, 22 * scale));
    const drop = Math.sin(Math.PI * progress), travel = Math.min(cuttingHeight * .69, Math.max(0, cy - radius - 12));
    const sawY = cy - travel * (1 - drop), mountY = Math.max(8, cy - cuttingHeight * .8 - radius - 17);
    rr(px - 11, mountY, 22, Math.max(12, sawY - mountY), 3, "#738590", "#b8c5ce");
    rr(px - 19, mountY, 38, 21, 3, "#3b4a55", "#8fa3b0"); rr(px - 11, mountY + 6, 22, 4, 1, tint);
    ctx.save(); ctx.translate(px, sawY); ctx.rotate(reducedMotion ? 0 : visualTime * 12); ctx.beginPath();
    for (let tooth = 0; tooth < 48; tooth++) {
      const angle = tooth / 48 * Math.PI * 2, r = radius * (tooth % 2 ? .85 : 1);
      if (tooth === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath(); ctx.fillStyle = "#c1d0d6"; ctx.fill(); ctx.strokeStyle = "#718796"; ctx.lineWidth = 1.5; ctx.stroke();
    circle(0, 0, radius * .66, "#6d8594"); circle(0, 0, 4, "#dce6e7"); ctx.restore();
    if (drop > .25) sparks(px, cy, tint, drop);
  }

  function steel() {
    const cy = y + 56.25 * scale, faceHeight = h * (.72 - .32 * preparation), depth = h * (.105 - .06 * preparation), top = cy - faceHeight / 2;
    const cool = shipping || complete;
    const rollerHeight = Math.max(12, Math.min(25, w * .055, H * .1));
    const rotation = reducedMotion ? 0 : visualTime * (operating ? 14 : 2);
    roller(x - 4, Math.min(H - rollerHeight - 8, y + h + 7), w + 8, rollerHeight, -rotation);
    ctx.save();
    if (!cool) { ctx.shadowColor = "#ff6d2870"; ctx.shadowBlur = Math.max(10, 24 * scale); }
    rr(materialX, top + depth, w, faceHeight, 3, cool ? "#2c414d" : "#932e1b", cool ? "#233039" : "#6d271c");
    rr(materialX, top, w, faceHeight, 3, gradient(top, faceHeight, cool ? ["#a2b4c0", "#758e9f", "#536a7b"] : ["#ffbe70", "#ff813b", "#d44624"]), cool ? "#acbec8" : "#ffd292");
    ctx.shadowBlur = 0; ctx.strokeStyle = cool ? "#d5e1e639" : "#ffdaa640"; ctx.lineWidth = 1;
    for (let row = 1; row <= 4; row++) { const lineY = top + faceHeight * row / 5; ctx.beginPath(); ctx.moveTo(materialX + 9, lineY); ctx.lineTo(materialX + w - 9, lineY + Math.sin(row * 5) * 2 * scale); ctx.stroke(); }
    for (let i = 0; i < 4; i++) {
      const cutX = materialX + (i + 1) * 72 * scale;
      if (state.welded[i]) {
        const gap = Math.max(2, 3.5 * scale); ctx.fillStyle = "#202a31"; ctx.fillRect(cutX - gap / 2, top - 1, gap, faceHeight + depth + 2);
        ctx.strokeStyle = cool ? "#c8d9e0" : "#ffc68a"; ctx.lineWidth = Math.max(1, scale); ctx.beginPath(); ctx.moveTo(cutX - gap / 2 - 1, top + 1); ctx.lineTo(cutX - gap / 2 - 1, top + faceHeight); ctx.stroke();
      } else if (preparation >= 1) {
        ctx.strokeStyle = "#872e2a65"; ctx.lineWidth = 1; ctx.setLineDash([3 * scale, 4 * scale]); ctx.beginPath(); ctx.moveTo(cutX, top + 3); ctx.lineTo(cutX, top + faceHeight - 3); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.restore();
    roller(x - 4, Math.max(8, y - 16 + (operating ? h * .12 * preparation : 0)), w + 8, rollerHeight, rotation);
    if (operating) {
      const guideY = y + h * .12 + rollerHeight; ctx.strokeStyle = "#ffbd75"; ctx.lineWidth = 2;
      for (const gx of [x + w * .08, x + w * .92]) { ctx.beginPath(); ctx.moveTo(gx, guideY - 13); ctx.lineTo(gx, guideY); ctx.lineTo(gx - 4, guideY - 5); ctx.moveTo(gx, guideY); ctx.lineTo(gx + 4, guideY - 5); ctx.stroke(); }
    }
    if (state.stage === "welding" && state.activePoint >= 0 && state.activePoint < 4) saw(materialX + (state.activePoint + 1) * 72 * scale, y + 56 * scale, h, "#ffbf65");
  }

  function aluminum() {
    const pressBeamY = Math.max(9, y - padding + 2), beamHeight = Math.min(17, Math.max(10, padding));
    rr(x - 4, pressBeamY, w + 8, beamHeight, 3, gradient(pressBeamY, beamHeight, ["#526974", "#b1c6cc", "#586e7a"]), "#9db6c1");
    for (let stripe = 0; stripe < w - 15; stripe += 23) { ctx.strokeStyle = "#d4b854"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 9 + stripe, pressBeamY + 3); ctx.lineTo(x + 3 + stripe, pressBeamY + beamHeight - 3); ctx.stroke(); }
    ctx.save(); ctx.translate(materialX, y); ctx.scale(scale, scale);
    rr(0, 22, 360, 112, 3, "#344a56");
    ctx.globalAlpha = .18 + .82 * preparation;
    rr(0, 16, 360, 112, 4, gradient(16, 112, ["#d8e4e7", "#96aeb8", "#f1f7f6", "#93a9b5"]), "#d8ecee");
    rr(0, 122, 360, 12, 2, gradient(122, 12, ["#abc6d0", "#5d7785"]), "#8ca5b3");
    ctx.globalAlpha = 1;
    if (preparation < 1) {
      ctx.globalAlpha = 1 - preparation;
      for (let i = 0; i < 13; i++) {
        const px = 8 + (i * 43 + state.boardId * 7) % 310, py = 28 + (i * 29) % 65;
        ctx.save(); ctx.translate(px, py); ctx.rotate((i % 5 - 2) * .11 * (1 - preparation));
        const partW = 29 + i % 4 * 9, partH = 12 + i % 3 * 5;
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(partW * .42, 0); ctx.lineTo(partW, 3); ctx.lineTo(partW - 3, partH); ctx.lineTo(4, partH - 2); ctx.closePath();
        ctx.fillStyle = gradient(0, partH, ["#d2e1e6", "#819eae", "#bcd0d6"]); ctx.fill(); ctx.strokeStyle = "#e5f0f3"; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    if (preparation > 0) {
      ctx.strokeStyle = "#eef7f650"; ctx.lineWidth = 1;
      for (let line = 0; line < 9; line++) { ctx.beginPath(); ctx.moveTo(8, 28 + line * 10); ctx.lineTo(352, 28 + line * 10); ctx.stroke(); }
      for (let i = 0; i < 4; i++) {
        const cutX = (i + 1) * 72;
        ctx.strokeStyle = state.welded[i] ? "#e6fbfb" : "#516f8055"; ctx.lineWidth = state.welded[i] ? 2.5 : 1;
        if (!state.welded[i]) ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(cutX, 19); ctx.lineTo(cutX, 129); ctx.stroke(); ctx.setLineDash([]);
        if (state.welded[i]) { rr(cutX - 2, 120, 4, 12, 0, "#2f6572"); circle(cutX, 28, 3, "#c6e4de"); }
      }
    }
    if (complete) text("AL / RECYCLED", 16, 116, "10px Consolas", "#3f5f6d");
    ctx.restore();
    if (operating) {
      const headY = pressBeamY + beamHeight + (y + h * .16 - pressBeamY - beamHeight) * Math.sin(Math.PI * progress);
      rr(x + 6, headY, w - 12, Math.max(12, h * .11), 3, gradient(headY, h * .11, ["#c2d5d9", "#596f7d"]), "#d8e6e8");
    }
    if (state.stage === "welding" && state.activePoint >= 0 && state.activePoint < 4) saw(materialX + (state.activePoint + 1) * 72 * scale, y + 75 * scale, h * .68, "#b9e9ed");
  }

  function glass() {
    ctx.save(); ctx.translate(materialX, y); ctx.scale(scale, scale);
    rr(3, 5, 360, 230.4, 3, "#1b514c55");
    rr(0, 0, 360, 230.4, 3, gradient(0, 230.4, ["#b4efd75c", "#7dc9be45", "#498f8a66"]), complete ? "#e0fff1" : "#b8e5d3");
    rr(3, 3, 354, 224.4, 1, undefined, "#c5efdf70");
    ctx.beginPath(); ctx.moveTo(13, 7); ctx.lineTo(90, 7); ctx.lineTo(273, 223); ctx.lineTo(208, 223); ctx.closePath(); ctx.fillStyle = complete ? "#ffffff15" : "#e6f7ed25"; ctx.fill();
    const haze = (1 - checked / 4) * (operating ? .17 : .12);
    ctx.fillStyle = `rgba(221,236,213,${haze})`; ctx.fillRect(6, 6, 348, 218.4);
    const points = [{ x: 141, y: 75 }, { x: 221, y: 75 }, { x: 221, y: 146 }, { x: 141, y: 146 }];
    const names = ["气泡", "划痕", "裂纹", "厚度"];
    for (let i = 0; i < 4; i++) {
      const point = points[i];
      if (state.welded[i]) {
        ctx.strokeStyle = "#3b968160"; ctx.lineWidth = 1; ctx.strokeRect(point.x - 24, point.y - 22, 48, 44);
        if (scale > .65) text("PASS", point.x, point.y + 31, "9px Consolas", "#397e6b", "center");
        continue;
      }
      ctx.save(); ctx.globalAlpha = .58;
      if (i === 0) { circle(point.x - 15, point.y - 9, 5, undefined, "#669d91"); circle(point.x + 13, point.y + 10, 3, undefined, "#7db2a5"); circle(point.x + 12, point.y - 12, 2, undefined, "#5e9289"); }
      else if (i === 1) { ctx.strokeStyle = "#689b9066"; ctx.lineWidth = 1; for (let line = 0; line < 3; line++) { ctx.beginPath(); ctx.moveTo(point.x - 20, point.y - 9 + line * 7); ctx.lineTo(point.x + 19, point.y - 15 + line * 7); ctx.stroke(); } }
      else if (i === 2) { ctx.strokeStyle = "#68968d70"; ctx.beginPath(); ctx.moveTo(point.x - 13, point.y - 17); ctx.lineTo(point.x - 2, point.y - 6); ctx.lineTo(point.x - 8, point.y + 1); ctx.lineTo(point.x + 8, point.y + 17); ctx.moveTo(point.x - 2, point.y - 6); ctx.lineTo(point.x + 13, point.y - 11); ctx.stroke(); }
      else { ctx.strokeStyle = "#5c8d8277"; ctx.lineWidth = 1; for (let tick = 0; tick < 6; tick++) { ctx.beginPath(); ctx.moveTo(point.x - 20, point.y - 17 + tick * 6); ctx.lineTo(point.x - 20 + (tick % 2 ? 6 : 10), point.y - 17 + tick * 6); ctx.stroke(); } }
      ctx.restore();
      if (scale > .65) text(names[i], point.x, point.y + 31, '9px "Microsoft YaHei"', "#4a8072", "center");
    }
    if (operating) {
      const sx = 16 + 328 * progress;
      rr(sx - 16, 6, 32, 218.4, 0, gradient(0, 230.4, ["#f3ffe54d", "#efffd5b3", "#dcffd54d"]));
      ctx.strokeStyle = "#fbffeac0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, 6); ctx.lineTo(sx, 224.4); ctx.stroke();
    }
    if (state.stage === "welding" && state.activePoint >= 0 && state.activePoint < 4) {
      const point = points[state.activePoint], sx = point.x - 24 + progress * 48;
      rr(point.x - 26, point.y - 24, 52, 48, 2, "#c8fff32f", "#f5ffe4a0");
      ctx.strokeStyle = "#f4ffe5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, point.y - 24); ctx.lineTo(sx, point.y + 24); ctx.stroke();
    }
    text(complete ? "OPTICAL QA / PASS" : "GLASS / 04 ZONES", 14, 211, "10px Consolas", complete ? "#3a806b" : "#689084");
    ctx.restore();
  }

  if (theme === "steel") steel();
  else if (theme === "aluminum") aluminum();
  else glass();

  if (state.stage === "ready") { ctx.strokeStyle = `${accent}a0`; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.strokeRect(materialX - 5, y - 3, w + 10, h + 6); ctx.setLineDash([]); }
  ctx.restore();
  return { ...geometry, dx };
}
