import { Drive } from './game/drive.js';
import { world, distance } from './game/world.js';
import { activities } from './game/activities.js';
import { helipads } from './game/flight.js';
import { carArt } from './render/city-art.js';
import { mapDraw } from './render/view.js';
import { Radio } from './audio.js';
import { StreetRuntime } from './runtime.js';
import { $, icon } from './ui/dom.js';
import { renderHUD } from './ui/hud.js';
import { setupControls } from './ui/input.js';
import { panelContent } from './ui/panels.js';
const menu = $('#menu'),
  play = $('#play'),
  sheet = $('#sheet'),
  body = $('#sheet-body'),
  toast = $('#toast');
const sim = new Drive(onEvent),
  radio = new Radio();
let playing = false,
  starting = false,
  runtime;
let modal = '',
  parentModal = '',
  selected = world.stops[0],
  lastReward = null,
  activityResult = null,
  caughtTitle = '',
  toastTimer = 0,
  audioBusy = false;

const controls = setupControls(sim, () => ({ playing, starting, modal, sheetOpen: sheet.open }), action);
function updateHUD() {
  if (playing) {
    controls.syncVehicle();
    renderHUD(sim, controls.values);
  }
}
function updateInstruments() {
  updateHUD();
  const pilot = sim.flight.pilot;
  radio.engine(
    pilot ? Math.hypot(pilot.vx, pilot.vy) : sim.car?.speed || 0,
    sim.wanted.loudness,
    !!pilot && pilot.mode !== 'parked',
  );
}
function notice(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
function activityError(message) {
  if (!sheet.open) return notice(message);
  let feedback = body.querySelector('.activity-error');
  if (!feedback) {
    feedback = document.createElement('p');
    feedback.className = 'activity-error';
    feedback.setAttribute('role', 'status');
    body.querySelector('.dialog-content').prepend(feedback);
  }
  feedback.textContent = message;
}
function onEvent(type, message) {
  if (type === 'bump') {
    radio.fx('bump');
    // A short buzz on phones that support it; ignored elsewhere.
    if (playing) navigator.vibrate?.(28);
    return;
  }
  if (type === 'garage') openModal('garage');
  else if (type === 'activityResult') {
    activityResult = message;
    radio.fx('reward');
    openModal('activityResult');
  } else if (type === 'caught') {
    caughtTitle = message;
    openModal('caught');
  } else if (type === 'reward') {
    lastReward = message;
    radio.fx('reward');
    openModal('reward');
  } else {
    if (type === 'pickup' || type === 'escaped') radio.fx('pickup');
    notice(message);
  }
  updateHUD();
}
function refreshMenu() {
  $('#start-label').textContent = sim.city.active
    ? '继续' + activities[sim.city.active.kind].title
    : sim.done === world.jobs.length
      ? '重玩委托'
      : sim.hasSave
        ? '继续驾驶'
        : '开始驾驶';
  $('#save-label').textContent = sim.storageAvailable
    ? sim.hasSave
      ? '进度已保存'
      : '本地自动存档'
    : '仅本次游玩';
}
function soundUI() {
  document.body.classList.toggle('radio-on', radio.on);
  document.querySelectorAll('.sound-btn').forEach((b) => {
    b.setAttribute('aria-label', radio.on ? '关闭声音' : '开启声音');
    b.setAttribute('aria-pressed', String(radio.on));
    b.querySelector('use').setAttribute('href', radio.on ? '#i-sound' : '#i-mute');
    b.querySelector('span').textContent = radio.on ? '声音开' : '声音关';
  });
  $('.station').setAttribute('aria-label', radio.on ? '暂停南湾电台' : '播放南湾电台');
  const inGame = $('[data-do="audio"].pause-audio');
  if (inGame) inGame.innerHTML = icon(radio.on ? 'sound' : 'mute') + (radio.on ? '关闭电台' : '打开电台');
}
async function sound() {
  if (audioBusy) return;
  if (!radio.usable) {
    notice('当前浏览器未提供音频播放');
    return;
  }
  audioBusy = true;
  try {
    await radio.toggle();
    soundUI();
  } catch {
    notice('声音未能开启，点按电台可以重试');
  } finally {
    audioBusy = false;
  }
}
async function start(mode) {
  if (starting) return;
  starting = true;
  $('#start-label').textContent = '正在发动…';
  try {
    closeModal(false);
    playing = true;
    menu.hidden = true;
    play.hidden = false;
    controls.clear();
    sim.begin(mode);
    runtime ||= new StreetRuntime($('#canvas-host'), sim, controls.values, updateInstruments);
    runtime.resetCamera();
    runtime.resume();
    updateHUD();
    document.activeElement?.blur();
    const coarse = matchMedia('(pointer:coarse)').matches || innerWidth <= 620;
    notice(
      sim.city.active
        ? '已续接 · ' + activities[sim.city.active.kind].title
        : sim.wanted.stars
          ? '已续接 ' + sim.wanted.stars + ' 星通缉'
          : mode === 'free'
            ? '自由漫游 · 徒步靠近任意车辆即可上车'
            : coarse
              ? '左半屏按住拖动摇杆，推向哪就往哪开'
              : 'W 加速 · A / D 转向 · S 刹车',
    );
  } catch (error) {
    console.error(error);
    playing = false;
    menu.hidden = false;
    play.hidden = true;
    notice('游戏引擎未能载入，请重新开始驾驶');
  } finally {
    starting = false;
    refreshMenu();
  }
}
function home() {
  if (playing) sim.save();
  playing = false;
  controls.clear();
  closeModal(false);
  radio.engine(0);
  runtime?.pause();
  menu.hidden = false;
  play.hidden = true;
  refreshMenu();
  toast.classList.remove('show');
  $('[data-do="story"]').focus({ preventScroll: true });
}
function openModal(type) {
  if (starting || (type === 'pause' && !playing)) return;
  if (modal === 'pause' && ['guide', 'map', 'objective', 'activities'].includes(type))
    parentModal = 'pause';
  else if (type === 'pause' || !sheet.open) parentModal = '';
  modal = type;
  controls.clear();
  radio.engine(0);
  if (type === 'map')
    selected =
      playing && sim.flight.pilot
        ? sim.flight.guidePad || helipads[0]
        : world.spot(sim.target?.id) || world.spot(selected?.id) || world.stops[0];
  sheet.classList.toggle('map-sheet', type === 'map');
  body.innerHTML = panelContent(type, { sim, playing, radio, lastReward, activityResult, caughtTitle });
  if (type === 'garage') {
    for (const canvas of body.querySelectorAll('[data-car-preview]')) {
      const car = sim.city.car(sim.city.garage.slots[Number(canvas.dataset.carPreview)]);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(3.9, 0, 0, 3.9, 82, 60);
      carArt(ctx, { ...car, x: 0, y: 0, a: 0.15 }, false, false);
    }
  }
  if (!sheet.open) sheet.showModal();
  if (playing) {
    runtime?.pause();
    sim.save();
  }
  if (type === 'map') {
    selectSpot(selected);
    requestAnimationFrame(paintMap);
  }
  if (type === 'pause') body.querySelector('[data-do="resume"]').focus({ preventScroll: true });
  else body.querySelector('.close')?.focus({ preventScroll: true });
}
function closeModal(back = true) {
  if (!sheet.open) return;
  if (back && parentModal) {
    const p = parentModal;
    parentModal = '';
    openModal(p);
    return;
  }
  parentModal = '';
  modal = '';
  sheet.close();
  controls.clear();
  if (playing && !starting) {
    runtime?.resume();
    updateHUD();
  }
}
function selectSpot(s) {
  if (!s) return;
  selected = s;
  document.querySelectorAll('[data-stop],[data-pad]').forEach((b) => {
    const on = (b.dataset.stop || b.dataset.pad) === s.id;
    b.classList.toggle('chosen', on);
    b.setAttribute('aria-pressed', String(on));
  });
  const desc = $('#map-desc');
  if (desc)
    desc.textContent = s.building
      ? s.name + ' · 楼顶高度 ' + Math.round(s.z * 0.62) + ' 米 · 绿色楼梯通往街边'
      : s.detail;
  paintMap();
}
function paintMap() {
  const c = $('#big-map');
  if (c && sheet.open) mapDraw(c, sim, true, selected);
}
async function full() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else if (document.documentElement.webkitRequestFullscreen)
      document.documentElement.webkitRequestFullscreen();
    else notice('当前浏览器已使用可用的最大视图');
  } catch {
    notice('当前窗口无法切换全屏');
  }
}
async function action(act) {
  if (act.startsWith('start-') || act === 'garage' || act === 'activity-resume') {
    if (starting) return;
    if (!playing) await start(sim.city.active ? sim.mode : 'free');
    if (!playing) return;
    if (act === 'activity-resume') {
      closeModal(false);
      return;
    }
    if (act === 'garage' && sim.city.garage.nearby) {
      openModal('garage');
      return;
    }
    const [, kind, level] = act.split('-');
    const error = sim.city.start(act === 'garage' ? 'garage' : kind, Number(level));
    if (error) {
      activityError(error);
      return;
    }
    closeModal(false);
    updateHUD();
    if (kind === 'dispatch') {
      radio.fx('dispatch');
      notice('调度呼叫 · 一辆' + sim.city.target.name + '正往南湾码头开');
    } else notice(sim.city.summary[0]);
    return;
  }
  switch (act) {
    case 'activity-stop':
      sim.city.cancel();
      openModal('activities');
      break;
    case 'story':
      start(sim.city.active ? sim.mode : 'story');
      break;
    case 'free':
      start('free');
      break;
    case 'home':
      if (playing) home();
      else closeModal(false);
      break;
    case 'resume':
      closeModal(false);
      break;
    case 'close':
      closeModal();
      break;
    case 'map':
    case 'guide':
    case 'objective':
    case 'pause':
    case 'activities':
      openModal(act);
      break;
    case 'full':
      full();
      break;
    case 'audio':
      sound();
      break;
    case 'interact':
    case 'flight':
    case 'cycle-vehicle':
      if (playing && !sheet.open) {
        if (act === 'interact') sim.interact();
        else if (act === 'flight') {
          if (sim.flight.pilot?.mode === 'cruise' && !sim.flight.landingPad) openModal('map');
          else sim.flight.action();
        } else sim.cycleVehicle();
        updateHUD();
      }
      break;
    case 'sprint':
      if (playing && !sheet.open && !sim.car && !sim.flight.pilot) {
        controls.toggleSprint();
      }
      break;
    case 'recover':
      sim.recover();
      runtime?.resetCamera();
      closeModal(false);
      break;
    case 'mode':
      sim.begin(sim.mode === 'story' ? 'free' : 'story');
      closeModal(false);
      notice(sim.mode === 'story' ? '已接入电台委托' : '已切换自由漫游');
      break;
    case 'navigate-air':
      if (sim.flight.pilot && selected?.building && !sim.flight.occupied(selected)) {
        sim.flight.destination = selected.id;
        sim.save();
        closeModal(false);
        notice('楼顶航线 · ' + selected.name);
      }
      break;
    case 'navigate': {
      sim.waypoint = selected.id;
      if (!playing) {
        closeModal(false);
        start('free');
      } else {
        sim.begin('free');
        closeModal(false);
        notice('导航至' + selected.name);
      }
      break;
    }
  }
}
document.addEventListener('click', (e) => {
  const garageButton = e.target.closest('[data-garage]');
  if (garageButton && modal === 'garage') {
    const { garage, bay, paint } = garageButton.dataset;
    const error = sim.city.garage.transact(garage, Number(bay), paint);
    if (error) activityError(error);
    else if (garage === 'take') {
      closeModal(false);
      updateHUD();
      notice('已取出' + sim.car.name);
    } else {
      openModal('garage');
      updateHUD();
    }
    return;
  }
  const stop = e.target.closest('[data-stop],[data-pad]');
  if (stop) {
    selectSpot(
      stop.dataset.pad ? helipads.find((p) => p.id === stop.dataset.pad) : world.spot(stop.dataset.stop),
    );
    return;
  }
  const b = e.target.closest('[data-do]');
  if (b) {
    action(b.dataset.do);
    return;
  }
  if (e.target.id === 'big-map') {
    const c = e.target,
      rect = c.getBoundingClientRect(),
      m = mapDraw(c, sim, true, selected),
      pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const near = (
      sim.flight.pilot && playing ? helipads.filter((p) => !sim.flight.occupied(p)) : world.stops
    )
      .map((s) => ({ s, d: distance(m.xy(s.x, s.y), pt) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d < 24) selectSpot(near.s);
  }
});
sheet.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeModal();
});
sheet.addEventListener('click', (e) => {
  if (e.target !== sheet) return;
  const r = sheet.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal();
});
window.addEventListener('resize', () => {
  runtime?.resize();
  if (sheet.open && modal === 'map') requestAnimationFrame(paintMap);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    controls.clear();
    if (playing && !sheet.open && !starting) openModal('pause');
  }
});
window.addEventListener('pagehide', () => {
  if (playing) sim.save();
});
soundUI();
refreshMenu();
