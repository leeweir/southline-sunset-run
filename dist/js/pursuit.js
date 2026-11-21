'use strict';
(() => {
  const S = window.Southline,
    W = S.world;
  const { distance, clamp } = S;
  const MAX_STARS = 5;
  const ARREST_SECONDS = 3;
  const PICKUP_RANGE = 165;
  const BOARD_SECONDS = 0.45;
  const position = ({ x, y }) => ({ x, y });
  const bounded = (value, max) => (Number.isFinite(value) ? clamp(value, 0, max) : 0);
  const validPoint = (p, margin) =>
    p && Number.isFinite(p.x) && Number.isFinite(p.y) && W.allowed(p.x, p.y, margin);
  const patrolEntries = [];
  for (let row = 0; row <= W.rows; row++) {
    for (let col = 0; col <= W.cols * 3; col++)
      patrolEntries.push({ x: (col * W.step) / 3, y: row * W.step });
  }
  for (let col = 0; col <= W.cols; col++) {
    for (let row = 1; row < W.rows * 3; row++) {
      if (row % 3) patrolEntries.push({ x: col * W.step, y: (row * W.step) / 3 });
    }
  }

  function staffVehicle(car, slot) {
    return Object.assign(car, {
      slot,
      onDuty: true,
      occupied: true,
      chasePath: [],
      replan: 0,
      sweep: null,
      officer: null,
      seesPlayer: false,
    });
  }
  function newUnit(point, angle, slot) {
    return staffVehicle({ ...W.patrolCar, ...position(point), a: angle, speed: 44, claimed: false }, slot);
  }
  function releaseDuty(car) {
    car.onDuty = false;
    car.occupied = false;
    car.officer = null;
    car.chasePath = [];
    car.sweep = null;
  }
  function newOfficer(point, door, returning = false) {
    return {
      ...position(point),
      a: point.a,
      door: door ? position(door) : null,
      returning,
      walking: false,
      pickupCar: null,
      boarding: 0,
      retryIn: 0,
      path: [],
      replan: 0,
    };
  }
  function setPickup(officer, car) {
    officer.pickupCar = car;
    officer.boarding = 0;
    officer.replan = 0;
    officer.retryIn = 0;
  }

  function runTo(officer, goal, dt, speed, standOff) {
    officer.walking = false;
    if (distance(officer, goal) <= standOff && W.clearSegment(officer, goal, 2.95)) return;
    officer.replan -= dt;
    if (officer.replan <= 0) {
      officer.path = W.walkRoute(officer, goal);
      officer.replan = 0.34;
    }
    while (officer.path.length > 1 && distance(officer, officer.path[0]) < 0.05) officer.path.shift();
    const next = officer.path[0];
    if (!next) return;
    const dx = next.x - officer.x,
      dy = next.y - officer.y;
    const leg = Math.hypot(dx, dy);
    if (leg < 0.05) {
      officer.replan = 0;
      return;
    }
    const travel = Math.min(speed * dt, leg) / leg;
    const x = officer.x + travel * dx,
      y = officer.y + travel * dy;
    if (W.allowed(x, y, 3)) {
      officer.x = x;
      officer.y = y;
      officer.a = Math.atan2(dy, dx);
      officer.walking = true;
    } else officer.replan = 0;
  }

  function routeTo(unit, target) {
    if (distance(unit, target) < 90 && W.clearSegment(unit, target, 7)) return [position(target)];
    const path = W.route(unit, target).slice(1);
    // Cut the short lane-centering leg when the next road segment is already clear.
    while (path.length > 1 && distance(unit, path[0]) < 36 && W.clearSegment(unit, path[1], 8))
      path.shift();
    return path;
  }

  function moveUnit(unit, target, dt, topSpeed, standOff) {
    unit.replan -= dt;
    if (unit.replan <= 0) {
      unit.chasePath = routeTo(unit, target);
      unit.replan = 0.3 + 0.035 * unit.slot;
    }
    while (
      unit.chasePath.length > 1 &&
      distance(unit, unit.chasePath[0]) < 7 &&
      W.clearSegment(unit, unit.chasePath[1], 7)
    )
      unit.chasePath.shift();
    const next = unit.chasePath[0];
    if (!next || distance(unit, target) <= standOff) {
      unit.speed = 0;
      return;
    }
    const dx = next.x - unit.x,
      dy = next.y - unit.y,
      leg = Math.hypot(dx, dy);
    if (leg < 0.1) {
      unit.replan = 0;
      return;
    }
    const heading = Math.atan2(dy, dx),
      turn = Math.atan2(Math.sin(heading - unit.a), Math.cos(heading - unit.a));
    unit.a += clamp(turn, -3.8 * dt, 3.8 * dt);
    const speed = Math.min(
      Math.abs(turn) > 0.52 ? 45 : topSpeed,
      12 + Math.max(0, distance(unit, target) - standOff) * 2.8,
    );
    unit.speed += clamp(speed - unit.speed, -145 * dt, 81 * dt);
    const travel = Math.min(leg, unit.speed * dt);
    const x = unit.x + (dx / leg) * travel,
      y = unit.y + (dy / leg) * travel;
    if (W.allowed(x, y, 7)) {
      unit.x = x;
      unit.y = y;
    } else {
      unit.speed = 0;
      unit.replan = 0;
    }
  }

  function nearestBoardable(cars, walker, range, available) {
    let best = null,
      shortest = range;
    for (const car of cars) {
      if (distance(walker, car) > range || !available(car)) continue;
      const door = W.vehicleExit(car, walker);
      if (!door || distance(walker, door) >= shortest) continue;
      const route = W.walkRoute(walker, door);
      if (!route.length) continue;
      let length = 0,
        previous = walker;
      for (const next of route) {
        length += distance(previous, next);
        previous = next;
      }
      if (length < shortest) {
        best = car;
        shortest = length;
      }
    }
    return best;
  }

  function roadblockAhead(player) {
    const dx = Math.cos(player.a),
      dy = Math.sin(player.a);
    const vertical = Math.abs(dx) > Math.abs(dy);
    const direction = Math.sign(vertical ? dx : dy) || 1;
    const x = clamp(Math.round((player.x + (vertical ? direction * 200 : 0)) / W.step), 0, W.cols) * W.step;
    const y = clamp(Math.round((player.y + (vertical ? 0 : direction * 200)) / W.step), 0, W.rows) * W.step;
    const block = {
      x: x + (vertical ? -direction * 30 : direction * 13),
      y: y + (vertical ? direction * 13 : -direction * 30),
      vertical,
    };
    return distance(block, player) > 80 ? block : null;
  }

  class Pursuit {
    constructor(cityCars = [], displaceDriver) {
      this.cityCars = cityCars;
      this.displaceDriver = displaceDriver;
      this.units = [];
      this.clear();
    }
    clear() {
      for (const car of this.units) {
        if (car.onDuty) {
          releaseDuty(car);
          car.speed = 0;
        }
      }
      this.stars = 0;
      this.phase = 'clear';
      this.units = [];
      this.lastSeen = null;
      this.lastSeenOnFoot = false;
      this.remaining = 0;
      this.unseen = 0;
      this.continuous = 0;
      this.intercept = 0;
      this.nearest = Infinity;
      this.roadblock = null;
      this.helicopter = null;
      this.aircraftTaken = false;
    }
    get searchDuration() {
      return 5 + this.stars;
    }
    get cruisers() {
      return this.units.filter((unit) => unit.patrol);
    }
    get vehicles() {
      return this.units.filter((unit) => unit.onDuty);
    }
    reservedBy(car) {
      return this.units.find((unit) => unit.officer?.pickupCar === car)?.officer;
    }
    surrenderCar(car, player) {
      const waiting = this.reservedBy(car);
      if (waiting) setPickup(waiting, null);
      const index = this.units.indexOf(car);
      if (index < 0) return false;
      const officer = car.officer || newOfficer(W.vehicleExit(car, player) || player, null);
      officer.door = null;
      officer.returning = false;
      setPickup(officer, null);
      // The officer keeps their place in the pursuit. Drive takes over the same physical car.
      this.units[index] = { slot: car.slot, sweep: car.sweep, officer };
      releaseDuty(car);
      return true;
    }
    pickupTarget(officer, player, dt) {
      const current = officer.pickupCar;
      if (current) {
        if (
          current !== player &&
          !current.onDuty &&
          !current.stored &&
          !current.fugitive &&
          distance(officer, current) <= PICKUP_RANGE + 32
        )
          return current;
        setPickup(officer, null);
      }
      officer.retryIn -= dt;
      if (officer.retryIn > 0) return null;
      officer.retryIn = 0.65;
      const best = nearestBoardable(
        this.cityCars,
        officer,
        PICKUP_RANGE,
        (car) =>
          car !== player &&
          !car.onDuty &&
          !car.stored &&
          !car.fugitive &&
          !car.getawayWaiting &&
          !this.reservedBy(car),
      );
      if (best) setPickup(officer, best);
      return best;
    }
    boardReplacement(unit, car, dt) {
      const officer = unit.officer,
        door = W.vehicleExit(car, officer);
      if (!door) {
        setPickup(officer, null);
        return false;
      }
      runTo(officer, door, dt, 65, 1);
      const atDoor = distance(officer, door) <= 3 && W.clearSegment(officer, door, 2.95);
      officer.boarding = atDoor && Math.abs(car.speed) < 5 ? officer.boarding + dt : 0;
      if (officer.boarding < BOARD_SECONDS) return false;
      if (car.occupied) this.displaceDriver?.(car);
      setPickup(officer, null);
      car.speed = 0;
      this.units[unit.slot] = staffVehicle(car, unit.slot);
      car.sweep = unit.sweep;
      return true;
    }
    get captureFraction() {
      return this.intercept / ARREST_SECONDS;
    }
    blocksCar(x, y) {
      const b = this.roadblock;
      return !!b && Math.abs(x - b.x) < (b.vertical ? 8 : 23) && Math.abs(y - b.y) < (b.vertical ? 23 : 8);
    }
    sweepByAir(dt, player, onFoot, height) {
      if (this.stars < 5 || this.aircraftTaken) return false;
      const center = this.lastSeen;
      const h = (this.helicopter ||= { x: center.x - 115, y: center.y - 75, angle: 0, z: 78, a: 0 });
      h.angle = (h.angle + dt * 0.82) % (2 * Math.PI);
      h.lowPass =
        onFoot &&
        distance(h, player) < 190 &&
        S.skySight(h, player, h.z, height + 5) &&
        (this.units.some((u) => u.seesPlayer) || distance(center, player) < 55 || h.spotted);
      const dx = (h.lowPass ? player.x : center.x + 85 * Math.cos(h.angle)) - h.x,
        dy = (h.lowPass ? player.y : center.y + 62 * Math.sin(h.angle)) - h.y;
      const move = Math.min(1, ((h.lowPass ? 150 : 106) * dt) / (Math.hypot(dx, dy) || 1));
      h.x += dx * move;
      h.y += dy * move;
      if (Math.hypot(dx, dy) > 1) h.a = Math.atan2(dy, dx);
      const below = W.buildings.find((b) => h.x > b.x && h.x < b.x + b.w && h.y > b.y && h.y < b.y + b.d);
      const desired = Math.max((below?.h || 0) + 13, h.lowPass ? height + 19 : 78);
      h.z += clamp(desired - h.z, -72 * dt, 72 * dt);
      h.beam = h.lowPass
        ? position(h)
        : {
            x: h.x - 57 * Math.cos(h.angle) + 28 * Math.sin(h.angle * 2),
            y: h.y - 39 * Math.sin(h.angle) + 20 * Math.cos(h.angle * 2),
          };
      h.spotted =
        distance(h.beam, player) < 44 &&
        (height ? S.skySight(h, player, h.z, height + 4) : W.clearSegment(h.beam, player, 1));
      return h.spotted;
    }
    get captureRemaining() {
      return ARREST_SECONDS - this.intercept;
    }
    get loudness() {
      if (!this.stars) return 0;
      return Math.max(0, 1 - this.nearest / 350) * (this.phase === 'search' ? 0.45 : 1);
    }
    dispatch(player) {
      const slot = this.units.length;
      const bearing = player.a + Math.PI + [0, 1.7, -1.7, 0.8, -0.8][slot];
      const ideal = { x: player.x + Math.cos(bearing) * 156, y: player.y + Math.sin(bearing) * 156 };
      let best = patrolEntries[0],
        bestCost = Infinity;
      for (const gate of patrolEntries) {
        if (distance(player, gate) < 98) continue;
        let cost = distance(ideal, gate);
        if (!slot && !W.clearSegment(gate, player)) cost += 260;
        for (const other of this.units)
          cost += Math.max(0, 85 - distance(other.onDuty ? other : other.officer, gate)) * 3;
        if (cost < bestCost) {
          bestCost = cost;
          best = gate;
        }
      }
      const a = Math.atan2(player.y - best.y, player.x - best.x);
      this.units.push(newUnit(best, a, slot));
    }
    report(player, onFoot = false, sighting = player) {
      this.stars = Math.min(MAX_STARS, this.stars + 1);
      this.phase = 'chase';
      this.lastSeen = position(sighting);
      this.lastSeenOnFoot = onFoot;
      this.unseen = this.continuous = this.intercept = 0;
      this.remaining = this.searchDuration;
      if (this.units.length < this.stars) this.dispatch(player);
      for (const unit of this.units) {
        unit.sweep = null;
        unit.replan = 0;
      }
    }
    step(dt, player, movingFast, onFoot = false, height = 0) {
      if (!this.stars) return;
      let visible = this.sweepByAir(dt, player, onFoot, height),
        canIntercept = false;
      this.nearest = Infinity;
      const range = (this.phase === 'search' ? 143 : 189) + this.stars * 6;
      for (const unit of this.units) {
        const observer = unit.officer || unit;
        const d = distance(observer, player);
        if (unit.patrol) this.nearest = Math.min(this.nearest, distance(unit, player));
        unit.seesPlayer =
          d <= range &&
          (height > 0 ? S.skySight(observer, player, 5, height + 4) : W.clearSegment(observer, player));
        if (unit.seesPlayer) {
          visible = true;
          if (!height && (unit.officer ? d < (onFoot ? 13 : 17) : !onFoot && d < 33)) canIntercept = true;
        }
      }
      this.intercept = canIntercept && !movingFast ? this.intercept + dt : 0;
      if (this.intercept >= ARREST_SECONDS) {
        this.clear();
        return 'caught';
      }
      let event;
      if (visible) {
        if (
          this.stars >= 3 &&
          !height &&
          !onFoot &&
          (!this.roadblock || distance(this.roadblock, player) > 480)
        )
          this.roadblock = roadblockAhead(player) || this.roadblock;
        if (this.phase === 'search') {
          event = 'spotted';
          this.phase = 'chase';
          for (const unit of this.units) {
            unit.sweep = null;
            unit.replan = 0;
          }
        }
        this.lastSeen = position(
          height && !W.allowed(player.x, player.y, 7) ? W.roadPoint(player).at : player,
        );
        this.lastSeenOnFoot = onFoot;
        this.unseen = 0;
        this.remaining = this.searchDuration;
        if (this.stars < MAX_STARS) this.continuous += dt;
        if (this.stars < MAX_STARS && this.continuous >= 28 + this.stars * 7) {
          this.report(player, onFoot, this.lastSeen);
          event = 'reinforced';
        }
      } else if (this.phase === 'chase') {
        this.unseen = Math.min(0.85, this.unseen + dt);
        if (this.unseen >= 0.85) {
          this.phase = 'search';
          this.continuous = 0;
          this.remaining = this.searchDuration;
          for (const unit of this.units) unit.replan = 0;
          event = 'search';
        }
      } else {
        this.remaining -= dt;
        if (this.remaining <= 0) {
          this.clear();
          return 'escaped';
        }
      }
      for (const unit of this.units) {
        const searching = this.phase === 'search';
        if (searching && !unit.sweep && distance(unit.officer || unit, this.lastSeen) < 25) {
          // Sweep a nearby road from the last sighting, independently of the player's current position.
          const options = patrolEntries.filter((g) => {
            const d = distance(g, this.lastSeen);
            return d > 48 && d < 152;
          });
          if (options.length) unit.sweep = options[unit.slot % options.length];
          unit.replan = 0;
        }
        const goal = unit.sweep || this.lastSeen;
        if (unit.officer) {
          const officer = unit.officer;
          const closeToStoppedCar =
            !height && unit.seesPlayer && !movingFast && distance(officer, player) < 22;
          const needsCar = !this.lastSeenOnFoot && !closeToStoppedCar;
          if (!unit.onDuty && needsCar) {
            const pickup = this.pickupTarget(officer, player, dt);
            if (pickup) {
              if (this.boardReplacement(unit, pickup, dt) && !event) event = 'commandeered';
              continue;
            }
          } else if (officer.pickupCar) setPickup(officer, null);
          const returning = !!officer.door && needsCar;
          if (returning !== officer.returning) {
            officer.returning = returning;
            officer.replan = 0;
          }
          if (returning) {
            const door = officer.door;
            runTo(officer, door, dt, 65, 1);
            if (distance(officer, door) <= 2 && W.clearSegment(officer, door, 2.95)) {
              unit.officer = null;
              unit.occupied = true;
              unit.replan = 0;
            }
          } else runTo(officer, goal, dt, searching ? 43 : 53 + this.stars * 1.2, searching ? 2 : 6);
          continue;
        }
        const gap = distance(unit, goal);
        const stopping =
          this.lastSeenOnFoot && (gap <= 88 || (gap <= 130 && !W.clearSegment(unit, goal, 7)));
        if (stopping && unit.speed <= 22) {
          const door = W.vehicleExit(unit, goal);
          if (door) {
            unit.speed = 0;
            unit.chasePath = [];
            unit.officer = newOfficer(door, door);
            unit.occupied = false;
            continue;
          }
        }
        moveUnit(unit, goal, dt, stopping ? 15 : searching ? 54 : 83 + this.stars * 8, searching ? 5 : 18);
        for (let i = 0; i < unit.slot; i++) {
          const other = this.units[i];
          if (!other.onDuty) continue;
          const dx = unit.x - other.x,
            dy = unit.y - other.y,
            d = Math.hypot(dx, dy);
          if (d >= 22) continue;
          const push = Math.min(22 - d, 27 * dt);
          const x = unit.x + (d > 0.01 ? dx / d : Math.cos(unit.a + Math.PI / 2)) * push;
          const y = unit.y + (d > 0.01 ? dy / d : Math.sin(unit.a + Math.PI / 2)) * push;
          if (W.allowed(x, y, 7)) {
            unit.x = x;
            unit.y = y;
          }
        }
      }
      return event;
    }
    snapshot() {
      if (!this.stars) return null;
      const { stars, phase, lastSeen, remaining, unseen, continuous, intercept } = this;
      return {
        stars,
        phase,
        lastSeen,
        lastSeenOnFoot: this.lastSeenOnFoot,
        remaining,
        unseen,
        continuous,
        intercept,
        ...(this.roadblock ? { roadblock: this.roadblock } : {}),
        ...(this.aircraftTaken ? { aircraftTaken: true } : {}),
        ...(this.helicopter
          ? {
              helicopter: {
                ...position(this.helicopter),
                angle: this.helicopter.angle,
                z: this.helicopter.z,
                a: this.helicopter.a,
                lowPass: this.helicopter.lowPass,
              },
            }
          : {}),
        units: this.units.map(({ onDuty, id, x, y, a, speed, sweep, officer }) => ({
          ...(onDuty ? (id ? { vehicleId: id } : { x, y, a, speed }) : { onFootOnly: true }),
          sweep,
          officer: officer
            ? {
                ...position(officer),
                a: officer.a,
                door: officer.door,
                returning: officer.returning,
                ...(officer.pickupCar
                  ? { pickupId: officer.pickupCar.id, boarding: officer.boarding }
                  : {}),
              }
            : null,
        })),
      };
    }
    restore(value, player) {
      if (!value || !Number.isInteger(value.stars) || value.stars < 1) return;
      this.stars = Math.min(value.stars, MAX_STARS);
      this.phase = value.phase === 'search' ? 'search' : 'chase';
      this.lastSeen = position(validPoint(value.lastSeen, 0) ? value.lastSeen : player);
      this.lastSeenOnFoot = value.lastSeenOnFoot === true;
      this.remaining = Number.isFinite(value.remaining)
        ? bounded(value.remaining, this.searchDuration)
        : this.searchDuration;
      this.unseen = bounded(value.unseen, 0.85);
      this.continuous = bounded(value.continuous, 70);
      this.intercept = bounded(value.intercept, ARREST_SECONDS);
      if (this.stars >= 3 && validPoint(value.roadblock, 0))
        this.roadblock = { ...position(value.roadblock), vertical: value.roadblock.vertical === true };
      const h = value.helicopter;
      this.aircraftTaken = this.stars === 5 && value.aircraftTaken === true;
      if (this.stars === 5 && !this.aircraftTaken && h && [h.x, h.y, h.angle].every(Number.isFinite))
        this.helicopter = {
          x: clamp(h.x, -250, W.width + 250),
          y: clamp(h.y, -250, W.height + 250),
          angle: h.angle % (2 * Math.PI),
          z: Number.isFinite(h.z) ? clamp(h.z, 15, 150) : 78,
          a: Number.isFinite(h.a) ? h.a : 0,
          lowPass: h.lowPass === true,
        };
      const pickups = [];
      for (const saved of (Array.isArray(value.units) ? value.units : []).slice(0, this.stars)) {
        const hasOfficer = validPoint(saved?.officer, 3) && Number.isFinite(saved.officer.a);
        const sweep = this.phase === 'search' && validPoint(saved?.sweep, 7) ? position(saved.sweep) : null;
        if (saved?.onFootOnly && hasOfficer) {
          const officer = newOfficer(saved.officer, null);
          this.units.push({ slot: this.units.length, sweep, officer });
          if (typeof saved.officer.pickupId === 'string') pickups.push([officer, saved.officer]);
          continue;
        }
        let unit;
        if (typeof saved?.vehicleId === 'string') {
          const car = this.cityCars.find((c) => c.id === saved.vehicleId);
          if (!car || car === player || car.onDuty || !validPoint(car, 7)) continue;
          unit = staffVehicle(car, this.units.length);
        } else {
          if (!validPoint(saved, 7) || !Number.isFinite(saved.a)) continue;
          unit = newUnit(saved, saved.a, this.units.length);
          unit.speed = bounded(saved.speed, 140);
        }
        if (hasOfficer) {
          const entry = saved.officer.door;
          const door =
            validPoint(entry, 3) && distance(entry, unit) <= 23 && W.clearSegment(unit, entry, 3)
              ? entry
              : W.vehicleExit(unit, saved.officer);
          if (door) {
            unit.officer = newOfficer(saved.officer, door, saved.officer.returning === true);
            unit.speed = 0;
            unit.occupied = false;
          }
        }
        unit.sweep = sweep;
        this.units.push(unit);
      }
      for (const [officer, saved] of pickups) {
        const car = this.cityCars.find((c) => c.id === saved.pickupId);
        if (
          car &&
          car !== player &&
          !car.onDuty &&
          !this.reservedBy(car) &&
          distance(officer, car) <= PICKUP_RANGE + 32
        ) {
          setPickup(officer, car);
          officer.boarding = bounded(saved.boarding, BOARD_SECONDS);
        }
      }
      while (this.units.length < this.stars) this.dispatch({ ...this.lastSeen, a: player.a });
    }
  }
  Object.assign(S, { Pursuit, walkTo: runTo, driveTo: moveUnit, nearestBoardable });
})();
