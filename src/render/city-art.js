import { world, random } from '../game/world.js';

const screenXFromX = 0.848,
  screenXFromY = 0.53,
  screenYFromX = -0.336,
  screenYFromY = 0.538,
  heightScale = 0.88;
const project = (x, y, z = 0) => ({
  x: screenXFromX * x + screenXFromY * y,
  y: screenYFromX * x + screenYFromY * y - heightScale * z,
});
const ink = '#394356';
function polygon(ctx, pts, fill, stroke, width = 0.8) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}
function line(ctx, a, b, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function oval(ctx, x, y, rx, ry, fill, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
}
function tint(hex, n) {
  const raw = parseInt(hex.slice(1), 16);
  return 'rgb(' + [16, 8, 0].map((s) => Math.max(0, Math.min(255, ((raw >> s) & 255) + n))).join(',') + ')';
}
function sprite(bounds, scale, draw) {
  const [left, top, width, height] = bounds,
    canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(-left, -top);
  draw(ctx);
  return { canvas, left, top, width: canvas.width / scale, height: canvas.height / scale };
}
function drawSprite(ctx, s, x, y) {
  ctx.drawImage(s.canvas, s.left + x, s.top + y, s.width, s.height);
}
function box(ctx, x, y, w, d, z, h, colors) {
  const q = (a, b, c) => project(a, b, c);
  polygon(ctx, [q(x, y, z), q(x, y + d, z), q(x, y + d, z + h), q(x, y, z + h)], colors[1]);
  polygon(ctx, [q(x, y + d, z), q(x + w, y + d, z), q(x + w, y + d, z + h), q(x, y + d, z + h)], colors[0]);
  polygon(ctx, [q(x, y, z + h), q(x + w, y, z + h), q(x + w, y + d, z + h), q(x, y + d, z + h)], colors[2]);
}
function buildingArt(building, hasHelipad) {
  const { w, d, h, p, style, sign } = building,
    r = random(building.seed),
    signH = sign === '98.6 FM' ? 45 : 16;
  return sprite(
    [
      -6,
      screenYFromX * w - heightScale * h - signH - 10,
      screenXFromX * w + screenXFromY * d + 16,
      -screenYFromX * w + screenYFromY * d + heightScale * h + signH + 22,
    ],
    1.65,
    (ctx) => {
      box(ctx, 0, 0, w, d, 0, h, [p.wall, p.shade, p.roof]);
      function facade(side) {
        const len = side ? d : w;
        const pt = (u, z) => (side ? project(0, u, z) : project(u, d, z));
        function panel(a, z, b, top, fill, stroke) {
          polygon(ctx, [pt(a, z), pt(b, z), pt(b, top), pt(a, top)], fill, stroke, 0.65);
        }
        panel(0, 1, len, 4, side ? tint(p.shade, -10) : tint(p.wall, -15));
        const floors = Math.max(1, Math.floor((h - 10) / 16)),
          pitch = (h - 8) / floors;
        const count = Math.max(2, Math.floor((len - 6) / (style === 0 ? 14 : 17))),
          gap = (len - 7) / count;
        for (let j = 0; j < floors; j++) {
          const z = 6 + j * pitch,
            high = Math.min(pitch * 0.6, 11);
          for (let k = 0; k < count; k++) {
            const start = 5 + k * gap,
              end = start + gap * (style === 2 ? 0.78 : 0.64);
            const lit = r() < 0.19;
            panel(start - 0.7, z - 0.7, end + 0.7, z + high + 0.8, side ? tint(p.shade, 15) : p.trim);
            panel(start, z, end, z + high, lit ? '#eec99d' : p.glass);
            panel(start, z + high - 2, end, z + high, lit ? '#f7dfad' : '#526c7d');
            line(
              ctx,
              pt(start + 1.4, z + 1),
              pt(Math.min(end, start + 4.5), z + high - 2),
              'rgba(220,236,218,.42)',
              0.75,
            );
            if (gap > 15) line(ctx, pt((start + end) / 2, z), pt((start + end) / 2, z + high), p.trim, 0.7);
          }
          if (style !== 1) panel(0, z + high + 2, len, z + high + 3.1, side ? tint(p.shade, 13) : p.trim);
        }
        if (!side) {
          const door = len * 0.48;
          panel(door - 4, 0, door + 4, 12, p.trim);
          panel(door - 3.3, 0.6, door + 3.3, 11.2, '#425b68');
          panel(door - 2.8, 4.2, door + 2.8, 10.5, '#829e9d');
          line(ctx, pt(door + 2, 4.8), pt(door + 2, 6.3), '#f3d29d', 0.7);
          if (sign && (style === 2 || ['VINYL', 'MOTEL', 'NEON', 'CAFÉ'].includes(sign))) {
            const edge = project(0, d + 6, 13);
            const fabric = sign === 'VINYL' || style === 2 ? '#c76f72' : '#55948e';
            const start = 4,
              end = w - 5,
              panels = Math.max(5, Math.round((end - start) / 7));
            for (let n = 0; n < panels; n++) {
              const a = start + ((end - start) * n) / panels,
                b = start + ((end - start) * (n + 1)) / panels;
              const color = n % 2 ? fabric : '#f4d1a5';
              polygon(ctx, [pt(a, 17), pt(b, 17), project(b, d + 6, 13), project(a, d + 6, 13)], color);
              polygon(
                ctx,
                [
                  project(a, d + 6, 13),
                  project(b, d + 6, 13),
                  project(b, d + 6, 11.1),
                  project(a, d + 6, 11.1),
                ],
                tint(color, -18),
              );
            }
            line(
              ctx,
              { x: edge.x + screenXFromX * start, y: edge.y + screenYFromX * start },
              { x: edge.x + screenXFromX * end, y: edge.y + screenYFromX * end },
              '#806969',
              0.5,
            );
          }
        }
        if (!side && sign) {
          const signW = Math.min(w * 0.85, Math.max(28, sign.length * 6.7 + 10)),
            l = (w - signW) / 2;
          panel(l - 1, h - 15, l + signW + 1, h - 4, '#d8b793');
          panel(l, h - 14.4, l + signW, h - 4.6, style === 0 ? '#476f77' : '#7b576b');
          const origin = pt(w / 2, h - 12.8);
          ctx.save();
          ctx.transform(screenXFromX, screenYFromX, 0, heightScale, origin.x, origin.y);
          ctx.textAlign = 'center';
          ctx.font = 'bold 7.9px Arial';
          ctx.fillStyle = '#ffe2ab';
          ctx.fillText(sign, 0, 0, signW - 3);
          ctx.restore();
        }
      }
      facade(true);
      facade(false);
      box(ctx, -1.6, -1.6, w + 3.2, d + 3.2, h - 2.4, 3, [p.trim, tint(p.shade, 19), p.roof]);
      polygon(
        ctx,
        [
          project(4, 4, h + 1),
          project(w - 4, 4, h + 1),
          project(w - 4, d - 4, h + 1),
          project(4, d - 4, h + 1),
        ],
        tint(p.roof, -13),
        p.trim,
        1.1,
      );
      if (!hasHelipad && style === 0 && w > 65) {
        const ht = 5 + w / 40;
        box(ctx, w * 0.23, d * 0.17, w * 0.5, d * 0.45, h + 1, ht, [tint(p.wall, 7), p.shade, p.trim]);
        box(ctx, w * 0.29, d * 0.21, w * 0.37, d * 0.32, h + ht + 1, 2.2, [p.wall, p.shade, p.roof]);
      } else if (!hasHelipad) {
        for (let k = 0; k < (w > 65 ? 2 : 1); k++) {
          const x = w * 0.23 + k * 16,
            y = d * 0.28;
          box(ctx, x, y, 11, 8, h + 1, 4.4, ['#a89890', '#88818a', '#ded1b6']);
          for (let j = 0; j < 4; j++)
            line(
              ctx,
              project(x + 2 + j * 2, y + 1, h + 5.6),
              project(x + 2 + j * 2, y + 7, h + 5.6),
              '#9e9b94',
              0.9,
            );
        }
      }
      if (style === 1 && w > 72) {
        for (let k = 0; k < 3; k++) {
          const x = w * 0.78 + k * 3;
          polygon(
            ctx,
            [
              project(x, d + 0.4, 4),
              project(x + 1.3, d + 0.4, 4),
              project(x + 1.3, d + 0.4, h + 4 - k),
              project(x, d + 0.4, h + 4 - k),
            ],
            p.trim,
          );
        }
      }
      if (['VINYL', 'NEON', 'MOTEL', 'MARINA'].includes(sign)) {
        const colors = { VINYL: '#b65f6e', NEON: '#986a88', MOTEL: '#4d8988', MARINA: '#5e8398' };
        const x = w * 0.13,
          y = d + 2,
          sy = h + 8,
          base = project(x, y, sy);
        const high = sign.length * 5.2 + 5;
        line(ctx, project(x, y - 3, sy - 3), project(x, y + 5, sy - 3), ink, 1.2);
        const ox = base.x + 1.5,
          oy = base.y;
        ctx.fillStyle = '#725d69';
        ctx.fillRect(ox + 1.8, oy + 1.2, 8, high);
        ctx.fillStyle = colors[sign];
        ctx.fillRect(ox, oy, 8.2, high);
        ctx.strokeStyle = '#f7c797';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(ox + 0.6, oy + 0.6, 7, high - 1.2);
        ctx.fillStyle = '#ffedb9';
        ctx.textAlign = 'center';
        ctx.font = 'bold 5.3px Arial';
        [...sign].forEach((letter, i) => ctx.fillText(letter, ox + 4.2, oy + 6.4 + i * 5.2));
      }
      if (sign === '98.6 FM') {
        const x = w * 0.62,
          y = d * 0.25;
        const top = project(x, y, h + 41);
        for (const offset of [-7, 7]) line(ctx, project(x + offset, y, h + 1), top, ink, 1.6);
        for (let k = 0; k < 4; k++) {
          const n = 6.5 - k * 1.4;
          line(
            ctx,
            project(x - n, y, h + 4 + k * 7),
            project(x + n - 1.3, y, h + 11 + k * 7),
            '#775c67',
            1,
          );
          line(
            ctx,
            project(x + n, y, h + 4 + k * 7),
            project(x - n + 1.3, y, h + 11 + k * 7),
            '#775c67',
            1,
          );
        }
        oval(ctx, top.x, top.y, 1.8, 1.8, '#ff987f');
      }
    },
  );
}
function palmArt(p) {
  const r = random(p.seed),
    size = p.size;
  return sprite([-43 * size, -93 * size, 88 * size, 98 * size], 1.45, (ctx) => {
    ctx.scale(size, size);
    const lean = (r() - 0.4) * 12,
      ht = 57 + r() * 10,
      cx = lean,
      cy = -ht;
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.quadraticCurveTo(2, -26, cx - 1.5, cy);
    ctx.lineTo(cx + 1.8, cy);
    ctx.quadraticCurveTo(6, -26, 2.8, 0);
    ctx.closePath();
    ctx.fillStyle = '#7c6c64';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1.1, -1);
    ctx.quadraticCurveTo(5, -26, cx + 1, cy);
    ctx.lineWidth = 1.45;
    ctx.strokeStyle = '#d8aa7c';
    ctx.stroke();
    const colors = [
      '#335f65',
      '#437b72',
      '#548778',
      '#326b6b',
      '#63917b',
      '#39736a',
      '#7d9c79',
      '#4e8872',
      '#5b9175',
    ];
    for (let f = 0; f < 9; f++) {
      const angle = (f * Math.PI * 2) / 9 + r() * 0.2,
        dx = Math.cos(angle) * (26 + r() * 11),
        dy = Math.sin(angle) * (14 + r() * 9);
      const point = (t) => ({ x: cx + dx * t, y: cy + dy * t - 14 * Math.sin(t * Math.PI) + 8 * t * t });
      for (let k = 1; k < 12; k++) {
        const t = k / 13,
          at = point(t),
          nxt = point(t + 0.13);
        const plume = (2.2 + 4 * Math.sin(t * Math.PI)) * (1 - t * 0.42);
        const sideX = Math.sin(angle) * plume,
          sideY = Math.cos(angle) * plume * 0.64;
        for (const side of [-1, 1])
          polygon(
            ctx,
            [at, { x: nxt.x + sideX * side + dx * 0.055, y: nxt.y + sideY * side + 4.5 }, point(t + 0.07)],
            colors[f],
          );
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let k = 1; k <= 16; k++) {
        const q = point(k / 16);
        ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = colors[f];
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    oval(ctx, cx, cy + 1.3, 3, 2.2, '#786951');
  });
}
function groundArt() {
  const w = world.width,
    h = world.height,
    p = world.step,
    r = random(725);
  return sprite(
    [
      -310,
      screenYFromX * w - 330,
      screenXFromX * w + screenXFromY * h + 724,
      -screenYFromX * w + screenYFromY * h + 655,
    ],
    1.15,
    (ctx) => {
      ctx.transform(screenXFromX, screenYFromX, screenXFromY, screenYFromY, 0, 0);
      const shape = (pts, fill, edge, l) =>
        polygon(
          ctx,
          pts.map(([x, y]) => ({ x, y })),
          fill,
          edge,
          l,
        );
      function rect(x, y, ww, hh, c) {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, ww, hh);
      }
      function path(pts, c, l) {
        ctx.strokeStyle = c;
        ctx.lineWidth = l;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      const shore = [
        [-110, -82],
        [-85, -119],
        [w + 54, -119],
        [w + 102, -75],
        [w + 107, 72],
        [w + 132, 261],
        [w + 115, 461],
        [w + 142, 688],
        [w + 117, h + 53],
        [w + 65, h + 109],
        [w - 120, h + 124],
        [w - 350, h + 112],
        [w - 654, h + 143],
        [35, h + 119],
        [-105, h + 59],
      ];
      for (const [l, c] of [
        [78, '#609b9e'],
        [48, '#77afa9'],
        [18, '#a4beb0'],
        [5, '#edcfac'],
      ])
        shape(shore, c, c, l);
      shape(shore, '#dcbf9b', '#e6d1af', 3);
      rect(-83, -80, w + 162, h + 158, '#b9a691');
      for (let k = 0; k < 4100; k++) {
        const x = -100 + r() * (w + 237),
          y = -100 + r() * (h + 230);
        if (x > w + 120 || y > h + 125) continue;
        rect(x, y, 0.65 + r() * 2, 1, r() < 0.5 ? 'rgba(255,235,193,.24)' : 'rgba(87,78,84,.12)');
      }
      for (const b of world.blocks) {
        const { x, y, size: s, type } = b;
        rect(x - 4, y - 4, s + 8, s + 8, '#c3a99e');
        rect(x, y, s, s, type === 'park' ? '#99a990' : type === 'pool' ? '#cfb9a8' : '#a5a393');
        if (type === 'park') {
          rect(x + 15, y + 13, s - 30, s - 28, '#8fa48b');
          path(
            [
              [x + 5, y + s - 7],
              [x + s * 0.46, y + s * 0.46],
              [x + s - 5, y + 12],
            ],
            '#d4bda0',
            11,
          );
          path(
            [
              [x + 12, y + 10],
              [x + s * 0.46, y + s * 0.46],
              [x + s - 8, y + s - 8],
            ],
            '#c7b59d',
            8,
          );
          rect(x + 20, y + s - 58, 54, 38, '#aa827c');
          rect(x + 23, y + s - 55, 48, 32, '#779790');
          ctx.strokeStyle = '#d9cec0';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(x + 25, y + s - 53, 44, 28);
          path(
            [
              [x + 47, y + s - 56],
              [x + 47, y + s - 22],
            ],
            '#f2dfbf',
            1.8,
          );
        } else if (type === 'pool') {
          rect(x + 77, y + 62, 64, 61, '#f1d4b4');
          rect(x + 80, y + 65, 58, 55, '#e6bba7');
          rect(x + 84, y + 69, 50, 47, '#65afb2');
          rect(x + 87, y + 72, 44, 41, '#6ebdc0');
          for (let k = 0; k < 12; k++) {
            const a = x + 88 + r() * 36,
              b = y + 74 + r() * 35;
            path(
              [
                [a, b],
                [a + 4, b - 1],
                [a + 8, b],
              ],
              '#acd6cb',
              1,
            );
          }
          for (let k = 0; k < 3; k++) {
            rect(x + 77 + k * 21, y + 127, 7, 14, '#ebd5b3');
            rect(x + 77 + k * 21, y + 128, 7, 3, '#c5827c');
          }
        } else {
          rect(x + s - 48, y + s - 65, 43, 57, '#8a8485');
          for (let k = 0; k < 4; k++) rect(x + s - 46, y + s - 62 + k * 13, 21, 1.4, '#d4bba0');
        }
      }
      const roads = new Path2D();
      for (let i = 0; i <= world.cols; i++) roads.rect(i * p - world.road / 2, -66, world.road, h + 132);
      for (let j = 0; j <= world.rows; j++) roads.rect(-67, j * p - world.road / 2, w + 134, world.road);
      ctx.strokeStyle = '#d6b8a7';
      ctx.lineWidth = 12;
      ctx.stroke(roads);
      ctx.fillStyle = '#575b69';
      ctx.fill(roads);
      ctx.save();
      ctx.clip(roads);
      for (let k = 0; k < 11500; k++) {
        const x = -65 + r() * (w + 130),
          y = -65 + r() * (h + 130);
        rect(x, y, 1 + r() * 3, 0.75, r() < 0.5 ? 'rgba(244,211,176,.15)' : 'rgba(31,47,65,.16)');
      }
      ctx.restore();
      function markings(horizontal) {
        const streets = horizontal ? world.rows : world.cols,
          segments = horizontal ? world.cols : world.rows;
        for (let n = 0; n <= streets; n++)
          for (let i = 0; i < segments; i++) {
            const pos = n * p,
              start = i * p + 53,
              end = (i + 1) * p - 53;
            function strip(a, b, t, c, l) {
              path(
                horizontal
                  ? [
                      [a, pos + t],
                      [b, pos + t],
                    ]
                  : [
                      [pos + t, a],
                      [pos + t, b],
                    ],
                c,
                l,
              );
            }
            for (const offset of [-1.7, 1.7]) strip(start, end, offset, '#cfab75', 1.35);
            for (const e of [-36, 36]) strip(start - 2, end + 2, e, '#b8ad9f', 1.15);
            for (const e of [-18, 18])
              for (let q = start + 10; q < end - 5; q += 48) strip(q, q + 11, e, '#c2b4a4', 1.25);
            for (let z = -30; z <= 31; z += 9) {
              strip(start - 7, start - 1, z, '#dccbbe', 4.3);
              strip(end + 1, end + 7, z, '#dccbbe', 4.3);
            }
          }
      }
      markings(true);
      markings(false);
      // Wooden boardwalks and mooring fingers along the two waterfronts.
      rect(-58, h + 76, w + 116, 13, '#9c817b');
      for (let i = -56; i < w + 58; i += 7) rect(i, h + 76, 1, 13, '#bf9c87');
      for (const x of [w - 116, w - 60, w - 4]) {
        rect(x, h + 83, 12, 116, '#a88a7a');
        for (let j = h + 84; j < h + 197; j += 6) rect(x, j, 12, 1.15, '#d3ad8c');
        rect(x - 1, h + 194, 14, 3, '#746d70');
      }
      for (let k = 0; k < 3; k++) {
        const x = w - 96 + k * 54,
          y = h + 155 - k * 12;
        shape(
          [
            [x, y - 16],
            [x + 5, y - 9],
            [x + 5, y + 12],
            [x + 1, y + 17],
            [x - 5, y + 11],
            [x - 5, y - 9],
          ],
          '#e9d4ae',
          '#587c83',
          1.3,
        );
        rect(x - 3, y - 5, 6, 12, k === 1 ? '#c77d78' : '#638a96');
      }
      for (const b of world.buildings) {
        shape(
          [
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w + b.h * 0.41, b.y + b.d + b.h * 0.32],
            [b.x + b.h * 0.41, b.y + b.d + b.h * 0.32],
            [b.x, b.y + b.d],
          ],
          'rgba(54,52,72,.22)',
        );
      }
      for (const tree of world.palms) {
        const { x, y, size } = tree;
        path(
          [
            [x, y],
            [x + 18 * size, y + 15 * size],
          ],
          'rgba(60,68,70,.22)',
          3,
        );
        for (let k = 0; k < 7; k++) {
          const a = (k * Math.PI * 2) / 7;
          path(
            [
              [x + 18 * size, y + 15 * size],
              [x + (18 + Math.cos(a) * 14) * size, y + (15 + Math.sin(a) * 11) * size],
            ],
            'rgba(61,70,69,.15)',
            3,
          );
        }
      }
      // Striped beach parasols and deck chairs visible from the coastal road.
      for (let k = 0; k < 8; k++) {
        const x = 30 + k * 135,
          y = h + 98 + (k % 3) * 3;
        for (let j = 0; j < 8; j++) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.arc(x, y, 8, (j * Math.PI) / 4, ((j + 1) * Math.PI) / 4);
          ctx.closePath();
          ctx.fillStyle = j % 2 ? '#f5d4ac' : k % 2 ? '#c47c82' : '#6e9e99';
          ctx.fill();
        }
        rect(x + 11, y - 2, 4, 12, '#e6d4ae');
      }
    },
  );
}
function openDoor(face, side) {
  const hinge = 8.6 * side,
    edge = 16.4 * side;
  face(
    [
      [5.4, hinge, 2.7],
      [1.4, edge, 2.9],
      [1.4, edge, 6.5],
      [5.4, hinge, 6.4],
    ],
    '#ddd8c7',
    ink,
    0.65,
  );
  face(
    [
      [5.4, hinge, 6.4],
      [1.4, edge, 6.5],
      [1.6, edge, 9.7],
      [4.6, hinge + side, 8.9],
    ],
    '#7895a5',
    ink,
    0.65,
  );
}
function carArt(ctx, c, main, braking, blueFlash = false) {
  const co = Math.cos(c.a),
    si = Math.sin(c.a);
  const q = (x, y, z = 0) => project(c.x + x * co - y * si, c.y + x * si + y * co, z);
  const face = (list, color, stroke, width) =>
    polygon(
      ctx,
      list.map((v) => q(...v)),
      color,
      stroke,
      width,
    );
  const sh = q(2, 1);
  oval(ctx, sh.x + 2.6, sh.y + 2.5, 18, 6.6, 'rgba(33,36,47,.30)');
  const hull = [
    [-18, -6.9],
    [-15.5, -8.7],
    [13, -8.7],
    [18, -5.8],
    [18, 5.8],
    [13, 8.7],
    [-15.5, 8.7],
    [-18, 6.9],
  ];
  const side = (y) => -(screenYFromX * si - screenYFromY * co) * y; // Positive for the side facing the camera.
  const near = side(1) > 0 ? 1 : -1;
  const door = c.officer?.door;
  const doorOffset = door ? -(door.x - c.x) * si + (door.y - c.y) * co : 0;
  const doorSide = Math.abs(doorOffset) > 8 ? Math.sign(doorOffset) : 0;
  if (doorSide === -near) openDoor(face, doorSide);
  for (const x of [-11, 11]) {
    const p = q(x, near * 8, 2.3);
    oval(ctx, p.x, p.y, 3.1, 3.05, '#343847');
    oval(ctx, p.x, p.y, 1.65, 1.65, '#c8b9a1');
  }
  const edges = hull
    .map((p, i) => ({ p, n: hull[(i + 1) % hull.length] }))
    .sort((u, v) => q(...u.p).y + q(...u.n).y - q(...v.p).y - q(...v.n).y);
  edges.forEach(({ p, n }) =>
    face(
      [
        [...p, 2.8],
        [...n, 2.8],
        [...n, 6.2],
        [...p, 6.2],
      ],
      tint(c.color, -41),
      ink,
      0.52,
    ),
  );
  face(
    hull.map((p) => [...p, 6.4]),
    c.color,
    ink,
    0.7,
  );
  if (c.patrol) {
    face(
      [
        [7, -6.7, 6.55],
        [13, -7.8, 6.55],
        [17, -5.5, 6.55],
        [17, 5.5, 6.55],
        [13, 7.8, 6.55],
        [7, 6.7, 6.55],
      ],
      '#333e50',
    );
    face(
      [
        [-17, -5.8, 6.55],
        [-12, -7.6, 6.55],
        [-10.3, -6.6, 6.55],
        [-10.3, 6.6, 6.55],
        [-12, 7.6, 6.55],
        [-17, 5.8, 6.55],
      ],
      '#394356',
    );
    line(ctx, q(-7, near * 8.7, 4.5), q(8, near * 8.7, 4.5), '#34475d', 1.4);
  }
  face(
    [
      [-11, -6.7],
      [-4, -7],
      [5, -6.2],
      [8, -5.4],
      [8, 5.4],
      [5, 6.2],
      [-4, 7],
      [-11, 6.7],
    ].map((p) => [...p, 6.7]),
    '#394c61',
  );
  face(
    [
      [-8.9, -6.2, 7],
      [-6, -4.6, 11],
      [-6, 4.6, 11],
      [-8.9, 6.2, 7],
    ],
    '#536878',
  );
  face(
    [
      [-6, -4.6, 11],
      [1.4, -4.7, 10.7],
      [1.4, 4.7, 10.7],
      [-6, 4.6, 11],
    ],
    tint(c.color, 15),
    ink,
    0.46,
  );
  face(
    [
      [1.4, -4.7, 10.7],
      [7, -5.7, 6.9],
      [7, 5.7, 6.9],
      [1.4, 4.7, 10.7],
    ],
    '#537184',
  );
  face(
    [
      [4, -4.5, 8.9],
      [6.7, -4.8, 7],
      [6.7, 1.4, 7],
      [4, 2.3, 8.9],
    ],
    '#88a5ac',
  );
  for (const y of [-1, 1]) {
    line(ctx, q(7, y * 5.7, 6.85), q(14.5, y * 5.7, 6.7), tint(c.color, 30), 0.8);
    line(ctx, q(14.7, y * 6.1, 6.6), q(16.1, y * 3.2, 6.6), '#ffe1a0', 2.0);
    line(ctx, q(-17, y * 5.6, 5.3), q(-17.4, y * 2.7, 5.3), braking ? '#ff6c64' : '#c36866', 1.7);
  }
  for (let k = 0; k < 3; k++)
    line(ctx, q(-12 - k * 1.5, -4.8, 6.7), q(-12 - k * 1.5, 4.8, 6.7), tint(c.color, -53), 0.68);
  if (main) {
    const pt = q(-2, near * 8.7, 5);
    line(ctx, q(-9, near * 8.8, 5), pt, '#e5d5b7', 0.8);
  }
  if (c.taxi || c.patrol) {
    const half = c.patrol ? 6.3 : 3.8;
    const panel = (y1, y2, z, color) =>
      face(
        [
          [-4.3, y1, z],
          [-0.8, y1, z],
          [-0.8, y2, z],
          [-4.3, y2, z],
        ],
        color,
      );
    panel(-half - 0.4, half + 0.4, 11.6, ink);
    if (c.patrol) {
      panel(-half, -0.65, 12.5, blueFlash ? '#b2efff' : '#468bcc');
      panel(0.65, half, 12.5, blueFlash ? '#bc5362' : '#ffaaa1');
      const glow = q(-2.5, blueFlash ? -4 : 4, 12.9);
      ctx.save();
      ctx.shadowColor = blueFlash ? '#69c5ff' : '#ff796e';
      ctx.shadowBlur = 5;
      oval(ctx, glow.x, glow.y, 1.65, 1.15, blueFlash ? '#e2f8ff' : '#fff2c8');
      ctx.restore();
    } else {
      panel(-half, half, 12.6, '#ffdc82');
      line(ctx, q(-1.5, -2.1, 12.65), q(-1.5, 2.1, 12.65), '#534d46', 0.7);
    }
  }
  if (doorSide === near) openDoor(face, doorSide);
}
function personArt(ctx, p, time, walk, player) {
  const base = project(p.x, p.y),
    { x, y } = base,
    phase = walk ? Math.sin(time * 10 + p.x * 0.04) * 2.1 : 0;
  oval(ctx, x + 2, y + 1, 5.2, 2.1, 'rgba(28,38,48,.26)');
  if (player) {
    const right = Math.cos(p.a || 0) * screenXFromX + Math.sin(p.a || 0) * screenXFromY >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(right, 1);
    const stroke = (x1, y1, x2, y2, color, width) =>
      line(ctx, { x: x1, y: y1 }, { x: x2, y: y2 }, color, width);
    // The driver's silhouette, cream print shirt and amber glasses also appear on the cover.
    stroke(-1.5, -7, -2.3 + phase, -0.8, '#29394c', 2.6);
    stroke(1.4, -7, 2 - phase, -0.8, '#40556b', 2.6);
    stroke(-2.3 + phase, -0.5, -1.2 + phase, 0, '#f3cda3', 1.5);
    stroke(2 - phase, -0.4, 3.3 - phase, 0, '#e9c79d', 1.6);
    oval(ctx, -1.1, -12.9, 3.35, 4.1, '#3e2c39');
    polygon(
      ctx,
      [
        { x: -3.3, y: -11.4 },
        { x: 1.8, y: -11.8 },
        { x: 3.2, y: -7.2 },
        { x: 1.5, y: -6.1 },
        { x: -3.1, y: -6.5 },
      ],
      '#f7dbad',
      '#5c4249',
      0.55,
    );
    polygon(
      ctx,
      [
        { x: -0.6, y: -11.3 },
        { x: 1.1, y: -11.1 },
        { x: 1.6, y: -7.3 },
        { x: -0.3, y: -7.5 },
      ],
      '#27756d',
    );
    stroke(-2.8, -9.9, -3.5 - phase * 0.15, -6.7, '#dfab83', 1.6);
    stroke(2.2, -9.9, 3.4 + phase * 0.15, -7.1, '#e9bc91', 1.5);
    for (const [px, py] of [
      [-2.2, -10],
      [-1.5, -7.7],
      [2, -8.7],
    ])
      oval(ctx, px, py, 0.62, 0.4, '#ad594b', -0.6);
    oval(ctx, 0.35, -13.5, 2.25, 2.65, '#d99a74');
    oval(ctx, -0.8, -15.4, 2.65, 1.6, '#442e38', -0.25);
    oval(ctx, -2.1, -14.4, 1.45, 2.3, '#52343c', 0.2);
    stroke(0.1, -14, 2.6, -14.2, '#edb65f', 0.82);
    oval(ctx, 1.75, -14, 0.7, 0.55, '#6c4f3b');
    oval(ctx, -1.3, -12.7, 0.5, 0.55, '#ffd776');
    ctx.restore();
    return;
  }
  line(ctx, { x: x - 1.1, y: y - 4.7 }, { x: x - 1.6 + phase, y }, '#354553', 2.35);
  line(ctx, { x: x + 1.1, y: y - 5.4 }, { x: x + 1.6 - phase, y: y + 0.2 }, '#465263', 2.35);
  line(ctx, { x, y: y - 9.7 }, { x, y: y - 5.2 }, p.color, 4.3);
  oval(ctx, x, y - 12.1, 2.3, 2.75, '#b77e64');
  oval(ctx, x - 0.45, y - 13.6, 2.45, 1.7, '#51414b');
}
function officerMark(ctx, x, y, r) {
  polygon(
    ctx,
    [
      { x: x - r, y: y - r },
      { x: x + r, y: y - r },
      { x: x + r * 0.78, y: y + r * 0.28 },
      { x, y: y + r },
      { x: x - r * 0.78, y: y + r * 0.28 },
    ],
    '#a9dfff',
    '#263950',
    1.1,
  );
  line(ctx, { x: x - r * 0.37, y: y - r * 0.3 }, { x: x + r * 0.37, y: y - r * 0.3 }, '#365e87', 0.85);
}
function officerArt(ctx, p, time) {
  const q = project(p.x, p.y);
  const stride = p.walking ? Math.sin(time * 16 + p.x * 0.035) : 0;
  const facing = screenXFromX * Math.cos(p.a) + screenXFromY * Math.sin(p.a) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.scale(facing, 1);
  oval(ctx, 1.2, 1, 5.8, 2.1, 'rgba(30,38,48,.30)');
  const limb = (x1, y1, x2, y2, color, width) =>
    line(ctx, { x: x1, y: y1 }, { x: x2, y: y2 }, color, width);
  const boot = 2.5 * stride;
  limb(-0.8, -6, -1.7 - boot, -0.5, '#23354c', 2.7);
  limb(0.8, -6, 1.4 + boot, -0.3, '#31435a', 2.8);
  limb(1.4 + boot, -0.3, 2.7 + boot, -0.25, '#222c3d', 1.7);
  const bob = Math.abs(stride) * 0.75;
  ctx.translate(0, -bob);
  limb(-1.5, -9.8, -3.1 + stride, -7.4, '#294565', 1.8);
  limb(0, -10.3, -0.3, -5.8, '#4775a1', 4.9);
  limb(-2, -5.7, 1.6, -5.7, '#293141', 1.3);
  limb(1.6, -9.9, 2.9 - stride, -8, '#96b7ca', 1.7);
  limb(2.9 - stride, -8, 3.6 - stride * 1.7, -9.1, '#c89979', 1.3);
  oval(ctx, 0.8, -9.3, 0.7, 0.9, '#f4d391');
  oval(ctx, 0.6, -12.6, 2.2, 2.5, '#bc896c');
  oval(ctx, 0.15, -14.6, 2.8, 1.65, '#243648');
  limb(-1.7, -14, 3.5, -14.1, '#648caa', 1);
  ctx.restore();
  officerMark(ctx, q.x, q.y - 21, 2.6);
}

export {
  screenXFromX,
  screenXFromY,
  screenYFromX,
  screenYFromY,
  heightScale,
  project,
  polygon,
  line,
  oval,
  sprite,
  drawSprite,
  buildingArt,
  palmArt,
  groundArt,
  carArt,
  personArt,
  officerArt,
  officerMark,
};
