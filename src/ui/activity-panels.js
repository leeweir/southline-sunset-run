import { icon, button, heading } from './dom.js';
import { activities, timing, rent, paints } from '../game/activities.js';
function activityChoice(kind, label, description, disabled = false, action = 'start-' + kind) {
  return (
    '<button class="activity-choice" data-do="' +
    action +
    '" ' +
    (disabled ? 'disabled' : '') +
    '>' +
    icon(activities[kind].icon) +
    '<span><strong>' +
    label +
    '</strong><small>' +
    description +
    '</small></span><b aria-hidden="true">›</b></button>'
  );
}
export function activityBoard(sim, playing) {
  const city = sim.city,
    a = city.active;
  if (a) {
    const spec = activities[a.kind],
      brief = city.summary;
    return (
      heading('CITY DISPATCH', spec.title) +
      '<div class="dialog-content"><p class="reward-title">' +
      brief[0] +
      '</p><p>' +
      brief[1] +
      '</p><p class="guide-note">' +
      spec.detail +
      '</p><div class="dialog-actions">' +
      button('activity-resume', playing ? '继续活动' : '返回街头', true, 'play') +
      button('map', '查看地图', false, 'map') +
      (city.garage.nearby ? button('garage', '进入车库') : '') +
      button('activity-stop', a.kind === 'heat' ? '退出挑战，保留通缉' : '结束这项活动') +
      '</div></div>'
    );
  }
  const policeReady = sim.car?.patrol && !sim.wanted.stars;
  const heatReady = sim.car && !sim.wanted.stars;
  return (
    heading('SOUTH BAY DISPATCH', '城市活动') +
    '<div class="dialog-content activity-board">' +
    activityChoice(
      'dispatch',
      '警车电台',
      policeReady ? '调度在线 · 跟踪目标司机 · $420' : '抢到巡逻车并甩开通缉后可接警',
      !policeReady,
    ) +
    activityChoice('escort', '接应司机', '霓虹俱乐部 → 海岸露天剧场 · $360') +
    activityChoice(
      'race',
      '海岸计时赛',
      city.best
        ? '个人最佳 ' + timing(city.best.time) + ' · 挑战自己的车影'
        : '落日唱片行 → 南湾码头 · 记录最佳车影',
    ) +
    activityChoice(
      'garage',
      '海风旅馆车库',
      city.garage.slots.length
        ? '已租 ' + city.garage.slots.length + ' 个车位 · 收藏与换色'
        : '首个车位 $' + rent[0] + ' · 收藏与换色',
      false,
      'garage',
    ) +
    '<div class="heat-choice"><div>' +
    icon('star') +
    '<strong>高星追逐</strong></div><small>' +
    (heatReady ? '五星可夺取低飞的警用直升机，甩开追兵有赏金' : '驾驶车辆并解除当前通缉后可挑战') +
    '</small><div class="heat-buttons">' +
    '<button data-do="start-heat-3" ' +
    (heatReady ? '' : 'disabled') +
    '>三星路障 · $240</button><button data-do="start-heat-5" ' +
    (heatReady ? '' : 'disabled') +
    '>五星空巡 · $400</button></div></div></div>'
  );
}
export function garagePanel(sim) {
  const g = sim.city.garage;
  const bays = g.slots
    .map((id, i) => {
      const car = sim.city.car(id);
      const controls = car
        ? '<div class="swatches">' +
          paints
            .map(
              ([name, hex]) =>
                '<button aria-label="喷漆 · ' +
                name +
                '" aria-pressed="' +
                (car.color === hex) +
                '" style="--paint:' +
                hex +
                '" data-garage="paint" data-bay="' +
                i +
                '" data-paint="' +
                hex +
                '"></button>',
            )
            .join('') +
          '</div>'
        : '';
      return (
        '<div class="garage-bay">' +
        (car
          ? '<canvas class="bay-car" width="164" height="92" data-car-preview="' +
            i +
            '" aria-label="' +
            car.name +
            '的当前车色"></canvas>'
          : '') +
        '<div><small>车位 ' +
        (i + 1) +
        '</small><strong>' +
        (car ? car.name : '空车位') +
        '</strong></div>' +
        '<button data-garage="' +
        (car ? 'take' : 'park') +
        '" data-bay="' +
        i +
        '" ' +
        ((car ? !!sim.car : !sim.car) ? 'disabled' : '') +
        '>' +
        (car ? '取出驾驶' : '存入当前车') +
        '</button>' +
        controls +
        '</div>'
      );
    })
    .join('');
  return (
    heading('BREEZE MOTOR LODGE', '海风旅馆车库') +
    '<div class="dialog-content"><div class="pay-row">钱包<b>$' +
    sim.cash +
    '</b></div>' +
    '<p class="guide-note">' +
    (sim.car ? '当前驾驶 ' + sim.car.name + '，存入后可选颜色。' : '步行到店，取车后可直接驾驶。') +
    '</p>' +
    bays +
    (g.price
      ? '<div class="garage-rent"><button data-garage="rent" ' +
        (sim.cash < g.price ? 'disabled' : '') +
        '>租下车位 · $' +
        g.price +
        '</button>' +
        (sim.cash < g.price
          ? '<small>还差 $' + (g.price - sim.cash) + '，完成委托或比赛可赚钱。</small>'
          : '') +
        '</div>'
      : '') +
    '<div class="dialog-actions">' +
    button('resume', '回到街头', true, 'play') +
    '</div></div>'
  );
}
