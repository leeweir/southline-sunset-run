const test = require('node:test');
const assert = require('node:assert/strict');
const { city, tick } = require('./simulation.cjs');

function until(sim, condition, limit = 600, input = {}) {
  for (let i = 0; i < limit && !condition(); i++) tick(sim, 1, input);
  assert.ok(condition(), 'simulation should reach the requested state');
}
function parkAt(sim, target) {
  Object.assign(sim.car, { x: target.x, y: target.y, a: target.a || 0, speed: 0 });
}
function patrolAt(x, y, cars = []) {
  return city({
    version: 1,
    carId: 'patrol-1',
    cars: [{ id: 'patrol-1', patrol: true, claimed: true, x, y, a: 0, speed: 0 }, ...cars],
  });
}
test('the musician waits at the club, walks to doors, is left behind at speed and boards the next car', () => {
  const run = city(),
    { sim, world } = run;
  const club = world.spot('club'),
    stage = world.spot('stage');
  sim.begin('free');
  assert.equal(sim.city.start('escort'), '');
  parkAt(sim, club);
  until(sim, () => sim.city.active.carId === 'tide');
  assert.equal(sim.city.actor, null);
  sim.car.speed = 60;
  sim.interact();
  const musician = sim.city.actor,
    car = sim.city.car('sol');
  assert.ok(musician && Math.hypot(musician.x - club.x, musician.y - club.y) < 25);
  Object.assign(car, { x: club.x + 38, y: club.y, a: 0, speed: 0 });
  sim.foot = world.vehicleExit(car);
  sim.selectedVehicle = car;
  sim.interact();
  assert.equal(sim.carId, 'sol');
  assert.equal(sim.city.active.carId, null);
  parkAt(sim, stage);
  tick(sim, 10);
  assert.equal(sim.cash, 0);
  assert.equal(sim.target, musician);
  parkAt(sim, { x: musician.x + 18, y: musician.y });
  until(sim, () => sim.city.active.carId === car.id);
  sim.save();
  const resumed = city(run.saved());
  assert.equal(resumed.sim.city.active.carId, car.id);
  parkAt(resumed.sim, stage);
  tick(resumed.sim, 2);
  assert.equal(resumed.sim.cash, 360);
  assert.equal(resumed.sim.city.active, null);
  assert.equal(resumed.sim.wanted.stars, 1);
  assert.equal(city(resumed.saved()).sim.cash, 360);
});

test('the garage charges earned cash, stores the physical car, paints it and restores a single driveable copy', () => {
  const run = city(),
    sim = run.sim,
    motel = run.world.spot('motel');
  assert.equal(sim.city.start('garage'), '');
  parkAt(sim, motel);
  tick(sim, 1);
  assert.equal(run.events.at(-1).type, 'garage');
  const g = sim.city.garage;
  assert.match(g.transact('rent'), /余额不足/);
  assert.equal(sim.cash, 0);
  sim.cash = 320;
  assert.equal(g.transact('rent'), '');
  assert.equal(sim.cash, 80);
  assert.equal(g.transact('park', 0), '');
  assert.equal(sim.carId, null);
  assert.equal(g.slots[0], 'tide');
  assert.equal(
    sim.vehicles.some((c) => c.id === 'tide'),
    false,
  );
  assert.equal(g.transact('paint', 0, '#8c9cdd'), '');
  const next = city(run.saved()).sim,
    g2 = next.city.garage;
  assert.equal(next.city.car('tide').color, '#8c9cdd');
  assert.equal(g2.slots[0], 'tide');
  assert.equal(next.cash, 80);
  assert.equal(g2.transact('take', 0), '');
  assert.equal(next.car.id, 'tide');
  assert.equal(g2.slots[0], null);
  assert.equal(next.vehicles.filter((c) => c.id === 'tide').length, 1);
  const x = next.car.x;
  tick(next, 20, { up: true });
  assert.ok(next.car.x > x + 1);
});

test('race enforces the grid and ordered gates, preserves active timing and only replaces a faster ghost', () => {
  const run = city(),
    sim = run.sim;
  sim.begin('free');
  sim.city.start('race');
  const grid = run.world.spot('vinyl');
  parkAt(sim, grid);
  tick(sim, 1);
  assert.equal(sim.city.active.phase, 'countdown');
  tick(sim, 100, { up: true });
  assert.equal(sim.city.active.elapsed, 0);
  assert.equal(sim.car.x, grid.x);
  until(sim, () => sim.city.active.phase === 'run');
  tick(sim, 50, { up: true });
  parkAt(sim, run.api.gates[2]);
  tick(sim, 1);
  assert.equal(sim.city.active.gate, 0);
  sim.save();
  const next = city(run.saved()),
    s = next.sim;
  assert.equal(s.city.active.elapsed, sim.city.active.elapsed);
  for (const gate of next.api.gates) {
    parkAt(s, gate);
    tick(s, 2);
  }
  const best = s.city.best;
  assert.ok(best.time > 0 && best.frames.length >= 3);
  assert.equal(s.cash, 240);
  s.city.start('race');
  parkAt(s, grid);
  until(s, () => s.city.active.phase === 'run');
  assert.ok(Math.abs(s.city.ghost.x - grid.x) < 0.1);
  tick(s, 6, { up: true });
  assert.ok(s.city.ghost.x > grid.x && s.city.ghost.x < grid.x + 5);
  assert.equal(s.vehicles.includes(s.city.ghost), false);
  tick(s, 90);
  for (const gate of next.api.gates) {
    parkAt(s, gate);
    tick(s, 2);
  }
  assert.equal(s.city.best, best);
  assert.equal(s.cash, 420);
  s.city.start('race');
  parkAt(s, grid);
  until(s, () => s.city.active.phase === 'run');
  s.interact();
  assert.equal(s.city.active.phase, 'grid');
  assert.equal(s.city.best, best);
});

test('dispatch keeps the same marked fugitive through driving, bailing, boarding city traffic and an on-foot arrest', () => {
  const pier = city().world.spot('pier'),
    start = { x: pier.x - 16, y: pier.y, a: 0 };
  const run = patrolAt(pier.x - 22, pier.y - 20, [
    { id: 'street-4', ...start, occupied: false, claimed: false, speed: 0 },
    { id: 'flamingo', x: pier.x + 40, y: pier.y - 18, a: 0, speed: 0 },
  ]);
  const s = run.sim;
  s.begin('free');
  assert.equal(s.city.start('dispatch'), '');
  const first = s.city.car(s.city.active.carId);
  assert.equal(first.name, '赤霞 GT');
  until(s, () => s.city.actor);
  assert.equal(s.city.active.lastId, first.id);
  until(s, () => s.city.active.pickupId);
  const id = s.city.active.pickupId;
  s.save();
  const next = city(run.saved()),
    sim = next.sim;
  assert.equal(sim.city.car(id).getawayWaiting, true);
  until(sim, () => sim.city.active.carId === id, 500);
  const getaway = sim.city.car(id);
  assert.ok(getaway.fugitive && getaway.occupied);
  assert.equal(sim.traffic.includes(getaway), false);
  sim.save();
  const restored = city(next.saved()).sim;
  assert.equal(restored.city.target, restored.city.car(id));
  assert.equal(restored.vehicles.filter((c) => c.id === id).length, 1);
  sim.interact();
  sim.foot = next.world.vehicleExit(getaway);
  sim.selectedVehicle = getaway;
  sim.interact();
  assert.equal(sim.car, getaway);
  assert.equal(sim.wanted.stars, 0);
  assert.ok(sim.city.actor);
  sim.interact();
  until(sim, () => !sim.city.active, 80);
  assert.equal(sim.cash, 420);
  assert.equal(
    sim.cars.some((c) => c.fugitive || c.getawayWaiting),
    false,
  );
});

test('three-star barriers block one lane, and a five-star sweeping beam can reacquire a target without ground sight', () => {
  const run = city(),
    s = run.sim;
  s.begin('free');
  assert.equal(s.city.start('heat', 3), '');
  tick(s, 2);
  const b = s.wanted.roadblock;
  assert.ok(b && b.vertical);
  assert.equal(s.wanted.helicopter, null);
  const x = b.x - 25;
  parkAt(s, { x, y: b.y, a: 0 });
  s.car.speed = 42;
  tick(s, 25, { up: true });
  assert.ok(s.car.x < b.x - 8);
  parkAt(s, { x, y: b.y + 39, a: 0 });
  s.car.speed = 42;
  tick(s, 33, { up: true });
  assert.ok(s.car.x > b.x);
  s.save();
  assert.equal(city(run.saved()).sim.wanted.roadblock.x, b.x);
  const five = city().sim;
  five.city.start('heat', 5);
  tick(five, 10);
  const wanted = five.wanted,
    h = wanted.helicopter;
  assert.ok(h.beam && wanted.roadblock);
  wanted.phase = 'search';
  wanted.remaining = 3;
  for (const u of wanted.units) Object.assign(u, { x: 1200, y: 1000, speed: 0 });
  Object.assign(five.car, { x: h.beam.x, y: h.beam.y, speed: 0 });
  tick(five, 1);
  assert.equal(wanted.phase, 'chase');
  assert.ok(h.spotted);
  assert.ok(wanted.units.every((u) => !u.seesPlayer));
  parkAt(five, { x: 10, y: 10, a: 0 });
  until(five, () => !wanted.stars, 950);
  assert.equal(wanted.roadblock, null);
  assert.equal(wanted.helicopter, null);
  assert.equal(five.cash, 400);
  assert.equal(five.city.active, null);
});

test('side activities leave original delivery progress intact and capture drops the challenge without a payout', () => {
  const s = city().sim;
  s.done = 1;
  s.phase = 'delivery';
  s.elapsed = 21;
  assert.match(s.city.start('dispatch'), /巡逻车/);
  s.city.start('heat', 3);
  const u = s.wanted.units[0];
  Object.assign(u, { x: s.car.x + 20, y: s.car.y, a: 0, speed: 0 });
  s.wanted.intercept = 2.99;
  tick(s, 1);
  assert.equal(s.city.active, null);
  assert.equal(s.cash, 0);
  assert.equal(s.wanted.stars, 0);
  assert.equal(s.done, 1);
  assert.equal(s.phase, 'delivery');
  assert.equal(s.elapsed, 21);
});

test('a full five-star escape from the original starting street pays once and survives reload', () => {
  const run = city(),
    s = run.sim;
  s.begin('free');
  s.city.start('heat', 5);
  for (let f = 0; f < 1800 && s.city.active; f++) tick(s, 1, { up: true, left: f >= 100 && f < 145 });
  assert.equal(s.wanted.stars, 0);
  assert.equal(s.city.active, null);
  assert.equal(s.cash, 400);
  assert.equal(run.events.filter((e) => e.type === 'activityResult').length, 1);
  const reloaded = city(run.saved()).sim;
  tick(reloaded, 30);
  assert.equal(reloaded.mode, 'free');
  assert.equal(reloaded.cash, 400);
  assert.equal(reloaded.wanted.helicopter, null);
});

test('a parked street vehicle remains in its bay through remote traffic recycling and can return to the road', () => {
  const motel = city().world.spot('motel');
  const run = city({
    version: 1,
    carId: 'street-4',
    cash: 320,
    cars: [{ id: 'street-4', x: motel.x, y: motel.y, a: 0, claimed: true, occupied: false, speed: 0 }],
  });
  const s = run.sim,
    g = s.city.garage,
    id = s.carId;
  g.transact('rent');
  g.transact('park', 0);
  s.foot = { x: 1200, y: 995, a: 0 };
  tick(s, 210);
  assert.equal(s.city.car(id).occupied, false);
  assert.ok(!s.vehicles.some((c) => c.id === id));
  s.save();
  const next = city(run.saved()).sim;
  assert.equal(next.city.garage.slots[0], id);
  assert.equal(next.city.car(id).stored, true);
  next.foot = { x: motel.x, y: motel.y, a: 0 };
  assert.equal(next.city.garage.transact('take', 0), '');
  assert.equal(next.carId, id);
  assert.equal(next.wanted.stars, 0);
  assert.equal(next.traffic.includes(next.car), false);
});
