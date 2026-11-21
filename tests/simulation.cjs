const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = ['world', 'flight', 'pursuit', 'activities', 'drive'].map((name) => {
  const file = path.join(__dirname, '..', 'dist', 'js', name + '.js');
  return new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
});
function city(initialSave) {
  let data = initialSave ? JSON.stringify(initialSave) : null;
  const window = {},
    events = [];
  const context = vm.createContext({
    window,
    localStorage: {
      getItem: () => data,
      setItem: (_, value) => {
        data = value;
      },
    },
  });
  for (const script of scripts) script.runInContext(context);
  const sim = new window.Southline.Drive((type, message) => events.push({ type, message }));
  return {
    sim,
    world: window.Southline.world,
    api: window.Southline,
    events,
    saved: () => JSON.parse(data),
  };
}
function tick(sim, frames, controls = {}) {
  for (let i = 0; i < frames; i++) sim.step(1 / 60, controls);
}
module.exports = { city, tick };
