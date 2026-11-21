import { world, clamp, distance } from './world.js';

const cruiseHeight = 150,
  approachRange = 58;
const pads = [
  ['vinyl', '落日唱片行', 'VINYL', 310, 643],
  ['tides', '潮汐大厦', 'TIDES', 311, 814],
  ['neon', '霓虹俱乐部', 'NEON', 310, 139],
  ['luna', '月湾酒店', 'LUNA', 563, 310],
  ['palm', '棕榈公寓', 'PALMS', 1067, 58],
  ['riviera', '海滨酒店', 'RIVIERA', 59, 562],
  ['coral', '珊瑚中心', 'CORAL', 815, 310],
  ['marina', '港务大楼', 'MARINA', 1074, 823],
].map(([id, name, sign, x, y]) => {
  const b = world.buildings.find((b) => b.sign === sign && b.x === x && b.y === y);
  const cx = b.x + b.w / 2,
    cy = b.y + b.d / 2;
  const doors = [
    [
      { x: cx, y: b.y - 9 },
      { x: cx, y: b.y + 8 },
    ],
    [
      { x: cx, y: b.y + b.d + 9 },
      { x: cx, y: b.y + b.d - 8 },
    ],
    [
      { x: b.x - 9, y: cy },
      { x: b.x + 8, y: cy },
    ],
    [
      { x: b.x + b.w + 9, y: cy },
      { x: b.x + b.w - 8, y: cy },
    ],
  ]
    .filter(([p]) => world.allowed(p.x, p.y, 4) && world.clearSegment(p, world.roadPoint(p).at, 3))
    .sort(([a], [b]) => distance(a, world.roadPoint(a).at) - distance(b, world.roadPoint(b).at));
  const [street, stair] = doors[0];
  return {
    id,
    name,
    building: b,
    x: cx + (cx - stair.x) * 0.21,
    y: cy + (cy - stair.y) * 0.21,
    z: b.h + 2,
    street,
    stair,
  };
});
const padById = (id) => pads.find((p) => p.id === id);
const approach = (a, b, change) => a + clamp(b - a, -change, change);
const validPoint = (p) => p && [p.x, p.y].every(Number.isFinite);
const heading = (p) => (Number.isFinite(p.a) ? p.a : 0);
const onRoof = (p, pad) => {
  const b = pad.building;
  return { x: clamp(p.x, b.x + 4, b.x + b.w - 4), y: clamp(p.y, b.y + 4, b.y + b.d - 4), a: heading(p) };
};
function skySight(from, to, fromZ, toZ) {
  const count = Math.max(1, Math.ceil(distance(from, to) / 10));
  for (let i = 1; i < count; i++) {
    const t = i / count,
      x = from.x + (to.x - from.x) * t,
      y = from.y + (to.y - from.y) * t,
      z = fromZ + (toZ - fromZ) * t;
    if (world.buildings.some((b) => b.h + 1 > z && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.d))
      return false;
  }
  return true;
}
function towards(from, to) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const angle = Math.atan2(-0.53 * dx + 0.85 * dy, 0.85 * dx + 0.53 * dy);
  return ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}
class Flight {
  constructor(sim) {
    this.sim = sim;
    this.craft = [];
    this.pilot = null;
    this.roof = null;
    this.destination = null;
  }
  get height() {
    return this.pilot?.z || this.roof?.z || 0;
  }
  occupied(pad) {
    return this.craft.some((h) => h !== this.pilot && h.padId === pad.id && h.mode === 'parked');
  }
  nearestPad(from = this.sim.player) {
    let best = null;
    for (const p of pads)
      if (!this.occupied(p) && (!best || distance(from, p) < distance(from, best))) best = p;
    return best;
  }
  get landingPad() {
    if (this.pilot?.mode !== 'cruise') return null;
    const p = this.nearestPad(this.pilot);
    return p && distance(this.pilot, p) <= approachRange ? p : null;
  }
  get guidePad() {
    const p = padById(this.destination);
    return p && !this.occupied(p) ? p : this.nearestPad();
  }
  get streetStair() {
    if (this.pilot || this.roof || this.sim.car) return null;
    return pads.find(
      (p) => distance(this.sim.foot, p.street) < 26 && world.clearSegment(this.sim.foot, p.street, 3),
    );
  }
  get boardable() {
    const sim = this.sim;
    if (this.pilot || sim.car) return null;
    const h = sim.wanted.helicopter;
    if (
      h?.lowPass &&
      distance(h, sim.foot) < 30 &&
      Math.abs(h.z - this.height) <= 28 &&
      skySight(h, sim.foot, h.z, this.height + 5)
    )
      return h;
    if (this.roof)
      return this.craft.find(
        (c) => c.mode === 'parked' && c.padId === this.roof.id && distance(c, sim.foot) < 37,
      );
    return null;
  }
  get actionLabel() {
    const h = this.pilot;
    if (h) {
      if (h.mode === 'parked') return '起飞';
      if (h.mode === 'cruise') return this.landingPad ? '降落楼顶' : '楼顶航图';
      return '';
    }
    const craft = this.boardable;
    if (craft && craft === this.sim.wanted.helicopter) return '夺取直升机';
    if (this.roof)
      return distance(this.sim.foot, this.roof.stair) < 23
        ? '走楼梯下楼'
        : craft
          ? '登上直升机'
          : '寻找楼梯';
    if (this.streetStair) return '上天台';
    return '';
  }
  get briefing() {
    const h = this.pilot,
      roof = this.roof;
    if (h) {
      const p = padById(h.padId);
      if (h.mode === 'lift') return ['警用直升机', '正在爬升', '升空后用方向键飞行'];
      if (h.mode === 'landing') return ['进场降落', p.name, '正在对准楼顶 H 标记'];
      if (h.mode === 'parked') return ['楼顶停机坪', p.name, 'E 离舱 · F 再次起飞'];
      const land = this.landingPad,
        target = this.guidePad;
      return [
        '空中驾驶',
        land ? '可降落 · ' + land.name : target ? towards(h, target) + ' ' + target.name : '城市上空',
        land
          ? 'F 降落 · 触屏点「降落楼顶」'
          : target
            ? Math.round(distance(h, target) * 0.62) + ' 米 · 地图可选楼顶'
            : '方向键飞行，松开悬停',
      ];
    }
    if (roof)
      return [
        '天台步行',
        roof.name,
        distance(this.sim.foot, roof.stair) < 23
          ? 'F 下楼到街边'
          : towards(this.sim.foot, roof.stair) + ' 走到绿色楼梯口下楼',
      ];
    const hostile = this.sim.wanted.helicopter;
    if (hostile?.lowPass && !this.sim.car)
      return [
        '五星空巡',
        this.boardable ? '悬梯已到身边' : '直升机正在低飞',
        this.boardable ? '按 F 或点「夺取直升机」' : '靠近悬梯的橙色标记',
      ];
    return null;
  }
  board(h) {
    if (!h || h !== this.boardable) return false;
    const sim = this.sim,
      theft = h === sim.wanted.helicopter;
    let clearedPad = null;
    if (theft) {
      sim.wanted.helicopter = null;
      sim.wanted.aircraftTaken = true;
      let n = 1;
      while (this.craft.some((c) => c.id === 'air-' + n)) n++;
      if (!this.nearestPad()) {
        const recovered = this.craft.shift();
        clearedPad = padById(recovered.padId);
      }
      Object.assign(h, {
        id: 'air-' + n,
        beam: null,
        spotted: false,
        lowPass: false,
        vx: 0,
        vy: 0,
        mode: 'lift',
        padId: null,
      });
      this.craft.push(h);
    }
    this.pilot = h;
    this.roof = null;
    sim.carId = null;
    sim.walking = false;
    sim.selectedVehicle = null;
    this.destination = clearedPad?.id || null;
    sim.save();
    sim.emit(
      'pickup',
      clearedPad
        ? '警方收回旧机 · ' + clearedPad.name + '已腾空'
        : theft
          ? '已夺下警用直升机 · 正在起飞'
          : '已登机 · 按 F 起飞',
    );
    return true;
  }
  exit() {
    const h = this.pilot;
    if (!h || h.mode !== 'parked') return false;
    const p = padById(h.padId),
      dx = p.stair.x - p.x,
      dy = p.stair.y - p.y,
      n = Math.hypot(dx, dy) || 1;
    this.roof = p;
    this.pilot = null;
    this.sim.foot = onRoof({ x: p.x + (dx * 21 - dy * 8) / n, y: p.y + (dy * 21 + dx * 8) / n, a: h.a }, p);
    this.sim.walking = false;
    this.sim.save();
    this.sim.emit('notice', '已到天台 · 绿色楼梯通往街边');
    return true;
  }
  action() {
    const sim = this.sim,
      h = this.pilot;
    if (h) {
      if (h.mode === 'parked') {
        h.mode = 'lift';
        h.padId = null;
      } else if (h.mode === 'cruise') {
        const p = this.landingPad;
        if (!p) {
          sim.emit('notice', '飞近标有 H 的楼顶，再按 F 降落');
          return;
        }
        h.mode = 'landing';
        h.padId = p.id;
        h.vx = h.vy = 0;
        sim.emit('notice', '开始降落 · ' + p.name);
      } else return;
      sim.save();
      return;
    }
    const craft = this.boardable;
    if (craft && craft === sim.wanted.helicopter) {
      this.board(craft);
      return;
    }
    if (this.roof) {
      if (distance(sim.foot, this.roof.stair) >= 23) {
        if (craft) this.board(craft);
        else sim.emit('notice', '走到绿色楼梯口即可下楼');
        return;
      }
      sim.foot = { ...this.roof.street, a: sim.foot.a };
      this.roof = null;
      sim.walking = false;
      sim.save();
      sim.emit('notice', '已到街边 · E 上车，Q 切换目标');
      return;
    }
    const p = this.streetStair;
    if (p) {
      this.roof = p;
      sim.foot = { ...p.stair, a: sim.foot.a };
      sim.walking = false;
      sim.selectedVehicle = null;
      sim.save();
      sim.emit('notice', '已到' + p.name + '天台');
    }
  }
  step(dt, input) {
    const h = this.pilot;
    if (!h || h.mode === 'parked') return;
    if (h.mode === 'lift') {
      h.z = approach(h.z, cruiseHeight, 84 * dt);
      if (h.z === cruiseHeight) {
        h.mode = 'cruise';
        this.sim.emit('notice', '方向键飞行 · 飞近 H 标记可降落');
      }
      return;
    }
    if (h.mode === 'landing') {
      const p = padById(h.padId),
        d = distance(h, p);
      const k = d ? Math.min(1, (100 * dt) / d) : 1;
      h.x += (p.x - h.x) * k;
      h.y += (p.y - h.y) * k;
      if (d < 1) h.z = approach(h.z, p.z, 65 * dt);
      if (h.z === p.z) {
        h.mode = 'parked';
        this.destination = null;
        this.sim.save();
        this.sim.emit('pickup', '降落完成 · E 离开机舱');
      }
      return;
    }
    const dx = Number(!!input.right) - Number(!!input.left),
      dy = Number(!!input.down) - Number(!!input.up);
    const n = Math.hypot(dx, dy) || 1,
      speed = input.hand ? 0 : 180;
    h.vx = approach(h.vx, ((0.85 * dx - 0.53 * dy) / n) * speed, (dx || dy ? 230 : 340) * dt);
    h.vy = approach(h.vy, ((0.53 * dx + 0.85 * dy) / n) * speed, (dx || dy ? 230 : 340) * dt);
    h.x = clamp(h.x + h.vx * dt, -45, world.width + 70);
    h.y = clamp(h.y + h.vy * dt, -45, world.height + 65);
    if (Math.hypot(h.vx, h.vy) > 4) h.a = Math.atan2(h.vy, h.vx);
  }
  moveOnRoof(x, y, a) {
    Object.assign(this.sim.foot, onRoof({ x, y, a }, this.roof));
  }
  snapshot() {
    if (!this.craft.length && !this.roof) return null;
    return {
      craft: this.craft.map(({ id, x, y, z, a, vx, vy, mode, padId }) => ({
        id,
        x,
        y,
        z,
        a,
        vx,
        vy,
        mode,
        padId,
      })),
      pilot: this.pilot?.id || null,
      roof: this.roof?.id || null,
      foot: this.roof ? { ...this.sim.foot } : null,
      destination: this.destination,
    };
  }
  restore(raw) {
    if (!raw) return;
    for (const c of Array.isArray(raw.craft) ? raw.craft : []) {
      if (
        !c ||
        !/^air-\d+$/.test(c.id) ||
        this.craft.some((o) => o.id === c.id) ||
        !validPoint(c) ||
        !Number.isFinite(c.z)
      )
        continue;
      const p = padById(c.padId),
        parked = c.mode === 'parked',
        landing = c.mode === 'landing';
      if ((parked || landing) && (!p || this.craft.some((other) => other.padId === p.id))) continue;
      if (!parked && c.id !== raw.pilot) continue;
      const h = {
        id: c.id,
        x: clamp(c.x, -45, world.width + 70),
        y: clamp(c.y, -45, world.height + 65),
        z: clamp(c.z, 0, cruiseHeight),
        a: heading(c),
        vx: Number.isFinite(c.vx) ? clamp(c.vx, -181, 181) : 0,
        vy: Number.isFinite(c.vy) ? clamp(c.vy, -181, 181) : 0,
        mode: parked ? 'parked' : landing ? 'landing' : c.mode === 'lift' ? 'lift' : 'cruise',
        padId: p?.id || null,
      };
      if (parked) Object.assign(h, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0 });
      this.craft.push(h);
      if (h.id === raw.pilot) this.pilot = h;
    }
    this.roof = (!this.pilot && padById(raw.roof)) || null;
    if (this.roof) this.sim.foot = onRoof(validPoint(raw.foot) ? raw.foot : this.roof.stair, this.roof);
    if (this.pilot || this.roof) this.sim.carId = null;
    this.destination = padById(raw.destination)?.id || null;
  }
}

export { Flight, pads as helipads, skySight };
