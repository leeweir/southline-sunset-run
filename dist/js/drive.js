'use strict';
(() => {
  const S = window.Southline,
    W = S.world,
    { clamp, distance } = S;
  const key = 'southline.drive.v1';
  const finite = Number.isFinite;
  const driftToward = (v, target, n) => (v < target ? Math.min(target, v + n) : Math.max(target, v - n));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function savedPoint(p, r) {
    return p && finite(p.x) && finite(p.y) && finite(p.a) && W.allowed(p.x, p.y, r);
  }
  function beside(car, offset) {
    return { x: car.x - Math.sin(car.a) * offset, y: car.y + Math.cos(car.a) * offset, a: car.a };
  }
  function loop(x0, y0, x1, y1, offset) {
    const p = W.step;
    const corners = [
      { x: x0 * p - offset, y: y0 * p + offset },
      { x: x1 * p - offset, y: y0 * p + offset },
      { x: x1 * p - offset, y: y1 * p - offset },
      { x: x0 * p + offset, y: y1 * p - offset },
    ];
    corners[0].x = corners[3].x;
    const pts = [],
      radius = 15;
    for (let i = 0; i < 4; i++) {
      const prev = corners[(i + 3) % 4],
        cur = corners[i],
        next = corners[(i + 1) % 4];
      const begin = {
        x: cur.x + ((prev.x - cur.x) * radius) / distance(prev, cur),
        y: cur.y + ((prev.y - cur.y) * radius) / distance(prev, cur),
      };
      const end = {
        x: cur.x + ((next.x - cur.x) * radius) / distance(next, cur),
        y: cur.y + ((next.y - cur.y) * radius) / distance(next, cur),
      };
      for (let j = 0; j <= 5; j++) {
        const t = j / 5,
          u = 1 - t;
        pts.push({
          x: u * u * begin.x + 2 * u * t * cur.x + t * t * end.x,
          y: u * u * begin.y + 2 * u * t * cur.y + t * t * end.y,
        });
      }
    }
    const lengths = pts.map((p, i) => distance(p, pts[(i + 1) % pts.length]));
    return { pts, lengths, total: lengths.reduce((a, b) => a + b, 0) };
  }
  function along(path, offset) {
    let n = offset % path.total;
    for (let i = 0; i < path.pts.length; i++) {
      const len = path.lengths[i],
        p = path.pts[i],
        next = path.pts[(i + 1) % path.pts.length];
      if (n <= len || i === path.pts.length - 1)
        return {
          x: p.x + ((next.x - p.x) * n) / len,
          y: p.y + ((next.y - p.y) * n) / len,
          a: Math.atan2(next.y - p.y, next.x - p.x),
        };
      n -= len;
    }
  }
  class Drive {
    constructor(event) {
      this.emit = event;
      this.cars = W.cars.map((a) => ({ ...a, speed: 0, occupied: false, claimed: a.id === 'tide' }));
      this.carId = 'tide';
      this.selectedVehicle = null;
      this.foot = { ...W.spawn };
      this.mode = 'story';
      this.done = 0;
      this.cash = 0;
      this.phase = 'pickup';
      this.elapsed = 0;
      this.waypoint = null;
      this.hasSave = false;
      this.storageAvailable = true;
      this.time = 0;
      this.cityTime = 0;
      this.hold = 0;
      this.cooldown = 0;
      this.saveClock = 0;
      this.walking = false;
      this.wanted = new S.Pursuit(this.cars, (car) => this.addDriver(car));
      this.drivers = [];
      this.trails = [];
      this.trailClock = 0;
      const rng = S.random(31);
      const models = [
        { name: '日落出租', color: '#e8ad57', max: 154, taxi: true },
        { name: '珊瑚轿跑', color: '#bb7488', max: 168 },
        { name: '海盐旅行车', color: '#8fbdaf', max: 151 },
        { name: '银湾轿车', color: '#bdb0be', max: 158 },
        { name: '赤霞 GT', color: '#db8668', max: 178 },
        { name: '港口快线', color: '#739ab0', max: 156 },
      ];
      const loops = [
        loop(0, 0, 5, 4, 17),
        loop(0, 1, 3, 3, 17),
        loop(1, 0, 4, 2, 17),
        loop(2, 2, 5, 4, 17),
      ];
      for (let i = 0; i < 12; i++) {
        const curbside = i === 11;
        const path = curbside ? loop(1, 3, 4, 4, 36) : loops[i % loops.length];
        const offset = curbside ? 62 : ((0.07 + i * 0.241) % 1) * path.total;
        const pace = 32 + rng() * 22;
        this.cars.push({
          ...models[curbside ? 0 : i % models.length],
          id: 'street-' + i,
          occupied: true,
          claimed: false,
          path,
          offset,
          pace,
          speed: curbside ? 0 : pace,
          wait: curbside ? 22 : 0,
          ...along(path, offset),
        });
      }
      this.people = W.blocks
        .filter((b, i) => i % 2 === 0 || b.type === 'park')
        .map((b, i) => {
          const x = b.x - 3,
            y = b.y - 3,
            l = b.size + 6;
          const pts = [
            { x, y },
            { x: x + l, y },
            { x: x + l, y: y + l },
            { x, y: y + l },
          ];
          const path = { pts, lengths: [l, l, l, l], total: l * 4 },
            offset = (i * 45) % path.total;
          return {
            path,
            offset,
            pace: 8 + (i % 5),
            color: ['#d7a36d', '#d78185', '#8cb4a6', '#c2bdd1'][i % 4],
            ...along(path, offset),
          };
        });
      this.flight = new S.Flight(this);
      this.city = new S.CityActivities(this);
      this.restore();
    }
    get car() {
      return this.cars.find((c) => c.id === this.carId);
    }
    get player() {
      return this.flight.pilot || this.car || this.foot;
    }
    get streetFoot() {
      return !this.car && !this.flight.pilot && !this.flight.roof;
    }
    get canBail() {
      return this.wanted.stars > 0 || ['dispatch', 'escort'].includes(this.city.active?.kind);
    }
    get traffic() {
      return this.cars.filter((c) => c.occupied && !c.onDuty && !c.fugitive && !c.stored);
    }
    get vehicles() {
      return this.cars.filter((c) => !c.stored).concat(this.wanted.cruisers.filter((c) => !c.id));
    }
    get nearbyVehicles() {
      if (!this.streetFoot) return [];
      return this.vehicles.filter((c) => distance(c, this.foot) < 42 && W.clearSegment(this.foot, c));
    }
    targetAmong(choices) {
      if (this.selectedVehicle && choices.includes(this.selectedVehicle)) return this.selectedVehicle;
      this.selectedVehicle = null;
      let nearest = null,
        nearestDistance = Infinity;
      for (const car of choices) {
        const d = distance(car, this.foot);
        if (d < nearestDistance) {
          nearest = car;
          nearestDistance = d;
        }
      }
      return nearest;
    }
    get nearbyVehicle() {
      return this.targetAmong(this.nearbyVehicles);
    }
    cycleVehicle() {
      const choices = this.nearbyVehicles;
      if (choices.length < 2) return;
      const current = choices.indexOf(this.targetAmong(choices));
      this.selectedVehicle = choices[(current + 1) % choices.length];
    }
    get job() {
      return W.jobs[this.done];
    }
    get target() {
      if (this.city.active) return this.city.target;
      if (this.mode === 'free') return W.spot(this.waypoint);
      return this.job && W.spot(this.phase === 'pickup' ? this.job.from : this.job.to);
    }
    begin(mode) {
      this.mode = mode;
      if (mode === 'story' && this.done === W.jobs.length && !this.city.active) {
        this.done = 0;
        this.phase = 'pickup';
        this.elapsed = 0;
        this.cityTime = 0;
      }
      this.hold = 0;
      this.save();
    }
    restore() {
      try {
        const v = JSON.parse(localStorage.getItem(key));
        if (!v || v.version !== 1) return;
        const poses = new Map();
        for (const p of Array.isArray(v.cars) ? v.cars : []) {
          if (!p || typeof p.id !== 'string' || poses.has(p.id)) continue;
          poses.set(p.id, p);
          if (p.patrol === true && /^patrol-\d+$/.test(p.id) && savedPoint(p, 7))
            this.cars.push({ ...W.patrolCar, id: p.id, speed: 0, occupied: false, claimed: true });
        }
        for (const c of this.cars) {
          const p = poses.get(c.id);
          if (!p) continue;
          if (S.paints.some((paint) => paint[1] === p.paint)) c.color = c.paint = p.paint;
          if (c.path) {
            if (finite(p.offset)) c.offset = Math.max(0, p.offset) % c.path.total;
            c.wait = finite(p.wait) ? clamp(p.wait, 0, 22) : 0;
            c.occupied = p.occupied !== false || !savedPoint(p, 7);
            c.claimed = !c.occupied && p.claimed !== false;
            if (c.occupied) Object.assign(c, along(c.path, c.offset));
          }
          if (!c.occupied && savedPoint(p, 7)) {
            // Older saves recorded a parked car's pose and current driver, but not its ownership.
            const previouslyDriven =
              p.claimed === undefined &&
              !c.patrol &&
              (v.carId === c.id || distance(c, p) > 0.1 || Math.abs(wrap(c.a - p.a)) > 0.01);
            c.claimed = c.claimed || p.claimed === true || previouslyDriven;
            Object.assign(c, { x: p.x, y: p.y, a: wrap(p.a) });
          }
          if (finite(p.speed)) c.speed = clamp(p.speed, c.occupied ? 0 : -42, c.occupied ? c.pace : c.max);
        }
        if (savedPoint(v.foot, 3)) Object.assign(this.foot, v.foot);
        this.carId =
          v.carId === null && savedPoint(v.foot, 3)
            ? null
            : this.cars.some((c) => c.id === v.carId && !c.occupied)
              ? v.carId
              : 'tide';
        if (this.car) this.car.claimed = true;
        this.done = clamp(Number.isInteger(v.done) ? v.done : 0, 0, W.jobs.length);
        this.mode = v.mode === 'free' ? 'free' : 'story';
        this.cash = clamp(finite(v.cash) ? v.cash : 0, 0, 99999999);
        this.phase = v.phase === 'delivery' ? 'delivery' : 'pickup';
        this.elapsed = clamp(finite(v.elapsed) ? v.elapsed : 0, 0, 99999);
        this.waypoint = W.spot(v.waypoint)?.id || null;
        this.cityTime = clamp(finite(v.cityTime) ? v.cityTime : 0, 0, 240);
        this.flight.restore(v.flight);
        this.wanted.restore(v.wanted, this.player);
        this.city.restore(v.city);
        this.hasSave = true;
      } catch (error) {
        if (error.name === 'SecurityError') this.storageAvailable = false;
      }
    }
    save() {
      const { carId, foot, done, cash, phase, elapsed, waypoint, cityTime } = this;
      const cars = this.cars.map(
        ({
          id,
          x,
          y,
          a,
          speed,
          occupied,
          path,
          offset,
          wait,
          patrol,
          claimed,
          onDuty,
          fugitive,
          paint,
        }) => {
          const state = { id, x, y, a, speed, claimed };
          if (paint) state.paint = paint;
          if (patrol) state.patrol = true;
          // Police seats are restored by vehicle ID. Only a civilian driver follows the traffic loop.
          return path ? { ...state, occupied: occupied && !onDuty && !fugitive, offset, wait } : state;
        },
      );
      const wanted = this.wanted.snapshot();
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            mode: this.mode,
            carId,
            foot,
            done,
            cash,
            phase,
            elapsed,
            waypoint,
            cityTime,
            cars,
            wanted,
            flight: this.flight.snapshot(),
            city: this.city.snapshot(),
          }),
        );
        this.hasSave = true;
        this.storageAvailable = true;
      } catch {
        this.storageAvailable = false;
      }
    }
    interact() {
      if (this.flight.pilot) {
        if (!this.flight.exit()) this.emit('notice', '先在标有 H 的楼顶降落，再离舱');
        return;
      }
      if (this.flight.roof || (!this.car && !this.nearbyVehicle && this.flight.boardable)) {
        if (!this.flight.board(this.flight.boardable)) this.flight.action();
        return;
      }
      const wanted = this.wanted.stars > 0;
      if (this.car) {
        const c = this.car;
        if (!this.canBail && Math.abs(c.speed) > 24) {
          this.emit('notice', '先减速，再下车');
          return;
        }
        const exit = W.vehicleExit(c);
        if (exit) {
          if (Math.abs(c.speed) <= 24) c.speed = 0;
          this.foot = exit;
          this.carId = null;
          this.city.onExit(c, exit);
          this.selectedVehicle = null;
          this.walking = false;
          this.emit(
            'notice',
            this.canBail ? '已弃车 · 靠近任意车辆可换车' : '已下车 · 靠近任意车辆即可上车',
          );
          this.save();
          return;
        }
        this.emit('notice', '车门旁空间不足');
        return;
      }
      const found = this.nearbyVehicle;
      if (!found) {
        this.emit('notice', '再靠近一些，停放和行驶的车辆都可以开');
        return;
      }
      const intercepted = this.city.beforeTake(found);
      const theft = !intercepted && (!found.claimed || found.onDuty);
      const surrendered = this.wanted.surrenderCar(found, this.foot);
      if (surrendered && !found.id) {
        let number = 1;
        while (this.cars.some((c) => c.id === 'patrol-' + number)) number++;
        found.id = 'patrol-' + number;
        this.cars.push(found);
      } else if (found.occupied) {
        found.occupied = false;
        this.addDriver(found);
      }
      found.claimed = true;
      this.carId = found.id;
      this.selectedVehicle = null;
      this.walking = false;
      if (theft) {
        if (!wanted) this.wanted.report(found);
        this.emit(
          'alert',
          '抢到' + found.name + ' · ' + this.wanted.stars + ' 星通缉' + (wanted ? '继续' : ''),
        );
      } else this.emit('notice', '已上车 · ' + found.name);
      this.save();
    }
    addDriver(c) {
      for (const side of [1, -1]) {
        const start = beside(c, 15 * side),
          end = beside(c, 49 * side);
        if (!W.allowed(start.x, start.y, 3)) continue;
        this.drivers.push({
          ...start,
          end: W.allowed(end.x, end.y, 3) && W.clearSegment(start, end, 3) ? end : start,
          color: '#e9a081',
          left: 6,
          walking: true,
        });
        return;
      }
    }
    releaseVehicle(c) {
      c.occupied = true;
      c.claimed = false;
      c.wait = 0;
      c.speed = c.pace;
      Object.assign(c, along(c.path, c.offset));
    }
    updateStreet(dt) {
      const player = this.player;
      for (const c of this.cars) {
        if (c.onDuty || c.stored || c.fugitive) continue;
        if (!c.occupied) {
          if (c === player) continue;
          if (c.speed) {
            c.speed = driftToward(c.speed, 0, 138 * dt);
            const dx = Math.cos(c.a),
              dy = Math.sin(c.a);
            const x = c.x + dx * c.speed * dt,
              y = c.y + dy * c.speed * dt;
            const nose = 12 * Math.sign(c.speed);
            const blocked = this.vehicles.some(
              (other) => other !== c && Math.hypot(other.x - x, other.y - y) < 17,
            );
            if (!blocked && W.allowed(x, y, 7) && W.allowed(x + dx * nose, y + dy * nose, 5)) {
              c.x = x;
              c.y = y;
            } else c.speed = 0;
          }
          // Return an abandoned street car to circulation once both ends of the handoff are far away.
          if (
            c.path &&
            distance(c, player) > 640 &&
            !this.wanted.reservedBy(c) &&
            !c.getawayWaiting &&
            distance(along(c.path, c.offset), player) > 640
          )
            this.releaseVehicle(c);
          continue;
        }
        c.wait = Math.max(0, c.wait - dt);
        const barrierAhead = this.wanted.blocksCar(c.x + Math.cos(c.a) * 27, c.y + Math.sin(c.a) * 27);
        const yielding =
          barrierAhead ||
          (this.streetFoot && distance(c, player) < 46) ||
          !!this.wanted.reservedBy(c) ||
          c.getawayWaiting;
        c.speed = driftToward(c.speed, yielding || c.wait ? 0 : c.pace, (yielding ? 100 : 43) * dt);
        c.offset = (c.offset + c.speed * dt) % c.path.total;
        Object.assign(c, along(c.path, c.offset));
      }
      for (let i = this.drivers.length - 1; i >= 0; i--) {
        const driver = this.drivers[i],
          d = distance(driver, driver.end);
        driver.left -= dt;
        if (driver.left <= 0) {
          this.drivers.splice(i, 1);
          continue;
        }
        driver.walking = d > 1;
        if (driver.walking) {
          const fraction = Math.min(1, (27 * dt) / d);
          driver.x += (driver.end.x - driver.x) * fraction;
          driver.y += (driver.end.y - driver.y) * fraction;
        }
      }
    }
    updatePursuit(dt) {
      const car = this.car;
      const event = this.wanted.step(
        dt,
        this.player,
        !!this.flight.pilot || (!!car && Math.abs(car.speed) > 26),
        !car && !this.flight.pilot,
        this.flight.height,
      );
      if (!event) return;
      // The challenge settles the escape and its payout together in this simulation step.
      if (event === 'escaped' && this.city.active?.kind === 'heat') return event;
      if (event === 'caught') {
        this.city.cancel(false);
        if (car?.path) this.releaseVehicle(car);
        else if (car) car.speed = 0;
        const home = this.cars.find((c) => c.id === 'tide');
        this.carId = home.stored ? null : home.id;
        if (this.car) this.car.speed = 0;
        else this.foot = { ...W.spot('motel'), a: 0 };
        this.walking = false;
        this.hold = 0;
        this.emit('caught', car ? '被警方截停' : '被警员抓获');
      } else if (event === 'escaped') this.emit('escaped', '已甩开追兵 · 通缉解除');
      else if (event === 'commandeered') this.emit('alert', '警员已征用附近车辆，继续追击');
      else if (event === 'reinforced') this.emit('alert', '增援抵达 · ' + this.wanted.stars + ' 星通缉');
      else if (event === 'spotted') this.emit('alert', '再次被发现 · 警方恢复追击');
      this.save();
      return event;
    }
    recover() {
      if (this.flight.pilot || this.flight.roof) {
        this.emit('notice', '从楼顶楼梯可以回到街道');
        return;
      }
      if (this.city.active?.kind === 'race' && this.city.active.phase !== 'grid')
        this.city.onExit(this.car);
      const at = W.roadPoint(this.player).at;
      const horizontal = Math.abs(at.y / W.step - Math.round(at.y / W.step)) < 0.001;
      const x = at.x + (horizontal ? 0 : -17),
        y = at.y + (horizontal ? 17 : 0);
      Object.assign(this.player, { x, y, a: horizontal ? 0 : Math.PI / 2 });
      if (this.car) this.car.speed = 0;
      this.save();
      this.emit('notice', '已回到最近的车道');
    }
    step(dt, input) {
      this.time += dt;
      this.cityTime = Math.min(240, this.cityTime + dt);
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.updateStreet(dt);
      for (const t of this.people) {
        t.offset = (t.offset + t.pace * dt) % t.path.total;
        Object.assign(t, along(t.path, t.offset));
      }
      if (this.flight.pilot) this.flight.step(dt, input);
      else if (this.car && this.city.active?.phase === 'countdown') this.car.speed = 0;
      else if (this.car) this.drive(dt, input);
      else this.walk(dt, input);
      if (this.updatePursuit(dt) !== 'caught') {
        if (this.city.active) this.city.step(dt);
        else this.advanceJob(dt);
      }
      this.saveClock += dt;
      if (this.saveClock >= 3) {
        this.saveClock = 0;
        this.save();
      }
      while (this.trails.length && this.time - this.trails[0].t > 2.5) this.trails.shift();
    }
    drive(dt, input) {
      const c = this.car,
        gas = input.up ? 1 : 0,
        brake = input.down ? 1 : 0,
        steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const near = W.roadPoint(c).at,
        offRoad = distance(near, c) > W.road / 2 + 7;
      const top = offRoad ? c.max * 0.56 : c.max;
      if (gas && !brake) c.speed = driftToward(c.speed, top, (c.speed < 0 ? 140 : 66) * dt);
      else if (brake && !gas) c.speed = driftToward(c.speed, -42, (c.speed > 0 ? 166 : 49) * dt);
      else c.speed = driftToward(c.speed, 0, (offRoad ? 39 : 25) * dt);
      if (input.hand) c.speed = driftToward(c.speed, 0, 112 * dt);
      const turn =
        Math.min(1, Math.abs(c.speed) / 21) * Math.sign(c.speed) * steer * (input.hand ? 3.05 : 1.94);
      const a = wrap(c.a + turn * dt),
        x = c.x + Math.cos(a) * c.speed * dt,
        y = c.y + Math.sin(a) * c.speed * dt;
      const nose = 12 * Math.sign(c.speed),
        forwardX = x + Math.cos(a) * nose,
        forwardY = y + Math.sin(a) * nose,
        can =
          W.allowed(x, y, 7) &&
          W.allowed(forwardX, forwardY, 5) &&
          !this.wanted.blocksCar(forwardX, forwardY);
      if (can) {
        c.x = x;
        c.y = y;
        c.a = a;
      } else {
        c.a = a;
        if (Math.abs(c.speed) > 35 && this.cooldown === 0) {
          this.emit('bump');
          this.cooldown = 0.7;
        }
        c.speed *= -0.24;
      }
      if (!this.cooldown)
        for (const t of this.vehicles) {
          if (t === c || distance(t, c) > 18) continue;
          const dx = c.x - t.x,
            dy = c.y - t.y,
            n = Math.hypot(dx, dy) || 1;
          const pushX = c.x + (dx / n) * 5,
            pushY = c.y + (dy / n) * 5;
          if (W.allowed(pushX, pushY, 7)) {
            c.x = pushX;
            c.y = pushY;
          }
          c.speed *= -0.28;
          this.cooldown = 1;
          this.emit('bump');
          break;
        }
      this.trailClock += dt;
      if (input.hand && Math.abs(c.speed) > 32 && this.trailClock > 0.055) {
        this.trailClock = 0;
        this.trails.push({ x: c.x, y: c.y, a: c.a, t: this.time });
      }
    }
    walk(dt, input) {
      const dx = Number(!!input.right) - Number(!!input.left),
        dy = Number(!!input.down) - Number(!!input.up);
      this.walking = !!(dx || dy);
      if (!this.walking) return;
      // Invert the camera's horizontal rotation so the arrow keys match the screen.
      const wx = 0.85 * dx - 0.53 * dy,
        wy = 0.53 * dx + 0.85 * dy,
        n = Math.hypot(wx, wy);
      const v = ((input.hand ? 68 : 46) * dt) / n,
        p = this.foot;
      if (this.flight.roof) {
        this.flight.moveOnRoof(p.x + wx * v, p.y + wy * v, Math.atan2(wy, wx));
        return;
      }
      if (W.allowed(p.x + wx * v, p.y, 3)) p.x += wx * v;
      if (W.allowed(p.x, p.y + wy * v, 3)) p.y += wy * v;
      p.a = Math.atan2(wy, wx);
    }
    advanceJob(dt) {
      const t = this.target;
      if (!t) return;
      if (this.mode === 'story' && this.phase === 'delivery') this.elapsed += dt;
      const near =
        !this.flight.height &&
        distance(this.player, t) < 35 &&
        (!this.car || Math.abs(this.car.speed) < 49);
      this.hold = near ? this.hold + dt : 0;
      if (this.hold < 0.32) return;
      this.hold = 0;
      if (this.mode === 'free') {
        this.waypoint = null;
        this.emit('notice', '已到达 · ' + t.name);
        this.save();
        return;
      }
      if (this.phase === 'pickup') {
        this.phase = 'delivery';
        this.elapsed = 0;
        this.save();
        this.emit('pickup', '已取到' + this.job.item + '，送往' + this.target.name);
        return;
      }
      const job = this.job,
        sec = this.elapsed,
        bonus = sec <= job.limit ? 80 : 0;
      this.done++;
      this.cash += job.pay + bonus;
      this.phase = 'pickup';
      this.elapsed = 0;
      const last = this.done === W.jobs.length;
      if (last) this.mode = 'free';
      this.save();
      this.emit('reward', { title: job.title, pay: job.pay, bonus, sec, last });
    }
  }
  S.Drive = Drive;
})();
