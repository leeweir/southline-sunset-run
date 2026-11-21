const test = require('node:test');
const assert = require('node:assert/strict');
const { city, tick } = require('./simulation.cjs');

function reach(sim, target = sim.target) {
  Object.assign(sim.player, { x: target.x, y: target.y, speed: 0 });
}

test('a completed three-job v1 save opens the next chapter with its wallet and original car', () => {
  const { sim } = city({ version: 1, done: 3, mode: 'free', cash: 1220, carId: 'tide', phase: 'pickup' });
  assert.equal(sim.mode, 'free');
  sim.begin('story');
  assert.equal(sim.job.title, '退潮的声音');
  assert.equal(sim.cash, 1220);
  assert.equal(sim.car.id, 'tide');
  assert.equal(sim.target.id, 'radio');
});

test('recordings need a stationary stop, resume at the saved time, and advance only once', () => {
  const run = city({ version: 1, done: 5, mode: 'story', phase: 'delivery' });
  let sim = run.sim;
  reach(sim);
  sim.car.speed = 35;
  sim.advanceJob(0.5);
  assert.equal(sim.hold, 0);
  sim.car.speed = 0;
  tick(sim, 35);
  assert.ok(sim.hold > 0.5);
  sim.save();
  const time = sim.hold;
  sim = city(run.saved()).sim;
  sim.begin('story');
  assert.equal(sim.hold, time);
  tick(sim, 96);
  assert.equal(sim.storyIndex, 1);
  assert.equal(sim.target.id, 'pier');
  assert.equal(sim.cash, 0);
  tick(sim, 180);
  assert.equal(sim.storyIndex, 1);
  reach(sim);
  tick(sim, 123);
  assert.equal(sim.storyIndex, 2);
  assert.equal(sim.target.id, 'radio');
});

test('an interview requires walking and the rooftop task distinguishes the sidewalk, cabin and roof', () => {
  const { sim: interview } = city({ version: 1, done: 4, mode: 'story', phase: 'delivery' });
  reach(interview);
  tick(interview, 180);
  assert.equal(interview.storyIndex, 0);
  interview.interact();
  reach(interview);
  tick(interview, 91);
  assert.equal(interview.storyIndex, 1);
  const run = city({ version: 1, done: 6, mode: 'story', phase: 'delivery' }),
    sim = run.sim;
  const pad = run.api.helipads.find((p) => p.id === 'tides');
  sim.interact();
  reach(sim, pad.street);
  tick(sim, 180);
  assert.equal(sim.storyIndex, 0);
  sim.flight.action();
  assert.equal(sim.flight.roof, pad);
  tick(sim, 125);
  assert.equal(sim.target.id, 'stage');
  assert.equal(sim.storyIndex, 1);
  const cabin = city({
    version: 1,
    done: 6,
    mode: 'story',
    phase: 'delivery',
    flight: {
      pilot: 'air-1',
      craft: [{ id: 'air-1', mode: 'parked', padId: 'tides', x: pad.x, y: pad.y, z: pad.z }],
    },
  });
  tick(cabin.sim, 180);
  assert.equal(cabin.sim.storyIndex, 0);
});

test('nine ordered episodes reach the radio sign-off, pay once, and support free play and replay', () => {
  const run = city(),
    { sim, world } = run;
  sim.begin('story');
  for (const [index, job] of world.jobs.entries()) {
    assert.equal(sim.job, job);
    if (sim.car) sim.interact();
    reach(sim);
    tick(sim, 21);
    assert.equal(sim.phase, 'delivery');
    for (const stop of job.stops || []) {
      reach(sim);
      if (stop.kind === 'roof') sim.flight.action();
      tick(sim, Math.ceil(stop.seconds * 60) + 2);
      if (stop.kind === 'roof') sim.flight.action();
    }
    reach(sim);
    tick(sim, 21);
    assert.equal(sim.done, index + 1);
    assert.ok(run.events.some((e) => e.type === 'reward' && e.message.reply === job.reply));
  }
  assert.equal(sim.mode, 'free');
  assert.equal(world.jobs.length, 9);
  const wallet = sim.cash;
  assert.equal(
    wallet,
    world.jobs.reduce((total, j) => total + j.pay + 80, 0),
  );
  const resumed = city(run.saved()).sim;
  tick(resumed, 180);
  assert.equal(resumed.cash, wallet);
  resumed.begin('story');
  assert.equal(resumed.done, 0);
  assert.equal(resumed.storyIndex, 0);
  assert.equal(resumed.cash, wallet);
});
