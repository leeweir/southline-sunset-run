const { Drive } = require('../src/game/drive.js');
const { world } = require('../src/game/world.js');
const { gates } = require('../src/game/activities.js');
const { helipads } = require('../src/game/flight.js');

function city(initialSave) {
  let data = initialSave ? JSON.stringify(initialSave) : null;
  const events = [];
  const storage = {
    getItem: () => data,
    setItem: (_, value) => {
      data = value;
    },
  };
  const sim = new Drive((type, message) => events.push({ type, message }), storage);
  return { sim, world, api: { helipads, gates }, events, saved: () => JSON.parse(data) };
}
function tick(sim, frames, controls = {}) {
  for (let frame = 0; frame < frames; frame++) sim.step(1 / 60, controls);
}
module.exports = { city, tick };
