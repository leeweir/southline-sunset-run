import { world, clamp, distance } from './world.js';
import { driveTo, nearestBoardable, walkTo } from './pursuit.js';

const club = world.spot('club'),
  stage = world.spot('stage'),
  motel = world.spot('motel'),
  start = world.spot('vinyl'),
  pier = world.spot('pier');
const gates = [
  { id: 'straight', name: '棕榈直道', x: 2.72 * world.step, y: start.y, a: 0 },
  { id: 'bend', name: '港口弯道', x: 4 * world.step - 16, y: 3.48 * world.step, a: Math.PI / 2 },
  { id: 'quay', name: '海滨大道', x: 4.16 * world.step, y: pier.y, a: 0 },
  { ...pier, a: 0 },
];
const activities = {
  dispatch: {
    title: '警车电台',
    icon: 'sound',
    detail: '跟住调度标记的车，司机弃车后，下车靠近抓捕。',
    pay: 420,
  },
  escort: {
    title: '接应司机',
    icon: 'tape',
    detail: '到霓虹俱乐部接乐手阿澄，送她去海岸露天剧场。',
    pay: 360,
  },
  race: {
    title: '海岸计时赛',
    icon: 'flag',
    detail: '在落日唱片行起跑，穿过四道旗门冲向码头。',
    pay: 180,
  },
  heat: { title: '高星追逐', icon: 'star', detail: '三星出动路障，四星起加派空巡。甩开追兵即可结算。' },
  garage: {
    title: '海风旅馆车库',
    icon: 'upcar',
    detail: '在旅馆门口租车位，把开回来的车收藏、换色或取出。',
  },
};
const paints = [
  ['海薄荷', '#50cdb8'],
  ['珊瑚红', '#ef837b'],
  ['落日金', '#efba64'],
  ['鸢尾蓝', '#8c9cdd'],
  ['珍珠白', '#eee1cb'],
  ['午夜蓝', '#445574'],
];
const rent = [240, 400, 640];
const point = (p) => ({ x: p.x, y: p.y, a: p.a || 0 });
const validActor = (p) => p && [p.x, p.y, p.a].every(Number.isFinite) && world.allowed(p.x, p.y, 3);
const walker = (p, color) => ({ ...point(p), color, path: [], replan: 0, walking: false });
const value = (v, max = 86400) => (Number.isFinite(v) ? clamp(v, 0, max) : 0);
function timing(t) {
  const centiseconds = Math.floor(t * 100);
  return (
    Math.floor(centiseconds / 6000) +
    ':' +
    String(Math.floor(centiseconds / 100) % 60).padStart(2, '0') +
    '.' +
    String(centiseconds % 100).padStart(2, '0')
  );
}
const near = (a, b, d) => distance(a, b) < d && world.clearSegment(a, b, 2);
const tracePoint = (t, c) => [t, c.x, c.y, c.a].map((v) => Math.round(v * 1000) / 1000);
function readTrace(raw) {
  if (!Array.isArray(raw) || raw.length > 1602) return [];
  const result = [];
  for (const f of raw) {
    if (
      !Array.isArray(f) ||
      f.length !== 4 ||
      !f.every(Number.isFinite) ||
      f[0] < 0 ||
      (result.length && f[0] <= result[result.length - 1][0])
    )
      return [];
    result.push(f);
  }
  return result;
}
function ghostAt(record, seconds) {
  if (!record || seconds > record.time || !record.frames.length) return null;
  const frames = record.frames;
  let lo = 0,
    hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid][0] <= seconds) lo = mid;
    else hi = mid;
  }
  const a = frames[lo],
    b = frames[hi];
  const k = clamp((seconds - a[0]) / (b[0] - a[0] || 1), 0, 1);
  const turn = Math.atan2(Math.sin(b[3] - a[3]), Math.cos(b[3] - a[3]));
  return {
    x: a[1] + (b[1] - a[1]) * k,
    y: a[2] + (b[2] - a[2]) * k,
    a: a[3] + turn * k,
    color: '#a5e7e8',
  };
}

class Garage {
  constructor(sim) {
    this.sim = sim;
    this.slots = [];
  }
  get nearby() {
    return (
      !this.sim.flight.height &&
      near(this.sim.player, motel, this.sim.car ? 55 : 76) &&
      Math.abs(this.sim.car?.speed || 0) < 15
    );
  }
  get price() {
    return rent[this.slots.length];
  }
  restore(raw) {
    const ids = new Set();
    for (const id of (Array.isArray(raw) ? raw : []).slice(0, rent.length)) {
      const c = this.sim.cars.find((c) => c.id === id);
      if (c && c !== this.sim.car && !ids.has(id) && !c.onDuty) {
        c.stored = true;
        c.claimed = true;
        c.speed = 0;
        c.occupied = false;
        this.slots.push(id);
        ids.add(id);
      } else this.slots.push(null);
    }
  }
  transact(action, index, color) {
    const sim = this.sim,
      car = sim.car;
    if (!this.nearby) return '请在海风旅馆门口停稳';
    if (action === 'rent') {
      const price = this.price;
      if (!price) return '车位已全部租下';
      if (sim.cash < price) return '余额不足，还差 $' + (price - sim.cash);
      sim.cash -= price;
      this.slots.push(null);
    } else {
      if (!Number.isInteger(index) || index < 0 || index >= this.slots.length) return '请选择已租的车位';
      const parked = sim.cars.find((c) => c.id === this.slots[index]);
      if (action === 'park') {
        if (parked || !car) return '请把要收藏的车开到空车位';
        const door = world.vehicleExit(car, motel);
        if (!door) return '车门旁需要留出空间';
        sim.city.onExit(car, door);
        sim.carId = null;
        sim.foot = door;
        sim.selectedVehicle = null;
        sim.walking = false;
        car.occupied = false;
        car.stored = true;
        car.speed = 0;
        this.slots[index] = car.id;
      } else if (action === 'paint') {
        if (!parked || !paints.some((p) => p[1] === color)) return '请选择车位里的车和车色';
        parked.color = color;
        parked.paint = color;
      } else if (action === 'take') {
        if (!parked || car) return '请先下车，再来取车';
        const exit = [0, 28, -28, 55, -55]
          .map((dx) => ({ x: motel.x + dx, y: motel.y + 9, a: 0 }))
          .find((p) => world.allowed(p.x, p.y, 8) && !sim.vehicles.some((c) => distance(c, p) < 22));
        if (!exit) return '出口有车，稍后再取';
        Object.assign(parked, exit, { stored: false, occupied: false, claimed: true, speed: 0 });
        sim.carId = parked.id;
        sim.selectedVehicle = null;
        sim.walking = false;
        this.slots[index] = null;
      } else return '请选择车库操作';
    }
    sim.save();
    return '';
  }
}

class CityActivities {
  constructor(sim) {
    this.sim = sim;
    this.active = null;
    this.best = null;
    this.garage = new Garage(sim);
  }
  car(id) {
    return this.sim.cars.find((c) => c.id === id);
  }
  get actor() {
    const a = this.active;
    return a?.actor && !a.carId ? a.actor : null;
  }
  get ghost() {
    const a = this.active;
    return a?.kind === 'race' && a.phase === 'run' ? ghostAt(this.best, a.elapsed) : null;
  }
  get target() {
    const a = this.active;
    if (!a) return null;
    if (a.kind === 'heat') return null;
    if (a.kind === 'garage') return motel;
    if (a.kind === 'race') return a.phase === 'run' ? gates[a.gate] : start;
    if (a.kind === 'dispatch') return a.carId ? this.car(a.carId) : a.actor;
    if (a.phase === 'meet') return club;
    if (a.carId || (!this.sim.car && distance(a.actor, this.sim.player) < 40)) return stage;
    return a.actor;
  }
  get summary() {
    const a = this.active,
      sim = this.sim;
    if (!a) return null;
    if (a.kind === 'heat')
      return [
        a.level === 5 ? '摆脱空中巡查' : '摆脱路口封锁',
        sim.wanted.phase === 'search'
          ? '保持隐蔽，等搜寻倒数结束'
          : a.level === 5
            ? sim.wanted.aircraftTaken
              ? '甩开地面追兵，等搜寻结束'
              : '想夺机？先下车，等直升机低飞'
            : '留意橙色路障标记',
      ];
    const meters = Math.round(distance(sim.player, this.target) * 0.62) + ' 米';
    if (a.kind === 'garage') return ['开往海风旅馆', meters + ' · 在车库门口停稳'];
    if (a.kind === 'race') {
      if (a.phase === 'grid') return ['到唱片行起跑', meters + ' · 驾车停入旗门'];
      if (a.phase === 'countdown')
        return ['准备发车 · ' + Math.ceil(a.countdown), '按住油门，倒数结束出发'];
      return [
        gates[a.gate].name + ' · ' + (a.gate + 1) + ' / ' + gates.length,
        timing(a.elapsed) + ' · ' + meters,
      ];
    }
    if (a.kind === 'dispatch') {
      if (a.carId) return ['跟住' + this.car(a.carId).name, meters + ' · 跟近迫使司机弃车'];
      if (a.hold > 0) return ['正在抓捕司机', '跟住目标片刻'];
      return ['追上橙衣司机', meters + (sim.car ? ' · 下车靠近抓捕' : ' · 靠近并跟住目标')];
    }
    if (a.phase === 'meet') return ['去俱乐部接阿澄', meters + ' · 在门口减速'];
    if (a.carId) return ['送阿澄去露天剧场', meters + ' · 乐手已上车'];
    if (!sim.car) return ['和阿澄一同行动', '她会跟你步行，也能随你换车'];
    return distance(a.actor, sim.car) > 75
      ? ['回去接阿澄', meters + ' · 乐手仍在路边']
      : ['停稳等阿澄上车', '等她走到车门再出发'];
  }
  start(kind, level) {
    const sim = this.sim;
    if (!Object.hasOwn(activities, kind)) return '活动不存在';
    if (this.active) return '请先完成或结束当前活动';
    if (kind === 'dispatch') {
      if (!sim.car?.patrol || sim.wanted.stars) return '驾驶巡逻车并解除通缉后可以接警';
      const available = sim.cars.filter(
        (c) => c !== sim.car && !c.onDuty && !c.stored && !c.claimed && c.path && !sim.wanted.reservedBy(c),
      );
      const ranked = available.sort(
        (a, b) =>
          Number(b.name === '赤霞 GT') - Number(a.name === '赤霞 GT') ||
          distance(a, sim.player) - distance(b, sim.player),
      );
      const car = ranked[0];
      if (!car) return '暂时没有报案车辆';
      this.active = { kind, lastId: null, leg: 0 };
      this.putFugitiveIn(car);
    } else if (kind === 'heat') {
      if (sim.wanted.stars) return '这场通缉结束后可以开始挑战';
      if (!sim.car) return '请先坐进一辆车';
      const stars = level === 5 ? 5 : 3;
      for (let i = 0; i < stars; i++) sim.wanted.report(sim.player, false);
      this.active = { kind, level: stars };
    } else if (kind === 'escort') {
      this.active = {
        kind,
        phase: 'meet',
        actor: walker({ x: club.x, y: club.y + 18 }, '#ad78d4'),
        carId: null,
        boarding: 0,
      };
    } else if (kind === 'race') this.active = { kind, phase: 'grid' };
    else this.active = { kind };
    sim.hold = 0;
    sim.save();
    return '';
  }
  releaseFugitive() {
    const a = this.active;
    if (a?.kind !== 'dispatch') return;
    const car = this.car(a.carId),
      waiting = this.car(a.pickupId);
    if (car) {
      car.fugitive = false;
      car.occupied = false;
      car.speed = 0;
      car.chasePath = [];
    }
    if (waiting) waiting.getawayWaiting = false;
  }
  cancel(save = true) {
    this.releaseFugitive();
    this.active = null;
    this.sim.hold = 0;
    if (save) this.sim.save();
  }
  finish(detail, pay) {
    const kind = this.active.kind;
    this.releaseFugitive();
    this.active = null;
    this.sim.hold = 0;
    this.sim.cash += pay;
    this.sim.save();
    this.sim.emit('activityResult', { kind, detail, pay });
  }
  onExit(car, driverDoor) {
    const a = this.active;
    if (a?.kind === 'escort' && a.carId === car.id) {
      const side = driverDoor ? { x: 2 * car.x - driverDoor.x, y: 2 * car.y - driverDoor.y } : a.actor;
      a.actor = walker(world.vehicleExit(car, side) || car, '#ad78d4');
      a.carId = null;
      a.boarding = 0;
    } else if (a?.kind === 'race' && a.phase !== 'grid') {
      this.active = { kind: 'race', phase: 'grid' };
      this.sim.emit('notice', '已离开赛车，回到唱片行可重新发车');
    }
  }
  beforeTake(car) {
    const a = this.active;
    if (a?.kind !== 'dispatch') return false;
    if (a.pickupId === car.id) {
      car.getawayWaiting = false;
      a.pickupId = null;
      a.boarding = 0;
      a.actor.replan = 0;
    }
    if (a.carId !== car.id) return false;
    this.leaveGetaway(car);
    return true;
  }
  step(dt) {
    const a = this.active;
    if (!a) return;
    if (a.kind === 'escort') this.stepEscort(a, dt);
    else if (a.kind === 'heat') {
      if (!this.sim.wanted.stars) this.finish('成功甩开 ' + a.level + ' 星追兵', a.level === 5 ? 400 : 240);
    } else if (a.kind === 'dispatch') this.stepDispatch(a, dt);
    else if (a.kind === 'race') this.stepRace(a, dt);
    else if (this.garage.nearby) {
      this.active = null;
      this.sim.save();
      this.sim.emit('garage');
    }
  }
  stepEscort(a, dt) {
    const sim = this.sim,
      car = sim.car,
      actor = a.actor;
    if (sim.flight.height) {
      actor.walking = false;
      return;
    }
    if (a.phase === 'meet') {
      if (!near(sim.player, actor, 54)) return;
      a.phase = 'follow';
      sim.save();
      sim.emit('pickup', '阿澄到了，等她上车再出发');
    }
    if (!a.carId) {
      const gap = distance(actor, sim.player);
      const door = car && world.vehicleExit(car, actor);
      if (!car || (door && gap < 145)) walkTo(actor, door || sim.foot, dt, 67, car ? 1 : 8);
      else actor.walking = false;
      a.boarding = door && near(actor, door, 4) && Math.abs(car.speed) < 9 ? a.boarding + dt : 0;
      if (a.boarding >= 0.35) {
        a.carId = car.id;
        a.boarding = 0;
        sim.save();
        sim.emit('pickup', '阿澄已上车，去露天剧场');
      }
    }
    if (
      near(sim.player, stage, 35) &&
      (car ? a.carId === car.id && Math.abs(car.speed) < 15 : near(actor, stage, 35))
    )
      this.finish('阿澄赶上了今晚的演出', activities.escort.pay);
  }
  putFugitiveIn(car) {
    const a = this.active;
    Object.assign(car, {
      fugitive: true,
      getawayWaiting: false,
      occupied: true,
      chasePath: [],
      replan: 0,
      slot: 0,
    });
    a.carId = car.id;
    a.pickupId = null;
    a.actor = null;
    a.phase = 'drive';
    a.age = 0;
    a.hold = 0;
    a.boarding = 0;
  }
  leaveGetaway(car) {
    const a = this.active;
    const exit = world.vehicleExit(car) || car;
    this.releaseFugitive();
    a.lastId = car.id;
    a.carId = null;
    a.pickupId = null;
    a.actor = walker(exit, '#fd8d54');
    a.phase = 'foot';
    a.age = 0;
    a.hold = 0;
    a.boarding = 0;
    a.leg++;
  }
  stepDispatch(a, dt) {
    const sim = this.sim;
    a.age += dt;
    if (a.carId) {
      const car = this.car(a.carId);
      const goal = a.leg % 2 === 0 ? pier : world.spot('radio');
      const close = !sim.flight.height && near(sim.player, car, 68);
      a.hold = close && a.age > 1.4 ? a.hold + dt : 0;
      if (
        a.hold >= 1.65 ||
        (!sim.flight.height && a.age > 3 && distance(car, goal) < 24 && distance(sim.player, car) < 190)
      ) {
        this.leaveGetaway(car);
        sim.save();
        sim.emit('alert', '司机弃车了，留意橙衣目标');
        return;
      }
      driveTo(car, goal, dt, close ? 83 : 58, 8);
      return;
    }
    const f = a.actor;
    a.hold = sim.streetFoot && near(sim.foot, f, 19) ? a.hold + dt : 0;
    if (a.hold >= 0.42) {
      this.finish('已找到并抓获逃跑的司机', activities.dispatch.pay);
      return;
    }
    let next = this.car(a.pickupId);
    if (!next && a.age >= 0.75) {
      next = nearestBoardable(
        sim.cars,
        f,
        310,
        (c) => c !== sim.car && c.id !== a.lastId && !c.stored && !c.onDuty && !sim.wanted.reservedBy(c),
      );
      if (next) {
        a.pickupId = next.id;
        next.getawayWaiting = true;
        f.replan = 0;
      } else a.age = 0;
    }
    const door = next && world.vehicleExit(next, f);
    const goal = door || (a.leg % 2 ? world.spot('stage') : world.spot('club'));
    walkTo(f, goal, dt, 45, 1);
    a.boarding = door && near(f, door, 4) && Math.abs(next.speed) < 6 ? a.boarding + dt : 0;
    if (a.boarding >= 0.7) {
      if (next.occupied) sim.addDriver(next);
      this.putFugitiveIn(next);
      sim.save();
      sim.emit('alert', '司机换上了' + next.name + '，继续跟踪');
    }
  }
  stepRace(a, dt) {
    const sim = this.sim,
      car = sim.car;
    if (a.phase === 'grid') {
      if (!car || Math.abs(car.speed) > 17 || !near(car, start, 31)) return;
      Object.assign(car, point(start), { speed: 0 });
      Object.assign(a, {
        phase: 'countdown',
        countdown: 3,
        carId: car.id,
        elapsed: 0,
        gate: 0,
        frames: [],
        interval: 0.2,
      });
      sim.save();
      sim.emit('pickup', '起跑倒数，按住油门准备出发');
      return;
    }
    if (!car || car.id !== a.carId) {
      this.active = { kind: 'race', phase: 'grid' };
      return;
    }
    if (a.phase === 'countdown') {
      a.countdown = Math.max(0, a.countdown - dt);
      if (a.countdown <= 0) {
        a.phase = 'run';
        a.frames.push(tracePoint(0, car));
        sim.emit('pickup', '出发！');
        sim.save();
      }
      return;
    }
    a.elapsed += dt;
    const last = a.frames[a.frames.length - 1];
    if (!last || a.elapsed - last[0] >= a.interval) {
      a.frames.push(tracePoint(a.elapsed, car));
      if (a.frames.length >= 1600) {
        a.frames = a.frames.filter((_, i) => i % 2 === 0);
        a.interval *= 2;
      }
    }
    if (!near(car, gates[a.gate], 34)) return;
    a.gate++;
    if (a.gate < gates.length) {
      sim.save();
      sim.emit('pickup', '通过旗门 ' + a.gate + ' / ' + gates.length);
      return;
    }
    const newBest = !this.best || a.elapsed < this.best.time;
    if (newBest) {
      const end = tracePoint(a.elapsed, car);
      if (a.frames.at(-1)?.[0] !== end[0]) a.frames.push(end);
      this.best = { time: a.elapsed, frames: a.frames };
    }
    this.finish(
      '完赛 ' +
        timing(a.elapsed) +
        (newBest ? ' · 新纪录，已保存车影' : ' · 个人最佳 ' + timing(this.best.time)),
      activities.race.pay + (newBest ? 60 : 0),
    );
  }
  snapshot() {
    const a = this.active;
    return {
      slots: this.garage.slots,
      best: this.best,
      active: a ? { ...a, ...(a.actor ? { actor: point(a.actor) } : {}) } : null,
    };
  }
  restore(raw) {
    if (!raw || typeof raw !== 'object') return;
    this.garage.restore(raw.slots);
    const frames = readTrace(raw.best?.frames);
    if (frames.length >= 2 && value(raw.best.time) > 0) this.best = { time: raw.best.time, frames };
    const a = raw.active;
    if (!a || !Object.hasOwn(activities, a.kind)) return;
    if (a.kind === 'garage') this.active = { kind: 'garage' };
    if (a.kind === 'heat' && this.sim.wanted.stars)
      this.active = { kind: 'heat', level: a.level === 5 ? 5 : 3 };
    if (a.kind === 'escort' && validActor(a.actor))
      this.active = {
        kind: 'escort',
        phase: a.phase === 'meet' ? 'meet' : 'follow',
        actor: walker(a.actor, '#ad78d4'),
        carId: this.sim.car && this.sim.carId === a.carId ? a.carId : null,
        boarding: value(a.boarding, 0.35),
      };
    if (a.kind === 'race') {
      this.active = { kind: 'race', phase: 'grid' };
      const points = readTrace(a.frames);
      if (
        ['run', 'countdown'].includes(a.phase) &&
        this.sim.car &&
        a.carId === this.sim.carId &&
        Number.isInteger(a.gate) &&
        a.gate >= 0 &&
        a.gate < gates.length &&
        (a.phase === 'countdown' || points.length)
      )
        Object.assign(this.active, {
          phase: a.phase,
          carId: a.carId,
          gate: a.gate,
          elapsed: value(a.elapsed),
          countdown: value(a.countdown, 3),
          frames: points,
          interval: Math.max(0.2, value(a.interval)),
        });
    }
    if (a.kind === 'dispatch') {
      const car = this.car(a.carId);
      const available = (c) =>
        c && c !== this.sim.car && !c.stored && !c.onDuty && !this.sim.wanted.reservedBy(c);
      if (!available(car) && !validActor(a.actor)) return;
      this.active = {
        kind: 'dispatch',
        phase: 'foot',
        lastId: a.lastId,
        leg: Math.floor(value(a.leg)),
        actor: null,
        carId: null,
        pickupId: null,
      };
      if (available(car)) this.putFugitiveIn(car);
      else {
        this.active.actor = walker(a.actor, '#fd8d54');
        const next = this.car(a.pickupId);
        if (available(next)) {
          next.getawayWaiting = true;
          this.active.pickupId = next.id;
        }
      }
      Object.assign(this.active, {
        age: value(a.age),
        hold: value(a.hold, 2),
        boarding: value(a.boarding, 0.7),
      });
    }
  }
}

export { CityActivities, activities, paints, gates, rent, timing };
