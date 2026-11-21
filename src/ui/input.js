import { $ } from './dom.js';
export function setupControls(sim, state, action) {
  const input = { up: false, down: false, left: false, right: false, hand: false };
  const physical = new Set(),
    fingers = new Map();
  const controls = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    Space: 'hand',
  };
  let touchSprint = false;
  function updateInput() {
    for (const k of Object.keys(input)) input[k] = false;
    for (const code of physical) if (controls[code]) input[controls[code]] = true;
    for (const k of fingers.values()) input[k] = true;
    if (touchSprint && !sim.car && !sim.flight.pilot) input.hand = true;
    $('[data-do="sprint"]').setAttribute('aria-pressed', String(touchSprint));
    document
      .querySelectorAll('[data-key]')
      .forEach((el) => el.classList.toggle('pressed', input[el.dataset.key]));
  }
  function clearInput() {
    physical.clear();
    fingers.clear();
    touchSprint = false;
    updateInput();
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const { playing, starting, modal, sheetOpen } = state();
    if (sheetOpen) {
      if (e.code === 'KeyJ' && !e.repeat && modal === 'activities') {
        e.preventDefault();
        action('close');
        return;
      }
      if (e.code === 'KeyM' && !e.repeat && modal === 'map') {
        e.preventDefault();
        action('close');
      }
      return;
    }
    if (playing && controls[e.code]) {
      e.preventDefault();
      physical.add(e.code);
      updateInput();
      return;
    }
    if (e.repeat || starting) return;
    if (e.code === 'KeyJ') {
      e.preventDefault();
      action('activities');
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      action('map');
    } else if (playing && e.code === 'Escape') {
      e.preventDefault();
      action('pause');
    } else if (playing && e.code === 'KeyF') {
      e.preventDefault();
      action('flight');
    } else if (playing && e.code === 'KeyE') {
      e.preventDefault();
      action('interact');
    } else if (playing && e.code === 'KeyQ') {
      e.preventDefault();
      action('cycle-vehicle');
    } else if (!playing && e.code === 'Enter' && !e.target.closest('button')) {
      e.preventDefault();
      action('story');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (physical.delete(e.code)) updateInput();
  });
  document.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (!state().playing || state().sheetOpen) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      fingers.set(e.pointerId, el.dataset.key);
      updateInput();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
      el.addEventListener(ev, (e) => {
        if (fingers.delete(e.pointerId)) updateInput();
      });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  window.addEventListener('blur', clearInput);
  return {
    values: input,
    clear: clearInput,
    toggleSprint() {
      touchSprint = !touchSprint;
      updateInput();
    },
    syncVehicle() {
      if (touchSprint && (sim.car || sim.flight.pilot)) {
        touchSprint = false;
        updateInput();
      }
    },
  };
}
