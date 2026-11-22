import { $ } from './dom.js';
import { world, distance, clamp } from '../game/world.js';
import { activities } from '../game/activities.js';
import { mapDraw } from '../render/view.js';
function updateWanted(sim) {
  const wanted = sim.wanted,
    active = wanted.stars > 0,
    searching = wanted.phase === 'search';
  const intercept = active && wanted.intercept > 0.15;
  const phase = intercept ? 'intercept' : wanted.phase;
  $('#wanted').dataset.phase = phase;
  const stars = $('#wanted-stars');
  stars.setAttribute('aria-label', '通缉 ' + wanted.stars + ' 星，共 5 星');
  Array.from(stars.children).forEach((star, i) => star.classList.toggle('lit', i < wanted.stars));
  $('#wanted-readout').hidden = !active;
  $('#wanted-meter').hidden = !(intercept || searching);
  // Heat toward the next star: time in view plus crimes the police witness.
  const heat = $('#wanted-heat');
  heat.hidden = !active || wanted.stars >= 5;
  heat.firstElementChild.style.transform = 'scaleX(' + wanted.heatFraction + ')';
  if (!active) return;
  const walkers = wanted.units.filter((u) => u.officer);
  const cars = wanted.units.length - walkers.length;
  let state = '警车追击';
  if (intercept) state = sim.car ? '即将被截停' : '即将被抓获';
  else if (searching) state = '警方搜寻';
  else if (wanted.helicopter?.lowPass) state = '空巡正在低飞';
  else if (wanted.helicopter?.spotted) state = '空巡发现了你';
  else if (wanted.helicopter) state = '直升机巡查';
  else if (wanted.aircraftTaken && sim.flight.height) state = '地面警力追踪';
  else if (wanted.roadblock) state = '路口设有路障';
  else if (walkers.some((u) => u.officer.pickupCar)) state = '警员正在征车';
  else if (wanted.vehicles.some((c) => c.id && !c.officer)) state = '征用车辆追击';
  else if (walkers.some((u) => !u.officer.returning)) state = '警员徒步追赶';
  else if (walkers.length && !cars)
    state = walkers.some((u) => !u.patrol) ? '警员返回车辆' : '警员返回警车';
  const readout = $('#wanted-state');
  if (readout.textContent !== state) readout.textContent = state;
  $('#wanted-clock').textContent = intercept
    ? Math.ceil(wanted.captureRemaining) + ' 秒'
    : searching
      ? Math.ceil(wanted.remaining) + ' 秒'
      : [walkers.length && walkers.length + '人', cars && cars + '辆'].filter(Boolean).join(' · ');
  const progress = intercept ? wanted.captureFraction : wanted.remaining / wanted.searchDuration;
  $('#wanted-meter i').style.transform = 'scaleX(' + clamp(progress, 0, 1) + ')';
}
export function renderHUD(sim, input) {
  const target = sim.target,
    job = sim.job,
    active = sim.city.active,
    isJob = !active && sim.mode === 'story' && job,
    car = sim.car,
    flight = sim.flight,
    pilot = flight.pilot,
    stop = isJob && sim.storyStop,
    airBrief = stop?.kind === 'roof' && flight.roof?.id === stop.place ? null : flight.briefing;
  $('#job-meta').textContent = airBrief
    ? airBrief[0]
    : active
      ? activities[active.kind].title
      : isJob
        ? '电台委托 ' + (sim.done + 1) + ' / ' + world.jobs.length + ' · ' + job.title
        : '自由漫游';
  const brief = sim.city.summary;
  $('#job-goal').textContent = airBrief
    ? airBrief[1]
    : brief
      ? brief[0]
      : isJob
        ? stop
          ? stop.label
          : (sim.phase === 'pickup' ? '取件 · ' : '送达 · ') + target.name
        : target
          ? '导航 · ' + target.name
          : '探索南湾市';
  let detail = car?.patrol && !sim.wanted.stars ? '警车电台可接警 · 城市活动' : '城市活动 · 点击查看行程';
  if (brief) detail = brief[1];
  else if (target) {
    const m = Math.round(distance(sim.player, target) * 0.62);
    detail = m < 24 ? '在金色光圈内减速停留' : m + ' 米 · 跟随金色路线';
    if (isJob && sim.phase === 'delivery' && m >= 24) {
      const remaining = Math.ceil(Math.max(0, job.limit - sim.elapsed));
      detail += remaining ? ' · 奖励 ' + remaining + ' 秒' : ' · 仍可交付';
    }
    if (stop) {
      const instruction = {
        roof: flight.roof?.id === stop.place ? '在绿色楼梯口校准' : '步行到楼梯口按 F 上天台',
        foot: '下车步行进入金色光圈',
        record: '在光圈内停稳录音',
        stop: '在光圈内停稳取件',
      }[stop.kind];
      detail =
        sim.hold > 0
          ? '进行中 · ' + Math.min(100, Math.floor((sim.hold / stop.seconds) * 100)) + '%'
          : target.name + ' · ' + (m > 30 ? m + ' 米' : instruction);
    }
  }
  if (!brief && sim.wanted.helicopter && car) detail = '下车等空巡低飞，靠近悬梯可夺机';
  $('#job-detail').textContent = airBrief ? airBrief[2] : detail;
  $('#district').textContent = world.district(sim.player);
  const minutes = 18 * 60 + 15 + Math.floor(sim.cityTime * 0.56);
  $('#city-clock').textContent = Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0');
  const sprinting = !car && !pilot && sim.walking && input.hand;
  $('#vehicle-icon').setAttribute('href', pilot ? '#i-heli' : car ? '#i-wheel' : '#i-walk');
  $('#interact-icon').setAttribute('href', pilot || flight.roof ? '#i-heli' : '#i-upcar');
  $('#vehicle').textContent = pilot
    ? '南湾警用直升机'
    : car
      ? car.name
      : flight.roof
        ? '天台步行'
        : sprinting
          ? '徒步疾跑'
          : '步行探索';
  $('#speed-num').textContent = pilot
    ? Math.round(Math.hypot(pilot.vx, pilot.vy) * 0.73)
    : car
      ? Math.round(Math.abs(car.speed) * 0.73)
      : sprinting
        ? '8'
        : sim.walking
          ? '5'
          : '0';
  $('#altitude').hidden = !flight.height;
  $('#altitude').textContent = flight.height ? '高度 ' + Math.round(flight.height * 0.62) + ' 米' : '';
  $('[data-key="hand"]').hidden = !car;
  $('[data-do="sprint"]').hidden = !!(car || pilot);

  const choices = sim.nearbyVehicles;
  const targetCar = sim.targetAmong(choices);
  const theft = targetCar && (!targetCar.claimed || targetCar.onDuty);
  const wanted = sim.wanted.stars > 0;
  let label = '靠近车辆';
  if (pilot) label = '离开机舱';
  else if (flight.roof) label = flight.boardable ? '登上直升机' : '下楼';
  else if (car) label = sim.canBail ? '弃车' : '下车';
  else if (targetCar?.fugitive) label = '截下目标车';
  else if (theft && targetCar.patrol) label = '抢警车';
  else if (theft) label = wanted ? '换车' : '抢车';
  else if (targetCar) label = '上车';
  $('#interact-label').textContent = label;
  $('[data-do="interact"]').hidden =
    (pilot && pilot.mode !== 'parked') || (!!flight.roof && !flight.boardable);
  const flightAction = flight.actionLabel;
  $('[data-do="flight"]').hidden = !flightAction || (flight.roof && flightAction === '登上直升机');
  $('#flight-label').textContent = flightAction;
  $('[data-do="interact"]').classList.toggle('theft-ready', !!theft);
  $('[data-do="cycle-vehicle"]').hidden = choices.length < 2;
  const targetLabel = $('#vehicle-target');
  targetLabel.hidden = !targetCar;
  targetLabel.textContent = targetCar
    ? targetCar.name +
      (choices.length > 1 ? ' · ' + (choices.indexOf(targetCar) + 1) + '/' + choices.length : '')
    : '';
  $('#wallet').textContent = '$' + sim.cash.toLocaleString('en-US');
  updateWanted(sim);
  mapDraw($('#mini'), sim, false);
}
