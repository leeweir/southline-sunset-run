import { $ } from './dom.js';
import { clamp } from '../game/world.js';

// Full lock at this drag distance in CSS pixels; the knob stops at the ring's edge.
const STICK_REACH = 48;
const DEAD_ZONE = 0.14;
const keys = ['up', 'down', 'left', 'right', 'hand'];

export function setupControls(sim, state, action) {
  const input = { up: false, down: false, left: false, right: false, hand: false, stickX: 0, stickY: 0 };
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
    for (const k of keys) input[k] = false;
    for (const code of physical) if (controls[code]) input[controls[code]] = true;
    for (const k of fingers.values()) input[k] = true;
    if (touchSprint && !sim.car && !sim.flight.pilot) input.hand = true;
    $('[data-do="sprint"]').setAttribute('aria-pressed', String(touchSprint));
    document
      .querySelectorAll('[data-key]')
      .forEach((el) => el.classList.toggle('pressed', input[el.dataset.key]));
  }

  // A floating thumb stick: it appears under the thumb and pushes in screen space.
  const zone = $('#stick-zone'),
    ring = $('#stick'),
    knob = $('#stick-knob');
  let stickId = null,
    originX = 0,
    originY = 0;
  function moveStick(e) {
    const dx = e.clientX - originX,
      dy = e.clientY - originY,
      length = Math.hypot(dx, dy),
      reach = Math.min(length, STICK_REACH),
      scale = length ? reach / length : 0;
    knob.style.transform = 'translate(' + dx * scale + 'px, ' + dy * scale + 'px)';
    const push = clamp((reach / STICK_REACH - DEAD_ZONE) / (1 - DEAD_ZONE), 0, 1);
    input.stickX = length ? (dx / length) * push : 0;
    input.stickY = length ? (dy / length) * push : 0;
  }
  function releaseStick() {
    stickId = null;
    input.stickX = input.stickY = 0;
    ring.classList.remove('held');
    ring.style.removeProperty('left');
    ring.style.removeProperty('top');
    knob.style.removeProperty('transform');
  }
  zone.addEventListener('pointerdown', (e) => {
    const { playing, sheetOpen } = state();
    if (!playing || sheetOpen || stickId !== null) return;
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    stickId = e.pointerId;
    const box = zone.getBoundingClientRect(),
      margin = ring.offsetWidth / 2;
    // Keep the whole ring on screen when the thumb lands near an edge.
    originX = clamp(e.clientX, box.left + margin, box.right - margin);
    originY = clamp(e.clientY, box.top + margin, box.bottom - margin);
    ring.style.left = originX - box.left + 'px';
    ring.style.top = originY - box.top + 'px';
    ring.classList.add('held');
    moveStick(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    zone.addEventListener(ev, (e) => {
      if (e.pointerId === stickId) releaseStick();
    });
  zone.addEventListener('contextmenu', (e) => e.preventDefault());

  function clearInput() {
    physical.clear();
    fingers.clear();
    touchSprint = false;
    releaseStick();
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
