const test = require('node:test');
const assert = require('node:assert/strict');
const { city, tick } = require('./simulation.cjs');
const { world } = require('../src/game/world.js');
function takeCurbsideCab(sim) {
  sim.interact();
  tick(sim, 30, { right: true });
  assert.equal(sim.nearbyVehicle?.occupied, true);
  sim.interact();
  assert.equal(sim.car.name, '日落出租');
}
function bailFromCab(sim) {
  sim.begin('free');
  takeCurbsideCab(sim);
  tick(sim, 45);
  tick(sim, 46, { up: true });
  assert.ok(sim.car.speed > 45);
  const cab = sim.car;
  sim.interact();
  assert.equal(sim.carId, null);
  return cab;
}
function selectCar(sim, car) {
  const choices = sim.nearbyVehicles;
  assert.ok(choices.includes(car), 'vehicle must be reachable on foot');
  for (let i = 0; i < choices.length && sim.nearbyVehicle !== car; i++) sim.cycleVehicle();
  assert.equal(sim.nearbyVehicle, car);
}
function approachCruiser(sim, staffed) {
  sim.begin('free');
  takeCurbsideCab(sim);
  const car = sim.wanted.cruisers[0];
  for (let i = 0; i < 360 && sim.wanted.nearest > (staffed ? 35 : 24); i++) tick(sim, 1);
  sim.interact();
  for (let i = 0; i < 90 && (!sim.nearbyVehicles.includes(car) || (!staffed && !car.officer)); i++) {
    tick(sim, 1);
  assert.equal(car.occupied, staffed);
  selectCar(sim, car);
  return car;
}
// Lose the pursuit out of sight: every unit is across town and the search clock has nearly run out.
function goCold(sim) {
  const w = sim.wanted;
  Object.assign(w, { phase: 'search', remaining: 0.5, lastSeen: { x: 1200, y: 1000 } });
  for (const u of w.units) {
    if (u.onDuty) Object.assign(u, { x: 1200, y: 1000, speed: 0 });
    if (u.officer) Object.assign(u.officer, { x: 1200, y: 1000 });
  }
}

test('legacy saves keep the vehicle, wallet and active delivery', () => {
  const { sim } = city({
    version: 1,
    carId: 'tide',
    cars: [{ id: 'tide', x: 600, y: 773, a: 0 }],
    done: 1,
    cash: 320,
    phase: 'delivery',
    elapsed: 18,
  });
  assert.equal(sim.car.x, 600);
  assert.equal(sim.job.title, '午夜点播');
  assert.equal(sim.phase, 'delivery');
  assert.equal(sim.cash, 320);
  assert.equal(sim.wanted.phase, 'clear');
  assert.equal(sim.traffic.length, 12);
});

test('a moving street vehicle transfers exactly once and can be re-entered empty', () => {
  const { sim, saved } = city();
  const streetCar = sim.traffic[2];
  sim.carId = null;
  sim.foot = { x: streetCar.x + 3, y: streetCar.y, a: 0 };
  const speed = streetCar.speed,
    count = sim.traffic.length;
  sim.interact();
  assert.equal(sim.car, streetCar);
  assert.equal(streetCar.speed, speed);
  assert.equal(sim.traffic.length, count - 1);
  assert.equal(sim.drivers.length, 1);
  sim.car.speed = 0;
  sim.interact();
  sim.interact();
  assert.equal(sim.car, streetCar);
  assert.equal(sim.wanted.stars, 1);
  const restored = city(saved()).sim;
  assert.equal(restored.carId, streetCar.id);
  assert.equal(restored.traffic.length, count - 1);
  assert.equal(restored.cars.filter((c) => c.id === streetCar.id).length, 1);
  assert.equal(restored.wanted.units.length, 1);
});

test('driving away starts a real search, preserves it across reload and clears the patrol', () => {
  const run = city();
  run.sim.begin('free');
  takeCurbsideCab(run.sim);
  const start = run.sim.wanted.units[0].x;
  // Turning off the avenue breaks the patrol's line of sight once the radio trail goes cold.
  for (let f = 0; f < 320; f++) tick(run.sim, 1, { up: true, left: f >= 100 && f < 145 });
  const wanted = run.sim.wanted;
  assert.ok(wanted.units[0].x > start + 100);
  assert.equal(wanted.phase, 'search');
  assert.ok(wanted.remaining > 0 && wanted.remaining < wanted.searchDuration);
  run.sim.save();
  const resumed = city(run.saved());
  assert.equal(resumed.sim.carId, run.sim.carId);
  assert.deepEqual(JSON.parse(JSON.stringify(resumed.sim.wanted.snapshot())), run.saved().wanted);
  resumed.sim.begin('free');
  for (let f = 0; f < 900 && resumed.sim.wanted.stars; f++)
    tick(resumed.sim, 1, { up: true, left: f > 20 && f < 65 });
  assert.equal(resumed.sim.wanted.stars, 0);
  assert.equal(resumed.sim.wanted.units.length, 0);
  assert.equal(resumed.saved().wanted, null);
  assert.equal(resumed.events.filter((e) => e.type === 'escaped').length, 1);
});

test('a building blocks detection and reacquisition resets the escape countdown', () => {
  const { sim, world } = city();
  const b = world.buildings[0],
    y = b.y + b.d / 2;
  const left = { x: b.x - 12, y, a: 0 },
    right = { x: b.x + b.w + 12, y, a: 0 };
  assert.equal(world.clearSegment(left, right), false);
  const w = sim.wanted;
  w.report(left);
  Object.assign(w.units[0], left);
  let frames = 0;
  while (w.phase === 'chase' && frames < 200) {
    w.step(1 / 60, right, true);
    frames++;
  }
  assert.equal(w.phase, 'search');
  // Radio calls keep a car on the trail for a moment, then the last sighting freezes.
  assert.ok(frames >= Math.floor(w.trackDuration * 60));
  assert.equal(w.lastSeen.x, right.x);
  w.step(1 / 60, { ...left, y: left.y + 400 }, true);
  assert.ok(w.remaining < w.searchDuration);
  assert.equal(w.lastSeen.x, right.x);
  assert.equal(w.step(1 / 60, left, true), 'spotted');
  assert.equal(w.phase, 'chase');
  assert.equal(w.remaining, w.searchDuration);
});

test('a sustained sighting can reinforce the same pursuit up to five distinct units', () => {
  const { sim, world } = city();
  takeCurbsideCab(sim);
  const w = sim.wanted;
  for (let level = 2; level <= 5; level++) {
    w.continuous = 28 + w.stars * 7 - 0.005;
    assert.equal(w.step(1 / 60, sim.player, true), 'reinforced');
    assert.equal(w.stars, level);
    assert.equal(w.units.length, level);
  }
  assert.equal(w.step(1 / 60, sim.player, true), undefined);
  assert.ok(w.units.every((u) => world.allowed(u.x, u.y, 7)));
  assert.equal(new Set(w.units.map((u) => u.x + ',' + u.y)).size, 5);
});

test('a stationary driver can be intercepted without losing delivery progress', () => {
  const { sim, events, saved } = city();
  sim.phase = 'delivery';
  sim.cash = 320;
  sim.done = 1;
  takeCurbsideCab(sim);
  const id = sim.carId;
  tick(sim, 660);
  assert.ok(events.some((e) => e.type === 'caught'));
  assert.equal(sim.carId, 'tide');
  assert.ok(sim.traffic.some((c) => c.id === id));
  assert.equal(sim.wanted.stars, 0);
  assert.equal(sim.cash, 320);
  assert.equal(sim.phase, 'delivery');
  assert.equal(saved().carId, 'tide');
});

test('a patrol follows a moving target through two turns and avoids building footprints', () => {
  const { sim, world } = city();
  const wanted = sim.wanted,
    player = { x: 345, y: world.step * 3 + 17, a: 0 };
  wanted.report(player);
  for (let frame = 0; frame < 520; frame++) {
    if (frame < 133) player.x += 1.2;
    else if (frame < 310) {
      player.y += 1.2;
      player.a = Math.PI / 2;
    } else {
      player.x += 1;
      player.a = 0;
    }
    wanted.step(1 / 60, player, true);
    assert.ok(wanted.units.every((c) => world.allowed(c.x, c.y, 7)));
  }
  assert.equal(wanted.phase, 'chase');
  assert.ok(wanted.units[0].y > 950);
  assert.ok(Math.hypot(wanted.units[0].x - player.x, wanted.units[0].y - player.y) < 75);
});

test('bail at speed, outrun the officer, take passing traffic and see the same cruiser resume', () => {
  const { sim, saved } = city();
  const cab = bailFromCab(sim);
  const startX = cab.x,
    patrol = sim.wanted.units[0];
  for (let i = 0; i < 90 && !patrol.officer; i++) tick(sim, 1);
  assert.ok(cab.x > startX);
  assert.equal(cab.speed, 0);
  assert.ok(patrol.officer);
  const parked = { x: patrol.x, y: patrol.y };
  const officer = patrol.officer,
    firstX = officer.x;
  const sprint = { right: true, up: true, hand: true };
  for (let i = 0; i < 180 && !sim.nearbyVehicle?.occupied; i++) tick(sim, 1, sprint);
  assert.ok(officer.walking && officer.x > firstX + 65);
  assert.deepEqual({ x: patrol.x, y: patrol.y }, parked);
  assert.notEqual(sim.nearbyVehicle?.id, cab.id);
  assert.equal(sim.nearbyVehicle?.occupied, true);
  sim.save();
  const restoredFoot = city(saved()).sim;
  assert.equal(restoredFoot.carId, null);
  assert.deepEqual(JSON.parse(JSON.stringify(restoredFoot.wanted.snapshot())), saved().wanted);
  const chaseTime = sim.wanted.continuous;
  sim.interact();
  assert.equal(sim.car.id, 'street-3');
  assert.equal(sim.wanted.stars, 1);
  // Carjacking in front of a pursuing officer adds heat toward the next star.
  assert.equal(sim.wanted.continuous, chaseTime + 8);
  assert.equal(sim.wanted.units[0].officer, officer);
  const beforeReturn = Math.hypot(officer.x - patrol.x, officer.y - patrol.y);
  tick(sim, 12, { up: true });
  assert.equal(officer.returning, true);
  assert.ok(Math.hypot(officer.x - patrol.x, officer.y - patrol.y) < beforeReturn - 8);
  assert.deepEqual({ x: patrol.x, y: patrol.y }, parked);
  sim.save();
  const reload = city(saved()).sim;
  assert.equal(reload.wanted.units[0].officer.returning, true);
  for (const game of [sim, reload]) {
    const unit = game.wanted.units[0];
    let remaining = 180;
    while (unit.officer && remaining-- > 0) {
      assert.deepEqual({ x: unit.x, y: unit.y }, parked);
      const previous = { ...unit.officer };
      tick(game, 1);
      if (!unit.officer) assert.ok(Math.hypot(previous.x - unit.x, previous.y - unit.y) < 20);
    }
    assert.equal(unit.officer, null);
    tick(game, 12);
    assert.ok(unit.x > parked.x);
    assert.equal(game.wanted.stars, 1);
  }
});

test('switching cars during an unseen search preserves all stars, sightings and the remaining time', () => {
  const { sim } = city();
  takeCurbsideCab(sim);
  sim.wanted.report(sim.car);
  sim.wanted.phase = 'search';
  sim.wanted.remaining = 2.4;
  const snapshot = sim.wanted.snapshot(),
    units = [...sim.wanted.units];
  sim.interact();
  assert.deepEqual(sim.wanted.snapshot(), snapshot);
  const target = sim.traffic[1];
  sim.foot = { x: target.x, y: target.y, a: 0 };
  sim.interact();
  assert.equal(sim.car, target);
  assert.deepEqual(sim.wanted.snapshot(), snapshot);
  assert.ok(units.every((unit, idx) => sim.wanted.units[idx] === unit));
});

test('a runner can finish the escape countdown on foot without entering another vehicle', () => {
  const { sim, events, saved } = city();
  bailFromCab(sim);
  for (let frame = 0; frame < 90 && !sim.wanted.units[0].officer; frame++) tick(sim, 1);
  assert.ok(sim.wanted.units[0].officer);
  let searched = false;
  for (let frame = 0; frame < 2400 && sim.wanted.stars; frame++) {
    // Run up the avenue, then cut left around the block.
    tick(sim, 1, frame < 240 ? { up: true, hand: true } : { left: true, hand: true });
    if (sim.wanted.phase === 'search' && sim.wanted.remaining < 5) searched = true;
    assert.equal(sim.carId, null);
  }
  assert.ok(searched);
  assert.ok(events.some((e) => e.type === 'escaped'));
  assert.equal(sim.wanted.units.length, 0);
  assert.equal(saved().wanted, null);
});

test('a parked cruiser cannot see or catch players while its officer runs around a building', () => {
  const { sim, world } = city();
  const b = world.buildings[0],
    y = b.y + b.d / 2;
  const left = { x: b.x - 12, y, a: 0 },
    right = { x: b.x + b.w + 12, y, a: 0 };
  const w = sim.wanted;
  w.restore(
    {
      stars: 1,
      phase: 'chase',
      lastSeen: right,
      lastSeenOnFoot: true,
      units: [{ ...right, speed: 0, officer: { ...left, returning: false } }],
    },
    right,
  );
  const officer = w.units[0].officer;
  let event,
    spotted = false,
    detour = false;
  for (let frame = 0; frame < 660 && event !== 'caught'; frame++) {
    const previous = { ...officer };
    event = w.step(1 / 60, right, false, true);
    assert.ok(world.allowed(officer.x, officer.y, 3));
    assert.ok(world.clearSegment(previous, officer, 2.95));
    if (frame === Math.ceil(w.trackDuration * 60) + 1) {
      assert.equal(w.phase, 'search');
      assert.equal(w.intercept, 0);
    }
    if (officer.y < b.y || officer.y > b.y + b.d) detour = true;
    if (event === 'spotted') spotted = true;
  }
  assert.ok(spotted && detour);
  assert.equal(event, 'caught');
});

test('a pre-foot-pursuit wanted save starts with staffed cruisers and can dismount normally', () => {
  const { sim } = city({
    version: 1,
    carId: null,
    foot: { x: 350, y: 772, a: 0 },
    wanted: {
      stars: 1,
      phase: 'chase',
      lastSeen: { x: 350, y: 772 },
      units: [{ x: 310, y: 772, a: 0, speed: 10, sweep: null }],
    },
  });
  assert.equal(sim.wanted.units[0].officer, null);
  tick(sim, 3);
  assert.ok(sim.wanted.units[0].officer);
  assert.equal(sim.wanted.stars, 1);
});

test('each parked or traffic car can be selected, taken and driven', () => {
  const ids = city().sim.vehicles.map((c) => c.id);
  assert.equal(ids.length, 15);
  for (const id of ids) {
    const { sim, world } = city();
    const car = sim.cars.find((c) => c.id === id);
    const hadDriver = car.occupied;
    sim.carId = null;
    sim.foot = world.vehicleExit(car);
    selectCar(sim, car);
    sim.interact();
    assert.equal(sim.car, car);
    assert.equal(sim.car.claimed, true);
    assert.equal(sim.wanted.stars, id === 'tide' ? 0 : 1);
    assert.equal(sim.drivers.length, Number(hadDriver));
    const start = { x: car.x, y: car.y };
    tick(sim, 10, { up: true });
    assert.ok(Math.hypot(car.x - start.x, car.y - start.y) > 0.1, id);
  }
});

test('taking a staffed moving cruiser transfers the physical car, and escaping keeps it in the save', () => {
  const { sim, events, saved } = city();
  const cruiser = approachCruiser(sim, true);
  const { x, y, a, speed } = cruiser;
  const heat = sim.wanted.continuous,
    count = sim.vehicles.length,
    drivers = sim.drivers.length;
  assert.ok(speed > 30);
  sim.interact();
  assert.equal(sim.car, cruiser);
  assert.deepEqual({ x: cruiser.x, y: cruiser.y, a: cruiser.a, speed: cruiser.speed }, { x, y, a, speed });
  // Taking a cruiser in front of its crew costs a star, and dispatch sends one more unit.
  assert.equal(sim.vehicles.length, count + 1);
  assert.equal(new Set(sim.vehicles).size, count + 1);
  assert.equal(sim.wanted.cruisers.length, 1);
  assert.equal(sim.drivers.length, drivers);
  assert.equal(sim.wanted.stars, 2);
  assert.ok(heat > 0 && sim.wanted.continuous === 0);
  const officer = sim.wanted.units[0].officer;
  assert.ok(Math.hypot(officer.x - x, officer.y - y) < 24);
  assert.equal(officer.door, null);
  goCold(sim);
  for (let i = 0; i < 120 && sim.wanted.stars; i++) tick(sim, 1);
  assert.equal(sim.car, cruiser);
  assert.ok(events.some((e) => e.type === 'escaped'));
  sim.save();
  const loaded = city(saved()).sim;
  assert.equal(loaded.wanted.stars, 0);
  assert.equal(loaded.carId, cruiser.id);
  assert.equal(loaded.car.x, cruiser.x);
  assert.equal(loaded.car.max, cruiser.max);
  assert.equal(loaded.vehicles.filter((c) => c.patrol).length, 1);
  loaded.car.speed = 0;
  loaded.interact();
  selectCar(
    loaded,
    loaded.cars.find((c) => c.id === cruiser.id),
  );
  loaded.interact();
  assert.equal(loaded.carId, cruiser.id);
  assert.equal(loaded.wanted.stars, 0);
});

test('taking a vacant patrol car preserves the foot officer, other patrols and unique saved cars', () => {
  const run = city();
  const cruiser = approachCruiser(run.sim, false),
    officer = cruiser.officer;
  const start = { x: officer.x, y: officer.y };
  run.sim.interact();
  assert.equal(run.sim.car, cruiser);
  assert.equal(run.sim.wanted.units[0].officer, officer);
  assert.deepEqual({ x: officer.x, y: officer.y }, start);
  // The officer watched the theft, so a second unit is already on its way.
  assert.equal(run.sim.wanted.stars, 2);
  const resumed = city(run.saved()),
    sim = resumed.sim;
  assert.equal(sim.carId, cruiser.id);
  assert.deepEqual(JSON.parse(JSON.stringify(sim.wanted.snapshot())), run.saved().wanted);
  assert.equal(sim.wanted.units[0].officer.returning, false);
  tick(sim, 2, { up: true });
  assert.equal(sim.wanted.stars, 2);
  const second = sim.wanted.cruisers[0];
  assert.equal(sim.wanted.cruisers.length, 1);
  assert.ok(Number.isFinite(second.x));
  assert.equal(sim.wanted.units[0].officer.door, null);
  sim.interact();
  sim.foot = resumed.world.vehicleExit(second);
  selectCar(sim, second);
  const witnessed = sim.wanted.inSight;
  sim.interact();
  assert.equal(sim.car, second);
  assert.notEqual(second.id, cruiser.id);
  assert.equal(sim.wanted.stars, 2 + Number(witnessed));
  // Each witnessed cruiser theft calls in one more unit.
  assert.equal(sim.wanted.cruisers.length, Number(witnessed));
  const reloaded = city(resumed.saved()).sim;
  assert.equal(reloaded.carId, second.id);
  assert.equal(reloaded.vehicles.filter((c) => c.patrol).length, 2 + Number(witnessed));
  // Both robbed crews are still on foot, with no car to return to.
  assert.ok(
    reloaded.wanted.units.slice(0, 2).every((u) => u.officer && !u.officer.returning && !u.officer.door),
  );
  tick(reloaded, 30);
  assert.equal(reloaded.wanted.cruisers.length, 1 + Number(witnessed));
  assert.equal(reloaded.wanted.cruisers[0].id, cruiser.id);
  assert.equal(reloaded.carId, second.id);
});

test('cycling can select any overlapping car and releases a target that has left reach', () => {
  const { sim } = city();
  sim.interact();
  const cars = sim.cars.slice(0, 3);
  for (const c of cars) Object.assign(c, { x: 500, y: 504 });
  sim.foot = { x: 500, y: 508, a: 0 };
  const options = sim.nearbyVehicles,
    visited = new Set();
  for (let i = 0; i < options.length; i++) {
    visited.add(sim.nearbyVehicle);
    sim.cycleVehicle();
  }
  assert.equal(visited.size, options.length);
  selectCar(sim, cars[1]);
  cars[1].x += 80;
  assert.notEqual(sim.nearbyVehicle, cars[1]);
  assert.equal(sim.selectedVehicle, null);
  selectCar(sim, cars[2]);
  sim.interact();
  assert.equal(sim.car, cars[2]);
  assert.equal(sim.drivers.length, 0);
  assert.equal(sim.car.claimed, true);
});

test('a previously driven parked sports car stays claimed when migrating an older save', () => {
  const original = city().sim.cars.find((c) => c.id === 'flamingo');
  const { sim } = city({
    version: 1,
    carId: null,
    foot: { x: original.x - 12, y: original.y, a: 0 },
    cars: [{ id: original.id, x: original.x - 10, y: original.y, a: original.a }],
  });
  sim.interact();
  assert.equal(sim.carId, 'flamingo');
  assert.equal(sim.wanted.stars, 0);
});

test('taking an unseen parked cruiser does not restart the search or reveal the player to its officer', () => {
  const lastSeen = { x: 50, y: 200 };
  const run = city({
    version: 1,
    carId: null,
    foot: { x: 350, y: 755, a: 0 },
    cars: [],
    wanted: {
      stars: 1,
      phase: 'search',
      remaining: 2,
      lastSeen,
      lastSeenOnFoot: true,
      units: [{ x: 350, y: 750, a: 0, speed: 0, officer: { ...lastSeen, a: 0 } }],
    },
  });
  selectCar(run.sim, run.sim.wanted.cruisers[0]);
  run.sim.interact();
  assert.equal(run.sim.wanted.remaining, 2);
  tick(run.sim, 40);
  assert.equal(run.sim.wanted.phase, 'search');
  assert.equal(run.sim.wanted.lastSeenOnFoot, true);
  assert.deepEqual({ ...run.sim.wanted.lastSeen }, lastSeen);
  assert.ok(run.sim.wanted.remaining < 1.4);
  tick(run.sim, 100);
  assert.equal(run.sim.wanted.stars, 0);
  assert.equal(run.sim.car.patrol, true);
});

function withoutCruiser(officers, player = { x: 415, y: -10, a: 0 }, wanted = {}) {
  return city({
    version: 1,
    carId: 'patrol-1',
    cars: [{ ...player, id: 'patrol-1', patrol: true, claimed: true, speed: 0 }],
    wanted: {
      stars: officers.length,
      phase: 'chase',
      lastSeen: player,
      lastSeenOnFoot: false,
      units: officers.map((p) => ({ onFootOnly: true, officer: { ...p, a: 0 } })),
      ...wanted,
    },
  });
}

test('after losing the cruiser the same unit reaches the abandoned cab, takes the wheel and pursues', () => {
  const { sim, world, events } = city();
  const stolen = approachCruiser(sim, false),
    cab = sim.cars.find((c) => c.id === 'street-11');
  const officer = stolen.officer,
    paint = cab.color,
    start = { x: cab.x, y: cab.y };
  const total = sim.vehicles.length;
  sim.interact();
  let approached = false;
  for (let i = 0; i < 200 && !cab.onDuty; i++) {
    const before = { x: officer.x, y: officer.y };
    tick(sim, 1, { up: true, left: i < 36 });
    if (officer.pickupCar === cab) approached = true;
    assert.ok(Math.hypot(officer.x - before.x, officer.y - before.y) < 1.11);
    assert.equal(cab.x, start.x);
    assert.equal(cab.y, start.y);
  }
  assert.ok(approached);
  assert.equal(sim.wanted.units[0], cab);
  const door = world.vehicleExit(cab, officer);
  assert.ok(Math.hypot(door.x - officer.x, door.y - officer.y) <= 3);
  assert.equal(cab.color, paint);
  assert.equal(cab.taxi, true);
  assert.equal(cab.officer, null);
  tick(sim, 60, { up: true });
  assert.ok(Math.hypot(cab.x - start.x, cab.y - start.y) > 25);
  assert.equal(sim.car, stolen);
  assert.equal(sim.wanted.stars, 2);
  assert.equal(sim.vehicles.length, total + 1);
  assert.equal(new Set(sim.vehicles).size, total + 1);
  assert.equal(events.filter((e) => e.message?.includes?.('已征用')).length, 1);
});

test('passing traffic brakes for a cop, one driver gets out and both stages survive reload', () => {
  const run = withoutCruiser([{ x: 275, y: 31 }]),
    sim = run.sim;
  const traffic = sim.cars.find((c) => c.id === 'street-0'),
    initialSpeed = traffic.speed;
  const officer = sim.wanted.units[0].officer;
  tick(sim, 8);
  assert.equal(officer.pickupCar, traffic);
  assert.ok(traffic.speed < initialSpeed && traffic.speed > 0);
  for (let i = 0; i < 150 && officer.boarding < 0.12; i++) tick(sim, 1);
  assert.ok(officer.boarding >= 0.12 && officer.pickupCar === traffic);
  sim.save();
  const reload = city(run.saved());
  assert.equal(
    reload.sim.wanted.units[0].officer.pickupCar,
    reload.sim.cars.find((c) => c.id === traffic.id),
  );
  assert.equal(reload.sim.wanted.units[0].officer.boarding, officer.boarding);
  for (const game of [run, reload]) {
    const s = game.sim,
      car = s.cars.find((c) => c.id === traffic.id);
    for (let i = 0; i < 60 && !car.onDuty; i++) tick(s, 1);
    assert.equal(s.wanted.units[0], car);
    assert.equal(s.drivers.length, 1);
    assert.equal(s.traffic.includes(car), false);
    const offset = car.offset,
      pos = { x: car.x, y: car.y };
    tick(s, 28);
    assert.equal(car.offset, offset);
    assert.ok(Math.hypot(car.x - pos.x, car.y - pos.y) > 5);
    s.save();
    const restored = city(game.saved()).sim,
      actual = restored.cars.find((c) => c.id === car.id);
    assert.equal(restored.wanted.units[0], actual);
    assert.deepEqual([actual.x, actual.y, actual.speed, actual.claimed], [car.x, car.y, car.speed, false]);
    assert.equal(restored.vehicles.filter((c) => c === actual).length, 1);
    assert.equal(restored.carId, 'patrol-1');
  }
});

test('a requisitioned car can be surrendered again without changing its ID, route or heat', () => {
  const { sim, world } = withoutCruiser([{ x: 275, y: 31 }]);
  const car = sim.cars.find((c) => c.id === 'street-0'),
    route = car.path;
  const count = sim.vehicles.length;
  for (let i = 0; i < 180 && !car.onDuty; i++) tick(sim, 1);
  assert.equal(sim.wanted.units[0], car);
  sim.interact();
  sim.foot = world.vehicleExit(car);
  tick(sim, 2);
  const officer = car.officer;
  assert.ok(officer);
  selectCar(sim, car);
  sim.interact();
  assert.equal(sim.car, car);
  assert.equal(car.id, 'street-0');
  assert.equal(car.path, route);
  assert.equal(sim.wanted.units[0].officer, officer);
  assert.equal(sim.drivers.length, 1);
  // Retaking the car under the officer's eyes raises the wanted level and calls in another unit.
  assert.equal(sim.vehicles.length, count + 1);
  assert.equal(sim.wanted.stars, 2);
  assert.equal(car.onDuty, false);
});

test('officers choose distinct cars and a player can get to a reserved car first', () => {
  const { sim, world } = withoutCruiser([
    { x: 275, y: 31 },
    { x: 267, y: 33 },
  ]);
  tick(sim, 1);
  const [a, b] = sim.wanted.units.map((u) => u.officer);
  const first = a.pickupCar,
    second = b.pickupCar;
  assert.equal(first.id, 'street-0');
  assert.equal(second.id, 'street-4');
  sim.interact();
  sim.foot = world.vehicleExit(first);
  selectCar(sim, first);
  sim.interact();
  assert.equal(a.pickupCar, null);
  assert.equal(b.pickupCar, second);
  tick(sim, 8, { up: true });
  assert.equal(sim.car, first);
  assert.notEqual(a.pickupCar, first);
  assert.notEqual(a.pickupCar, second);
  assert.equal(sim.wanted.stars, 2);
});

test('finding a replacement during a search leaves the last sighting and escape clock intact', () => {
  const lastSeen = { x: 400, y: 775 };
  const { sim } = withoutCruiser(
    [{ x: 341, y: 811 }],
    { x: 1010, y: 502, a: 0 },
    { phase: 'search', remaining: 2.5, lastSeen },
  );
  const cab = sim.cars.find((c) => c.id === 'street-11');
  tick(sim, 45);
  assert.equal(sim.wanted.phase, 'search');
  assert.equal(sim.wanted.units[0], cab);
  assert.ok(sim.wanted.remaining < 1.8);
  assert.deepEqual({ ...sim.wanted.lastSeen }, lastSeen);
  for (let i = 0; i < 160 && sim.wanted.stars; i++) {
    const before = { x: cab.x, y: cab.y };
    tick(sim, 1);
    assert.ok(Math.hypot(cab.x - before.x, cab.y - before.y) < 1.6);
  }
  assert.equal(sim.wanted.stars, 0);
  assert.equal(cab.onDuty, false);
  assert.equal(cab.occupied, false);
  assert.equal(cab.claimed, false);
  assert.equal(sim.carId, 'patrol-1');
});

test('an officer with no nearby replacement keeps running instead of summoning another car', () => {
  const { sim } = withoutCruiser([{ x: 820, y: 17 }], { x: 950, y: 17, a: 0 });
  const officer = sim.wanted.units[0].officer,
    count = sim.vehicles.length;
  tick(sim, 55);
  assert.equal(officer.pickupCar, null);
  assert.ok(officer.walking && officer.x > 850);
  assert.equal(sim.wanted.vehicles.length, 0);
  assert.equal(sim.vehicles.length, count);
});
