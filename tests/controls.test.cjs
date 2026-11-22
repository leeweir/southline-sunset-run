const test = require('node:test');
const assert = require('node:assert/strict');
const { city, tick } = require('./simulation.cjs');

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function screen(world, dx, dy) {
  const g = world.ground;
  return { x: g.screenXFromX * dx + g.screenXFromY * dy, y: g.screenYFromX * dx + g.screenYFromY * dy };
}
// The stick push that points at a world direction on screen.
function stickToward(world, dx, dy) {
  const s = screen(world, dx, dy),
    n = Math.hypot(s.x, s.y);
  return { stickX: s.x / n, stickY: s.y / n };
}

test('the touch stick turns the car toward the push, and pulling back from a stop reverses', () => {
  const { sim, world } = city();
  sim.begin('free');
  const car = sim.car;
  Object.assign(car, { x: 2 * world.step, y: 3 * world.step, a: 0, speed: 0 });
  const north = stickToward(world, 0, -1);
  tick(sim, 75, north);
  assert.ok(Math.abs(wrap(car.a + Math.PI / 2)) < 0.12, 'heading follows the stick');
  assert.ok(car.speed > 30 && car.y < 3 * world.step - 20);
  car.speed = 0;
  const y = car.y;
  tick(sim, 40, stickToward(world, 0, 1));
  assert.ok(car.speed < -10, 'pulling back reverses');
  assert.ok(car.y > y + 5);
  assert.ok(Math.abs(wrap(car.a + Math.PI / 2)) < 0.12, 'reversing keeps the nose pointed away');
  tick(sim, 40);
  assert.equal(sim.reversing, false);
});

test('walking follows the stick in screen space at the pushed strength', () => {
  const { sim, world } = city();
  sim.begin('free');
  sim.interact();
  const start = { ...sim.foot };
  tick(sim, 30, { stickX: 0, stickY: -1 });
  const moved = screen(world, sim.foot.x - start.x, sim.foot.y - start.y);
  assert.ok(moved.y < -10 && Math.abs(moved.x) < 0.5, 'a push straight up walks straight up the screen');
  const full = Math.hypot(sim.foot.x - start.x, sim.foot.y - start.y);
  const half = { ...sim.foot };
  tick(sim, 30, { stickX: 0, stickY: -0.5 });
  const gentle = Math.hypot(sim.foot.x - half.x, sim.foot.y - half.y);
  assert.ok(gentle < full * 0.9 && gentle > full * 0.5);
});

test('witnessed crimes fill the heat bar, and four stars send the helicopter', () => {
  const { sim, events } = city();
  sim.begin('free');
  sim.interact();
  tick(sim, 30, { right: true });
  sim.interact();
  const w = sim.wanted;
  assert.equal(w.stars, 1);
  tick(sim, 1);
  assert.ok(w.inSight);
  // Driving into a cruiser in front of its crew adds six seconds of heat at once.
  const car = sim.car,
    cruiser = w.cruisers[0],
    before = w.continuous;
  Object.assign(car, { a: 0, speed: 60 });
  Object.assign(cruiser, { x: car.x + 16, y: car.y, a: Math.PI, speed: 0 });
  tick(sim, 1, { up: true });
  assert.ok(w.continuous >= before + 6);
  assert.ok(w.heatFraction > 0);
  w.report(car);
  w.report(car);
  tick(sim, 1);
  assert.equal(w.stars, 3);
  assert.equal(w.helicopter, null);
  w.continuous = w.escalation - 0.001;
  for (let i = 0; i < 30 && w.stars < 4; i++) tick(sim, 1);
  assert.equal(w.stars, 4);
  tick(sim, 1);
  assert.ok(w.helicopter);
  assert.ok(events.some((e) => e.type === 'alert' && /4 星通缉 · 直升机出动/.test(e.message)));
});
