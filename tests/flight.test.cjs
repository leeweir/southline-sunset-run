const test = require('node:test');
const assert = require('node:assert/strict');
const { city, tick } = require('./simulation.cjs');

function until(sim, condition, limit = 420, controls = () => ({})) {
  for (let i = 0; i < limit && !condition(); i++) tick(sim, 1, controls());
  assert.ok(condition(), 'expected flight state within ' + limit + ' frames');
}
function lowPass(run) {
  const { sim } = run;
  sim.begin('free');
  assert.equal(sim.city.start('heat', 5), '');
  tick(sim, 32);
  const helicopter = sim.wanted.helicopter;
  assert.ok(helicopter);
  assert.equal(sim.flight.boardable, null);
  sim.interact();
  until(sim, () => sim.flight.boardable === helicopter);
  return helicopter;
}
function takeOff(run) {
  const h = lowPass(run),
    { sim } = run;
  sim.flight.action();
  assert.equal(sim.player, h);
  until(sim, () => h.mode === 'cruise');
  return h;
}
function steer(from, to) {
  const x = to.x - from.x,
    y = to.y - from.y,
    n = Math.hypot(x, y) || 1;
  const horizontal = (0.85 * x + 0.53 * y) / n,
    vertical = (-0.53 * x + 0.85 * y) / n;
  return {
    right: horizontal > 0.34,
    left: horizontal < -0.34,
    down: vertical > 0.34,
    up: vertical < -0.34,
  };
}
function flyTo(run, id) {
  const { sim, api } = run,
    pad = api.helipads.find((p) => p.id === id);
  until(
    sim,
    () => sim.flight.landingPad === pad,
    700,
    () => steer(sim.player, pad),
  );
  return pad;
}

test('the same five-star aircraft lowers to foot level and changes hands without resetting the pursuit', () => {
  const run = city(),
    s = run.sim,
    h = lowPass(run);
  s.cycleVehicle();
  const heat = s.wanted.snapshot(),
    crew = s.wanted.units.slice(),
    { x, y, z } = h;
  s.flight.action();
  assert.equal(s.flight.pilot, h);
  assert.deepEqual([h.x, h.y, h.z], [x, y, z]);
  assert.equal(s.wanted.helicopter, null);
  assert.equal(h.beam, null);
  assert.equal(s.wanted.stars, heat.stars);
  assert.equal(s.wanted.phase, heat.phase);
  assert.equal(s.wanted.remaining, heat.remaining);
  assert.deepEqual(s.wanted.units, crew);
  assert.equal(s.flight.exit(), false);
  s.interact();
  assert.equal(s.player, h);
  until(s, () => h.mode === 'cruise');
  tick(s, 50, { right: true });
  assert.ok(h.z > Math.max(...run.world.buildings.map((b) => b.h)));
  assert.ok(h.vx > 0 && h.vy > 0);
  tick(s, 60);
  const at = [h.x, h.y, h.z];
  tick(s, 30);
  assert.deepEqual([h.x, h.y, h.z], at);
  assert.equal(s.flight.craft.length, 1);
  assert.equal(s.wanted.helicopter, null);
});

test('flight, approach, rooftop, street and car saves retain the airframe and its physical parking spot', () => {
  let run = city(),
    s = run.sim,
    h = takeOff(run);
  const resume = () => {
    s.save();
    run = city(run.saved());
    s = run.sim;
    h = s.flight.craft[0];
  };
  s.flight.destination = 'neon';
  tick(s, 20, { up: true });
  const mid = [h.x, h.y, h.vx, h.vy, h.z];
  resume();
  assert.equal(s.player, h);
  assert.deepEqual([h.x, h.y, h.vx, h.vy, h.z], mid);
  assert.equal(s.flight.guidePad.id, 'neon');
  assert.equal(s.wanted.aircraftTaken, true);
  flyTo(run, 'neon');
  flyTo(run, 'tides');
  s.flight.action();
  assert.equal(h.mode, 'landing');
  until(s, () => h.z < 135);
  const z = h.z;
  resume();
  assert.equal(h.z, z);
  assert.equal(h.mode, 'landing');
  assert.equal(h.padId, 'tides');
  s.interact();
  assert.equal(s.player, h);
  until(s, () => h.mode === 'parked');
  const pad = run.api.helipads.find((p) => p.id === 'tides');
  assert.deepEqual([h.x, h.y, h.z], [pad.x, pad.y, pad.z]);
  s.interact();
  resume();
  assert.equal(s.flight.roof.id, 'tides');
  assert.equal(s.flight.pilot, null);
  assert.equal(s.nearbyVehicles.length, 0);
  assert.equal(s.city.garage.nearby, false);
  assert.ok(s.flight.boardable === h);
  const stars = s.wanted.stars;
  s.flight.action();
  assert.deepEqual([s.foot.x, s.foot.y], [pad.street.x, pad.street.y]);
  assert.equal(s.streetFoot, true);
  assert.equal(s.flight.boardable, null);
  const cab = s.nearbyVehicle;
  assert.ok(cab && !cab.claimed);
  s.interact();
  assert.equal(s.car, cab);
  assert.equal(s.wanted.stars, stars);
  resume();
  assert.equal(s.carId, cab.id);
  assert.equal(h.mode, 'parked');
  assert.equal(s.flight.roof, null);
  s.interact();
  until(
    s,
    () => !!s.flight.streetStair,
    180,
    () => steer(s.player, pad.street),
  );
  s.flight.action();
  assert.equal(s.flight.roof.id, 'tides');
  s.interact();
  assert.equal(s.flight.pilot, h);
  s.flight.action();
  until(s, () => h.mode === 'cruise');
  assert.equal(h.padId, null);
});

test('all eight landing sites have a reachable street door, a walkable roof and a return flight', () => {
  const src = city();
  assert.equal(src.api.helipads.length, 8);
  for (const pad of src.api.helipads) {
    const route = src.world.roadPoint(pad.street).at;
    assert.ok(
      src.world.allowed(pad.street.x, pad.street.y, 4) && src.world.clearSegment(pad.street, route, 3),
    );
    const craft = { id: 'air-1', x: pad.x + 10, y: pad.y, z: 150, a: 0, mode: 'cruise' };
    const { sim: s } = city({ version: 1, flight: { pilot: craft.id, craft: [craft] } });
    s.flight.action();
    until(s, () => s.player.mode === 'parked');
    s.interact();
    tick(s, 180, { right: true, down: true });
    assert.ok(
      s.foot.x <= pad.building.x + pad.building.w - 4 && s.foot.y <= pad.building.y + pad.building.d - 4,
    );
    until(
      s,
      () => s.flight.actionLabel === '走楼梯下楼',
      360,
      () => steer(s.foot, pad.stair),
    );
    s.flight.action();
    assert.equal(s.streetFoot, true);
    assert.equal(s.flight.streetStair.id, pad.id);
    s.flight.action();
    until(
      s,
      () => !!s.flight.boardable,
      80,
      () => steer(s.foot, pad),
    );
    s.interact();
    s.flight.action();
    assert.equal(s.player.mode, 'lift');
  }
});

test('a legacy five-star save gains a low pass and another chase can dispatch a fresh aircraft', () => {
  const run = city();
  lowPass(run);
  run.sim.save();
  const old = run.saved(),
    h = old.wanted.helicopter;
  old.wanted.helicopter = { x: h.x, y: h.y, angle: h.angle };
  delete old.flight;
  const { sim: s } = city(old);
  assert.equal(s.wanted.helicopter.z, 78);
  until(s, () => !!s.flight.boardable);
  s.flight.action();
  const captured = s.player;
  s.wanted.clear();
  assert.equal(s.wanted.aircraftTaken, false);
  for (let i = 0; i < 5; i++) s.wanted.report(s.player);
  tick(s, 1);
  assert.ok(s.wanted.helicopter && s.wanted.helicopter !== captured);
  assert.equal(s.flight.pilot, captured);
});

test('losing five stars in flight completes the challenge once and keeps the captured helicopter', () => {
  const run = city(),
    { sim } = run,
    h = takeOff(run);
  tick(sim, 360, { right: true });
  assert.equal(sim.wanted.phase, 'search');
  until(
    sim,
    () => !sim.wanted.stars,
    700,
    () => ({ up: true }),
  );
  assert.equal(sim.player, h);
  assert.equal(sim.cash, 400);
  assert.equal(sim.city.active, null);
  const resumed = city(run.saved()).sim;
  tick(resumed, 120);
  assert.equal(resumed.flight.pilot.id, h.id);
  assert.equal(resumed.wanted.stars, 0);
  assert.equal(resumed.cash, 400);
});

test('a further capture still has a landing site when every roof already holds a parked aircraft', () => {
  const pads = city().api.helipads;
  const parked = pads.map((p, i) => ({
    id: 'air-' + (i + 1),
    x: p.x,
    y: p.y,
    z: p.z,
    mode: 'parked',
    padId: p.id,
  }));
  const run = city({ version: 1, flight: { craft: parked } });
  const h = takeOff(run),
    s = run.sim;
  assert.equal(h.id, 'air-9');
  assert.equal(s.flight.craft.length, 8);
  assert.equal(s.flight.guidePad.id, pads[0].id);
  flyTo(run, pads[0].id);
  s.flight.action();
  until(s, () => h.mode === 'parked');
  assert.equal(new Set(s.flight.craft.map((c) => c.padId)).size, 8);
});
