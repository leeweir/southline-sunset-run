'use strict';
window.Southline = window.Southline || {};
(() => {
  const S = window.Southline;
  const step = 252,
    cols = 5,
    rows = 4,
    road = 84;
  const width = step * cols,
    height = step * rows;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
  const rnd = random(198608);
  const stops = [
    {
      id: 'vinyl',
      name: '落日唱片行',
      en: 'SUNSET VINYL',
      area: '棕榈海岸',
      x: 1.72 * step,
      y: 3 * step + 17,
      detail: '橱窗里摆着电台今晚要播的母带。',
    },
    {
      id: 'pier',
      name: '南湾码头',
      en: 'SOUTH PIER',
      area: '南湾港',
      x: 4.57 * step,
      y: 4 * step + 17,
      detail: '木栈桥伸进海湾，渡船在日落后靠岸。',
    },
    {
      id: 'motel',
      name: '海风旅馆',
      en: 'BREEZE MOTEL',
      area: '棕榈海岸',
      x: 0.49 * step,
      y: 2 * step + 16,
      detail: '池畔前台替夜班司机留着一部电话。',
    },
    {
      id: 'radio',
      name: '南湾电台',
      en: 'SOUTHLINE FM',
      area: '霓虹街区',
      x: 3.43 * step,
      y: step - 17,
      detail: '98.6 FM 的信号从这座天台发往全城。',
    },
    {
      id: 'club',
      name: '霓虹俱乐部',
      en: 'CLUB NEON',
      area: '霓虹街区',
      x: 1.47 * step,
      y: step + 17,
      detail: '入夜前，门口已经排起听现场的人。',
    },
    {
      id: 'stage',
      name: '海岸露天剧场',
      en: 'OCEAN STAGE',
      area: '南湾港',
      x: 5 * step - 16,
      y: 2.47 * step,
      detail: '沿海公路转角的露天舞台正在试音。',
    },
  ];
  const jobs = [
    { title: '落日母带', from: 'vinyl', to: 'pier', item: '母带', pay: 240, limit: 75 },
    { title: '午夜点播', from: 'motel', to: 'radio', item: '点播磁带', pay: 320, limit: 85 },
    { title: '最后一场', from: 'club', to: 'stage', item: '后台通行证', pay: 420, limit: 85 },
  ];
  const spot = (id) => stops.find((p) => p.id === id);
  const palettes = [
    { wall: '#dc8e81', shade: '#aa6975', roof: '#f3bc9c', trim: '#ffe0b8', glass: '#416977' },
    { wall: '#85afa6', shade: '#607e8a', roof: '#bfceac', trim: '#f6d19f', glass: '#475e73' },
    { wall: '#e4bc91', shade: '#b58784', roof: '#f1d4ac', trim: '#fff0c0', glass: '#5e7a86' },
    { wall: '#c99bae', shade: '#8a7793', roof: '#ebc4bc', trim: '#f9d5ac', glass: '#495d76' },
    { wall: '#9bbbc0', shade: '#778899', roof: '#ced5b9', trim: '#f7ca9b', glass: '#4d697a' },
  ];
  const buildings = [],
    palms = [],
    lamps = [],
    blocks = [];
  const signs = ['RIVIERA', 'DEL MAR', 'SOL', 'CAFÉ', 'PALMS', 'OCEAN', 'TIDES', 'LUNA', 'CORAL', 'VISTA'];
  function building(x, y, w, d, h, p, sign, style) {
    buildings.push({
      x,
      y,
      w,
      d,
      h,
      p: palettes[p % palettes.length],
      sign,
      style,
      seed: Math.floor(rnd() * 100000),
    });
  }
  function palm(x, y, size = 1) {
    palms.push({ x, y, size, seed: Math.floor(rnd() * 100000) });
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * step + road / 2 + 8,
        y = j * step + road / 2 + 8,
        size = step - road - 16;
      const type =
        (i === 2 && j === 2) || (i === 4 && j === 2)
          ? 'park'
          : (i === 0 && j === 1) || (i === 2 && j === 3)
            ? 'pool'
            : i === 4 && j === 3
              ? 'harbor'
              : 'city';
      blocks.push({ x, y, size, type, i, j });
      const code = i + j * cols;
      if (type === 'city') {
        const palette = (code + Math.floor(rnd() * 3)) % 5;
        const tall = j < 2 && i > 1;
        building(
          x + 9,
          y + 8,
          size - 23,
          66,
          (tall ? 62 : 31) + Math.floor(rnd() * 35),
          palette,
          signs[code % 10],
          code % 3,
        );
        let first = signs[(code + 4) % 10];
        if (i === 1 && j === 2) first = 'VINYL';
        if (i === 3 && j === 0) first = '98.6 FM';
        if (i === 1 && j === 0) first = 'NEON';
        building(
          x + 8,
          y + 89,
          80,
          53,
          (tall ? 47 : 28) + Math.floor(rnd() * 28),
          (palette + 1) % 5,
          first,
          code % 2,
        );
        if (code % 3 !== 0)
          building(x + 100, y + 94, 42, 45, 23 + Math.floor(rnd() * 18), (palette + 3) % 5, '', 1);
      } else if (type === 'pool') {
        building(x + 9, y + 9, 55, size - 25, 42, 1, 'MOTEL', 1);
        building(x + 79, y + 12, 63, 38, 27, 0, '', 0);
      } else if (type === 'harbor') {
        building(x + 16, y + 17, 107, 56, 35, 2, 'MARINA', 2);
      } else if (i === 4) {
        building(x + 71, y + 12, 64, 43, 30, 3, 'STAGE', 2);
      }
      palm(x + 2, y + size, 0.82 + rnd() * 0.16);
      if ((i + j) % 2 === 0 || j === 3) palm(x + size - 2, y + size + 2, 0.78 + rnd() * 0.24);
      if (type === 'park') {
        palm(x + size / 2, y + 24, 1.08);
        palm(x + 26, y + 59, 0.92);
      }
      lamps.push({ x: x + size * 0.58, y: y + size + 3 });
    }
  }
  for (let k = 0; k < 12; k++) palm(-38 + k * 119, height + 68 + (k % 2) * 9, 0.94 + rnd() * 0.22);
  for (let k = 0; k < 9; k++) palm(width + 69, -15 + k * 119, 0.93);
  const spawn = { x: step + 48, y: 3 * step + 17, a: 0 };
  const cars = [
    { id: 'tide', name: '潮汐 GT', color: '#38bdba', max: 175, ...spawn },
    {
      id: 'flamingo',
      name: '火烈鸟 S',
      color: '#ec7e83',
      max: 186,
      x: 2 * step + 68,
      y: 2 * step - 30,
      a: Math.PI,
    },
    {
      id: 'sol',
      name: '金日轿跑',
      color: '#e4b65f',
      max: 166,
      x: 4 * step + 26,
      y: step + 74,
      a: Math.PI / 2,
    },
  ];
  function allowed(x, y, r = 6) {
    if (x < -74 + r || y < -76 + r || x > width + 100 - r || y > height + 95 - r) return false;
    return !buildings.some((b) => x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.d + r);
  }
  function clearSegment(from, to, margin = 0) {
    const dx = to.x - from.x,
      dy = to.y - from.y;
    for (const b of buildings) {
      const left = b.x - margin,
        right = b.x + b.w + margin;
      const top = b.y - margin,
        bottom = b.y + b.d + margin;
      if (
        Math.max(from.x, to.x) < left ||
        Math.min(from.x, to.x) > right ||
        Math.max(from.y, to.y) < top ||
        Math.min(from.y, to.y) > bottom
      )
        continue;
      // Intersect the segment's parameter interval with each wall slab.
      const x1 = dx ? (left - from.x) / dx : -Infinity,
        x2 = dx ? (right - from.x) / dx : Infinity;
      const y1 = dy ? (top - from.y) / dy : -Infinity,
        y2 = dy ? (bottom - from.y) / dy : Infinity;
      const enter = Math.max(0, Math.min(x1, x2), Math.min(y1, y2));
      const leave = Math.min(1, Math.max(x1, x2), Math.max(y1, y2));
      if (enter <= leave) return false;
    }
    return true;
  }
  function vehicleExit(car, toward) {
    const cos = Math.cos(car.a),
      sin = Math.sin(car.a);
    const exits = [
      [0, 17],
      [0, -17],
      [-22, 0],
      [22, 0],
    ].map(([along, side]) => ({
      x: car.x + cos * along - sin * side,
      y: car.y + sin * along + cos * side,
      a: car.a,
    }));
    const free = (p) => allowed(p.x, p.y, 3) && clearSegment(car, p, 3);
    const doors = exits.slice(0, 2).filter(free);
    if (toward) doors.sort((a, b) => distance(a, toward) - distance(b, toward));
    return doors[0] || exits.slice(2).find(free);
  }

  // Pedestrians can cut through plazas and alleys. A shortest detour only needs
  // the corners of the solid buildings, including a little room for the runner.
  let corners;
  function walkRoute(from, to) {
    const canWalk = (a, b) => clearSegment(a, b, 2.95);
    if (canWalk(from, to)) return [to];
    if (!corners) {
      corners = [];
      for (const b of buildings) {
        for (const x of [b.x - 4.5, b.x + b.w + 4.5])
          for (const y of [b.y - 4.5, b.y + b.d + 4.5]) if (allowed(x, y, 3)) corners.push({ x, y });
      }
    }
    const cost = new Float64Array(corners.length).fill(Infinity);
    const prev = new Int32Array(corners.length).fill(-1);
    const open = new Set();
    for (let i = 0; i < corners.length; i++) {
      if (!canWalk(from, corners[i])) continue;
      cost[i] = distance(from, corners[i]);
      open.add(i);
    }
    while (open.size) {
      let best,
        score = Infinity;
      for (const i of open) {
        const estimate = cost[i] + distance(corners[i], to);
        if (estimate < score) {
          best = i;
          score = estimate;
        }
      }
      const corner = corners[best];
      if (canWalk(corner, to)) {
        const result = [to];
        for (let i = best; i >= 0; i = prev[i]) result.unshift(corners[i]);
        return result;
      }
      open.delete(best);
      if (!corner.links) {
        corner.links = [];
        for (let i = 0; i < corners.length; i++) {
          if (i !== best && canWalk(corner, corners[i])) corner.links.push(i);
        }
      }
      for (const i of corner.links) {
        const next = cost[best] + distance(corner, corners[i]);
        if (next >= cost[i]) continue;
        cost[i] = next;
        prev[i] = best;
        open.add(i);
      }
    }
    return [];
  }
  function district(p) {
    if (p.x > step * 3.78) return '南湾港';
    return p.y > step * 1.75 ? '棕榈海岸' : '霓虹街区';
  }
  function roadPoint(p) {
    const x = clamp(p.x, 0, width),
      y = clamp(p.y, 0, height);
    const gx = clamp(Math.round(x / step), 0, cols),
      gy = clamp(Math.round(y / step), 0, rows);
    const horizontal = Math.abs(y - gy * step) <= Math.abs(x - gx * step);
    const at = horizontal ? { x, y: gy * step } : { x: gx * step, y };
    const a = horizontal
      ? { x: Math.floor(x / step) * step, y: at.y }
      : { x: at.x, y: Math.floor(y / step) * step };
    const b = horizontal
      ? { x: Math.ceil(x / step) * step, y: at.y }
      : { x: at.x, y: Math.ceil(y / step) * step };
    return { at, ends: [a, b] };
  }
  function route(p, target) {
    if (!target) return [];
    const a = roadPoint(p),
      b = roadPoint(target);
    let best = [],
      cost = Infinity;
    const consider = (pts) => {
      const total = pts.reduce((n, q, i) => (i ? n + distance(q, pts[i - 1]) : 0), 0);
      if (total < cost) {
        cost = total;
        best = pts;
      }
    };
    const sameStreet =
      (a.at.x === b.at.x && a.at.x % step === 0) || (a.at.y === b.at.y && a.at.y % step === 0);
    if (sameStreet) consider([p, a.at, b.at, target]);
    for (const u of a.ends)
      for (const v of b.ends) {
        consider([p, a.at, u, { x: v.x, y: u.y }, v, b.at, target]);
        consider([p, a.at, u, { x: u.x, y: v.y }, v, b.at, target]);
      }
    return best.filter((q, i) => i === 0 || distance(q, best[i - 1]) > 1);
  }
  Object.assign(S, {
    world: {
      step,
      cols,
      rows,
      road,
      width,
      height,
      stops,
      jobs,
      spot,
      blocks,
      buildings,
      palms,
      lamps,
      cars,
      patrolCar: { name: '南湾巡逻车', color: '#e5decf', max: 180, patrol: true },
      spawn,
      allowed,
      clearSegment,
      walkRoute,
      vehicleExit,
      district,
      route,
      roadPoint,
    },
    clamp,
    distance,
    random,
  });
})();
