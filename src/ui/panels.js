import { icon, button, row, heading, payRow } from './dom.js';
import { activities } from '../game/activities.js';
import { world } from '../game/world.js';
import { helipads } from '../game/flight.js';
import { chapterFor } from '../game/story.js';
import { activityBoard, garagePanel } from './activity-panels.js';
const guideNotes = [
  '五星时下车，等空巡直升机把悬梯放到身边，按 F 夺机。用方向键或 WASD 飞行，松手悬停，M 打开楼顶航图。飞近 H 按 F 降落，E 离舱。绿色楼梯通往街边，飞机会留在楼顶。',
  '街上每辆车都能开，包括执勤警车。步行靠近按 E 上车，多辆车挨在一起时按 Q 或点「切换目标」选车。橙色菱形表示可抢，绿色圆点表示可直接上车。',
  '抢车会引来一星通缉。你弃车时，警员会下车追赶。你开走警车后，警员会就近征用车辆，征用的民用车上方会显示蓝色盾牌。换车保留当前星级，持续被目击会升至最高五星。离开追兵视线，搜寻倒计时归零即可脱身。',
  '步行时按屏幕方向移动，按住空格疾跑。触屏可点「疾跑」切换。做委托时，在金色光圈内减速即可取件或交付。',
];
export function panelContent(type, { sim, playing, radio, lastReward, activityResult, caughtTitle }) {
  if (type === 'activities') return activityBoard(sim, playing);
  if (type === 'garage') return garagePanel(sim);
  if (type === 'activityResult') {
    const r = activityResult;
    return (
      heading('SOUTH BAY DISPATCH', activities[r.kind].title + '完成') +
      '<div class="dialog-content"><p class="reward-title">' +
      r.detail +
      '</p><div class="pay-row">本次报酬<b>+$' +
      r.pay +
      '</b></div><div class="pay-row">当前余额<b>$' +
      sim.cash +
      '</b></div><div class="dialog-actions">' +
      button('resume', '继续驾驶', true, 'play') +
      (r.kind === 'race' ? button('start-race', '再跑一次', false, 'flag') : '') +
      button('activities', '城市活动') +
      '</div></div>'
    );
  }
  if (type === 'guide') {
    const keys = [
      ['加速 / 刹车、倒车', ['W', 'S', '↑', '↓']],
      ['向左 / 向右转向', ['A', 'D', '←', '→']],
      ['手刹 / 步行时奔跑', ['Space']],
      ['上下车 / 抢车 / 追逐中弃车', ['E']],
      ['多辆车靠近时切换目标', ['Q']],
      ['夺取直升机 / 起降 / 上下楼梯', ['F']],
      ['城市活动 / 车库', ['J']],
      ['城市地图 / 暂停', ['M', 'Esc']],
    ];
    return (
      heading('DRIVING MANUAL', '操作指南') +
      '<div class="dialog-content"><dl class="keys">' +
      keys
        .map(
          ([t, k]) =>
            '<div><dt>' + t + '</dt><dd>' + k.map((s) => '<kbd>' + s + '</kbd>').join(' ') + '</dd></div>',
        )
        .join('') +
      '</dl>' +
      guideNotes.map((note) => '<p class="guide-note">' + note + '</p>').join('') +
      '</div>'
    );
  }
  if (type === 'map') {
    const airMap = playing && !!sim.flight.pilot;
    const legend = sim.wanted.stars
      ? '<span class="patrol-legend">' +
        (sim.wanted.vehicles.length ? '<i></i>警方车辆' : '') +
        (sim.wanted.units.some((u) => u.officer) ? '<i class="officer-symbol"></i>步行警员' : '') +
        (sim.wanted.roadblock ? '<i class="barrier-symbol"></i>路障' : '') +
        (sim.wanted.helicopter ? '<i class="beam-symbol"></i>空巡范围' : '') +
        (sim.wanted.phase === 'search' ? '<i class="search-ring"></i>最后目击' : '') +
        '</span>'
      : '';
    return (
      heading(airMap ? 'SOUTH BAY AIR CHART' : 'SOUTH BAY ATLAS', airMap ? '楼顶航图' : '城市地图') +
      '<div class="dialog-content"><div class="map-layout"><div class="map-surface"><canvas id="big-map" aria-label="' +
      (airMap ? '南湾市楼顶停机坪' : '南湾市街区和地标') +
      '"></canvas><span class="north">N ↑</span>' +
      legend +
      '</div><div class="map-spots">' +
      (airMap ? helipads : world.stops)
        .map(
          (q) =>
            '<button data-' +
            (airMap ? 'pad' : 'stop') +
            '="' +
            q.id +
            '"' +
            (airMap && sim.flight.occupied(q) ? ' disabled' : '') +
            '>' +
            q.name +
            '<span>' +
            (airMap
              ? sim.flight.occupied(q)
                ? '已有停机'
                : 'H · ' + Math.round(q.z * 0.62) + ' 米'
              : q.area) +
            '</span></button>',
        )
        .join('') +
      '</div></div><div class="map-summary">' +
      icon('pin') +
      '<span id="map-desc"></span></div><div class="dialog-actions">' +
      (airMap
        ? button('navigate-air', '导航至楼顶', true, 'compass')
        : sim.city.active
          ? button('activities', '当前活动', true, 'flag')
          : button(
              'navigate',
              playing && sim.mode === 'free' ? '导航至此' : '自由漫游至此',
              true,
              'compass',
            )) +
      button('close', '合上地图') +
      '</div></div>'
    );
  }
  if (type === 'reward') {
    const reward = lastReward;
    return (
      heading(
        reward.last ? 'ALL DELIVERIES COMPLETE' : 'DELIVERY COMPLETE',
        reward.last ? '全部委托完成' : '委托完成',
      ) +
      `<div class="dialog-content">
        <p class="reward-title">${reward.title}</p><p class="radio-line">${reward.reply}</p>
        ${payRow('送达用时', Math.max(1, Math.round(reward.sec)) + ' 秒')}
        ${payRow('委托报酬', '$' + reward.pay)}${payRow('准时奖励', '$' + reward.bonus)}${payRow('当前余额', '$' + sim.cash)}
        <div class="dialog-actions">
          ${button('resume', reward.last ? '继续自由漫游' : '接下一单', true, 'play')}${button('home', '返回大厅')}
        </div></div>`
    );
  }
  if (type === 'caught') {
    return (
      heading('SOUTH BAY PATROL', caughtTitle) +
      '<div class="dialog-content"><p>这次追逐结束了。' +
      (sim.car ? '你已回到自己的潮汐 GT。' : '你已回到海风旅馆。') +
      '电台送件进度已保存。</p><div class="dialog-actions">' +
      button('resume', '继续驾驶', true, 'play') +
      button('home', '返回大厅') +
      '</div></div>'
    );
  }
  if (type === 'objective') {
    if (sim.city.active) return activityBoard(sim, playing);
    const job = sim.job,
      target = sim.target,
      isJob = sim.mode === 'story' && job;
    const text = isJob
      ? sim.phase === 'pickup'
        ? '去' + world.spot(job.from).name + '取' + job.item + '。'
        : (sim.storyStop?.label || '送达' + job.item) + ' · ' + target.name
      : '沿海岸自由驾驶，也可以标记一个地标，让导航带你过去。';
    const chapterStart = Math.floor(sim.done / 3) * 3;
    const episodeList = world.jobs
      .slice(chapterStart, chapterStart + 3)
      .map((episode, index) => {
        const status =
          index + chapterStart < sim.done
            ? '已播出'
            : index + chapterStart === sim.done
              ? '进行中'
              : '待播';
        return `<li><span>${episode.title}</span><small>${status}</small></li>`;
      })
      .join('');
    const notes = isJob
      ? `<blockquote class="radio-line"><b>${job.voice}</b>${job.brief}</blockquote>
      ${payRow('基础报酬', '$' + job.pay)}${payRow('取件后 ' + job.limit + ' 秒内送达', '+$80')}
      <details class="episode-list"><summary>本章节目单</summary><ol>${episodeList}</ol></details>`
      : '';
    return (
      heading(
        isJob ? chapterFor(sim.done) + ' · ' + (sim.done + 1) + ' / ' + world.jobs.length : 'FREE DRIVE',
        isJob ? job.title : '自由漫游',
      ) +
      `<div class="dialog-content"><p>${text}</p>${notes}
        <div class="dialog-actions">
          ${button('resume', '继续驾驶', true, 'play')}${button('activities', '城市活动', false, 'flag')}${button('map', '城市地图', false, 'map')}
        </div></div>`
    );
  }
  return (
    heading('PIT STOP', '游戏暂停') +
    '<div class="dialog-content"><div class="menu-list">' +
    row('resume', '继续游戏', 'play', 'Esc') +
    row('map', '城市地图', 'map', 'M') +
    row('activities', '城市活动', 'flag', 'J') +
    row('guide', '操作指南', 'pad') +
    row(
      'mode',
      sim.mode === 'story'
        ? '切换自由漫游'
        : sim.done === world.jobs.length
          ? '重玩电台委托'
          : '接电台委托',
      'flag',
    ) +
    row('recover', '回到最近车道', 'upcar') +
    '<button class="pause-audio" data-do="audio">' +
    icon(radio.on ? 'sound' : 'mute') +
    (radio.on ? '关闭电台' : '打开电台') +
    '</button>' +
    row('home', '保存并返回大厅', 'disk') +
    '</div></div>'
  );
}
