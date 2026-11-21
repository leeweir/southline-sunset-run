import {
  screenXFromX,
  screenXFromY,
  screenYFromX,
  screenYFromY,
  heightScale,
  project,
  polygon,
  line,
  oval,
} from './city-art.js';

function gate(ctx, p) {
  const dx = -Math.sin(p.a || 0),
    dy = Math.cos(p.a || 0);
  const at = (side, z) => project(p.x + dx * side, p.y + dy * side, z);
  const rail = 29;
  ctx.save();
  ctx.setLineDash([4, 3]);
  line(ctx, at(-rail, 0), at(rail, 0), '#ffdfa2', 2);
  ctx.restore();
  for (const side of [-rail, rail]) {
    const base = at(side, 0),
      top = at(side, 23);
    oval(ctx, base.x, base.y, 3, 1.6, '#4f424d');
    line(ctx, base, top, '#fbe2b2', 1.7);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 3; col++) {
        const x = top.x + col * 3,
          y = top.y + row * 3;
        polygon(
          ctx,
          [
            { x, y },
            { x: x + 3, y: y + 0.6 },
            { x: x + 3, y: y + 3.6 },
            { x, y: y + 3 },
          ],
          (row + col) % 2 ? '#4b4050' : '#fff0ce',
        );
      }
  }
}
function barrier(ctx, b, time) {
  const at = (d, z = 0) => project(b.x + (b.vertical ? 0 : d), b.y + (b.vertical ? d : 0), z);
  for (const d of [-14, 14]) {
    line(ctx, at(d - 3), at(d, 11), '#453c48', 2);
    line(ctx, at(d + 3), at(d, 11), '#453c48', 2);
    const light = at(d, 14);
    oval(ctx, light.x, light.y, 2.6, 2.8, Math.floor(time * 2) % 2 ? '#ffd989' : '#dd8056');
  }
  polygon(ctx, [at(-20, 5), at(20, 5), at(20, 12), at(-20, 12)], '#f1dfbd', '#564450', 0.8);
  for (let d = -19; d < 16; d += 9)
    polygon(ctx, [at(d, 5), at(d + 4, 5), at(d + 8, 12), at(d + 4, 12)], '#e8845b');
}
function garageSign(ctx, m) {
  const base = project(m.x, m.y + 24),
    x = base.x,
    y = base.y - 24;
  line(ctx, base, { x, y }, '#555665', 1.8);
  polygon(
    ctx,
    [
      { x: x - 6, y: y - 4 },
      { x: x + 6, y: y - 4 },
      { x: x + 6, y: y + 5 },
      { x: x - 6, y: y + 5 },
    ],
    '#3e686b',
    '#f3cf99',
    1,
  );
  ctx.save();
  ctx.fillStyle = '#ffe4b2';
  ctx.textAlign = 'center';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('P', x, y + 3);
  ctx.restore();
}
function personPin(ctx, p, escort) {
  const q = project(p.x, p.y, 23),
    x = q.x,
    y = q.y;
  if (escort) {
    line(ctx, { x: x - 2, y: y + 1 }, { x: x - 2, y: y - 4 }, '#f1c2ff', 1.6);
    line(ctx, { x: x - 2, y: y - 4 }, { x: x + 3, y: y - 5 }, '#f1c2ff', 1.8);
    line(ctx, { x: x + 3, y: y - 5 }, { x: x + 3, y }, '#f1c2ff', 1.5);
    oval(ctx, x - 3, y + 1, 2, 1.3, '#e3a6ee');
    oval(ctx, x + 2, y, 2, 1.3, '#e3a6ee');
  } else
    polygon(
      ctx,
      [
        { x, y: y - 4 },
        { x: x + 4, y },
        { x, y: y + 4 },
        { x: x - 4, y },
      ],
      '#ff9e6e',
      '#553b47',
      0.9,
    );
}
function beam(ctx, h) {
  if (!h.beam) return;
  const origin = project(h.x, h.y, h.z ?? 78),
    center = project(h.beam.x, h.beam.y);
  const glow = ctx.createLinearGradient(origin.x, origin.y, center.x, center.y);
  glow.addColorStop(0, 'rgba(255,238,168,.32)');
  glow.addColorStop(1, 'rgba(255,224,126,.07)');
  const ring = Array.from({ length: 40 }, (_, i) => {
    const a = (i * Math.PI) / 20;
    return project(h.beam.x + 44 * Math.cos(a), h.beam.y + 44 * Math.sin(a));
  });
  const angle = Math.atan2(origin.y - center.y, origin.x - center.x);
  const left = ring.reduce((best, p) =>
    p.x * Math.sin(angle) - p.y * Math.cos(angle) > best.x * Math.sin(angle) - best.y * Math.cos(angle)
      ? p
      : best,
  );
  const right = ring.reduce((best, p) =>
    p.x * Math.sin(angle) - p.y * Math.cos(angle) < best.x * Math.sin(angle) - best.y * Math.cos(angle)
      ? p
      : best,
  );
  polygon(ctx, [origin, left, right], glow);
  polygon(ctx, ring, h.spotted ? 'rgba(255,194,100,.34)' : 'rgba(255,232,142,.22)', '#eaca97', 0.9);
}
function helipad(ctx, pad, active) {
  const p = project(pad.x, pad.y, pad.z),
    stair = project(pad.stair.x, pad.stair.y, pad.z);
  ctx.save();
  ctx.transform(screenXFromX, screenYFromX, screenXFromY, screenYFromY, p.x, p.y);
  oval(ctx, 0, 0, 20, 20, active ? '#528778' : '#71877b');
  ctx.strokeStyle = active ? '#bbffe0' : '#e8d7af';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(0, 0, 17.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f9eac8';
  ctx.fillRect(-7, -8, 3.5, 16);
  ctx.fillRect(3.5, -8, 3.5, 16);
  ctx.fillRect(-4, -1.5, 8, 3);
  for (const [x, y] of [
    [-15, -15],
    [15, -15],
    [-15, 15],
    [15, 15],
  ])
    oval(ctx, x, y, 1.4, 1.4, active ? '#d3ffea' : '#f6deb0');
  ctx.restore();
  ctx.save();
  ctx.transform(screenXFromX, screenYFromX, screenXFromY, screenYFromY, stair.x, stair.y);
  ctx.fillStyle = '#375e59';
  ctx.fillRect(-7, -5, 14, 10);
  ctx.strokeStyle = '#a0e5c1';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-7, -5, 14, 10);
  for (let i = -4; i < 5; i += 3) line(ctx, { x: i, y: -3 }, { x: i, y: 3 }, '#bcf5cd', 1.2);
  ctx.restore();
}
function helicopter(ctx, h, t) {
  const p = project(h.x, h.y, (h.z ?? 78) + 8);
  ctx.save();
  ctx.translate(p.x, p.y);
  const facing = Math.cos(h.a || 0) * screenXFromX + Math.sin(h.a || 0) * screenXFromY < 0 ? -1 : 1;
  ctx.scale(facing, 1);
  if (h.lowPass) {
    const bottom = Math.min(24, h.z) * heightScale + 3;
    for (const x of [-4, 1]) line(ctx, { x, y: 4 }, { x, y: bottom }, '#604c49', 1.2);
    for (let y = 8; y < bottom; y += 4) line(ctx, { x: -4, y }, { x: 1, y }, '#ffcf80', 1.2);
    oval(ctx, -1.5, bottom, 3.6, 1.3, '#ffbc66');
  }
  const pts = (a) => a.map(([x, y]) => ({ x, y }));
  polygon(
    ctx,
    pts([
      [-5, 1],
      [-22, -3],
      [-26, -9],
      [-22, -10],
      [-18, -5],
      [0, -3],
    ]),
    '#425668',
    '#323546',
    1,
  );
  oval(ctx, 1, 0, 10, 5.5, '#e3dcc8');
  oval(ctx, 7, -1, 5.2, 3.6, '#52768a');
  line(ctx, { x: 5, y: -3.5 }, { x: 6.3, y: 1.5 }, '#a7c8cc', 0.8);
  line(ctx, { x: -6, y: 0 }, { x: 4, y: 2 }, '#395975', 2.2);
  oval(ctx, -1, -3, 1.4, 1, '#759ebc');
  line(ctx, { x: -5, y: 4 }, { x: -6, y: 7 }, '#493f4b', 1.4);
  line(ctx, { x: 6, y: 4 }, { x: 5, y: 7 }, '#493f4b', 1.4);
  line(ctx, { x: -10, y: 7 }, { x: 9, y: 7 }, '#393e4e', 1.5);
  line(ctx, { x: 0, y: -3 }, { x: 0, y: -8 }, '#3c4050', 1.4);
  const spin = h.mode === 'parked' ? 0.45 : t * 25;
  const dx = Math.cos(spin) * 21,
    dy = Math.sin(spin) * 4;
  line(ctx, { x: -dx, y: -8 - dy }, { x: dx, y: -8 + dy }, '#344651', 1.4);
  if (h.mode !== 'parked')
    line(
      ctx,
      { x: -Math.sin(spin) * 21, y: -8 + Math.cos(spin) * 4 },
      { x: Math.sin(spin) * 21, y: -8 - Math.cos(spin) * 4 },
      'rgba(57,72,79,.52)',
      1.3,
    );
  const tailSpin = h.mode === 'parked' ? 0.83 : t * 36;
  const tip = { x: Math.cos(tailSpin) * 3.9, y: Math.sin(tailSpin) * 3.9 };
  line(ctx, { x: -23 - tip.x, y: -6 - tip.y }, { x: -23 + tip.x, y: -6 + tip.y }, '#344651', 1.2);
  oval(ctx, -23, -6, 1.1, 1.1, '#ff927c');
  ctx.restore();
}

export { gate, barrier, garageSign, personPin, beam, helicopter, helipad };
