'use strict';
(() => {
  const S = window.Southline,
    W = S.world,
    $ = (s) => document.querySelector(s);
  const menu = $('#menu'),
    play = $('#play'),
    sheet = $('#sheet'),
    body = $('#sheet-body'),
    toast = $('#toast');
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
  const sim = new S.Drive(onEvent),
    radio = new S.Radio();
  let playing = false,
    starting = false,
    game = null,
    view = null,
    engineLoad = null,
    pixelRatio = 1,
    waiter = null;
  let modal = '',
    parentModal = '',
    selected = W.stops[0],
    lastReward = null,
    activityResult = null,
    caughtTitle = '',
    touchSprint = false,
    toastTimer = 0,
    uiClock = 0,
    audioBusy = false;
  function icon(id, extra = '') {
    return '<svg class="icon ' + extra + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  }
  const button = (act, label, primary = false, ico = '') =>
    '<button class="action ' +
    (primary ? 'primary' : 'secondary') +
    '" data-do="' +
    act +
    '">' +
    (ico ? icon(ico) : '') +
    label +
    '</button>';
  const row = (act, label, ico, shortcut = '') =>
    '<button data-do="' +
    act +
    '">' +
    icon(ico) +
    label +
    (shortcut ? '<small>' + shortcut + '</small>' : '') +
    '</button>';
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
  function onEvent(type, message) {
    if (type === 'bump') {
      radio.fx('bump');
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
      ? '继续' + S.activities[sim.city.active.kind].title
      : sim.done === W.jobs.length
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
  function engine() {
    if (window.Phaser) return Promise.resolve();
    if (!engineLoad)
      engineLoad = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/phaser.min.js';
        script.onload = resolve;
        script.onerror = () => {
          engineLoad = null;
          script.remove();
          reject(new Error('engine unavailable'));
        };
        document.head.appendChild(script);
      });
    return engineLoad;
  }
  function resize() {
    if (game && playing && game.isBooted) {
      pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.45 : 1.55);
      const w = play.clientWidth,
        h = play.clientHeight;
      if (w && h) game.scale.resize(Math.round(w * pixelRatio), Math.round(h * pixelRatio));
      if (sheet.open && view && !game.loop.running) renderCity(game.canvas.getContext('2d'), 0);
    }
    if (sheet.open && modal === 'map') requestAnimationFrame(paintMap);
  }
  function renderCity(ctx, seconds) {
    ctx.save();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    view.draw(ctx, game.canvas.width / pixelRatio, game.canvas.height / pixelRatio, seconds, input);
    ctx.restore();
  }
  function setupEngine() {
    return new Promise((resolve) => {
      waiter = resolve;
      class CityScene extends Phaser.Scene {
        constructor() {
          super('south-bay');
        }
        create() {
          view = new S.CityView(sim);
          const streets = new Phaser.GameObjects.GameObject(this, 'City');
          streets.renderCanvas = (renderer) => {
            if (!playing) return;
            renderCity(renderer.currentContext, this.frameSeconds || 1 / 60);
          };
          this.add.existing(streets);
          this.debt = 0;
          resize();
          game.canvas.setAttribute('aria-label', '南湾市，使用方向键驾驶');
          waiter?.();
          waiter = null;
        }
        update(_time, delta) {
          if (!playing || sheet.open) return;
          this.frameSeconds = Math.min((delta || 16.67) / 1000, 0.1);
          this.debt = Math.min(0.13, this.debt + this.frameSeconds);
          while (this.debt >= 1 / 60 && !sheet.open) {
            sim.step(1 / 60, input);
            this.debt -= 1 / 60;
          }
          if (sheet.open) this.debt = 0;
          uiClock += this.frameSeconds;
          if (uiClock > 0.12) {
            uiClock = 0;
            updateHUD();
            const pilot = sim.flight.pilot;
            radio.engine(
              pilot ? Math.hypot(pilot.vx, pilot.vy) : sim.car?.speed || 0,
              sim.wanted.loudness,
              !!pilot && pilot.mode !== 'parked',
            );
          }
        }
      }
      pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.45 : 1.55);
      game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: 'canvas-host',
        width: Math.round(play.clientWidth * pixelRatio),
        height: Math.round(play.clientHeight * pixelRatio),
        backgroundColor: '#688b93',
        banner: false,
        audio: { noAudio: true },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        render: { antialias: true, roundPixels: false },
        scale: { mode: Phaser.Scale.NONE },
        fps: { target: 60, smoothStep: false },
        scene: [CityScene],
      });
    });
  }
  async function start(mode) {
    if (starting) return;
    starting = true;
    $('#start-label').textContent = '正在发动…';
    try {
      await engine();
      closeModal(false);
      playing = true;
      menu.hidden = true;
      play.hidden = false;
      clearInput();
      sim.begin(mode);
      if (!game) await setupEngine();
      else {
        view.cam = null;
        view.nextRoute = -1;
        game.loop.wake();
        resize();
      }
      updateHUD();
      document.activeElement?.blur();
      const coarse = matchMedia('(pointer:coarse)').matches || innerWidth <= 620;
      notice(
        sim.city.active
          ? '已续接 · ' + S.activities[sim.city.active.kind].title
          : sim.wanted.stars
            ? '已续接 ' + sim.wanted.stars + ' 星通缉'
            : mode === 'free'
              ? '自由漫游 · 徒步靠近任意车辆即可上车'
              : coarse
                ? '右下方踩油门，左下方转向'
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
    clearInput();
    closeModal(false);
    radio.engine(0);
    game?.loop.sleep();
    menu.hidden = false;
    play.hidden = true;
    refreshMenu();
    toast.classList.remove('show');
    $('[data-do="story"]').focus({ preventScroll: true });
  }
  function updateWanted() {
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
    $('#wanted-meter i').style.transform = 'scaleX(' + S.clamp(progress, 0, 1) + ')';
  }
  function updateHUD() {
    if (!playing) return;
    const t = sim.target,
      j = sim.job,
      active = sim.city.active,
      isJob = !active && sim.mode === 'story' && j,
      car = sim.car,
      flight = sim.flight,
      pilot = flight.pilot,
      airBrief = flight.briefing;
    $('#job-meta').textContent = airBrief
      ? airBrief[0]
      : active
        ? S.activities[active.kind].title
        : isJob
          ? '电台委托 ' + (sim.done + 1) + ' / ' + W.jobs.length + ' · ' + j.title
          : '自由漫游';
    const brief = sim.city.summary;
    $('#job-goal').textContent = airBrief
      ? airBrief[1]
      : brief
        ? brief[0]
        : isJob
          ? (sim.phase === 'pickup' ? '取件 · ' : '送达 · ') + t.name
          : t
            ? '导航 · ' + t.name
            : '探索南湾市';
    let detail = car?.patrol && !sim.wanted.stars ? '警车电台可接警 · 城市活动' : '城市活动 · 点击查看行程';
    if (brief) detail = brief[1];
    else if (t) {
      const m = Math.round(S.distance(sim.player, t) * 0.62);
      detail = m < 24 ? '在金色光圈内减速停留' : m + ' 米 · 跟随金色路线';
      if (isJob && sim.phase === 'delivery' && m >= 24) {
        const remaining = Math.ceil(Math.max(0, j.limit - sim.elapsed));
        detail += remaining ? ' · 奖励 ' + remaining + ' 秒' : ' · 仍可交付';
      }
    }
    if (!brief && sim.wanted.helicopter && car) detail = '下车等空巡低飞，靠近悬梯可夺机';
    $('#job-detail').textContent = airBrief ? airBrief[2] : detail;
    $('#district').textContent = W.district(sim.player);
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
    $('[data-key="up"]').setAttribute('aria-label', pilot ? '向上飞行' : '油门或向上');
    $('[data-key="down"]').setAttribute('aria-label', pilot ? '向下飞行' : '刹车或向下');
    $('[data-do="sprint"]').hidden = !!(car || pilot);
    if ((car || pilot) && touchSprint) {
      touchSprint = false;
      updateInput();
    }
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
    updateWanted();
    S.mapDraw($('#mini'), sim, false);
  }
  function heading(kicker, title) {
    return (
      '<div class="dialog-head"><div><small>' +
      kicker +
      '</small><h2 id="dialog-title">' +
      title +
      '</h2></div><button class="close" data-do="close" aria-label="关闭">' +
      icon('close') +
      '</button></div>'
    );
  }
  function activityChoice(kind, label, description, disabled = false, action = 'start-' + kind) {
    return (
      '<button class="activity-choice" data-do="' +
      action +
      '" ' +
      (disabled ? 'disabled' : '') +
      '>' +
      icon(S.activities[kind].icon) +
      '<span><strong>' +
      label +
      '</strong><small>' +
      description +
      '</small></span><b aria-hidden="true">›</b></button>'
    );
  }
  function activityBoard() {
    const city = sim.city,
      a = city.active;
    if (a) {
      const spec = S.activities[a.kind],
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
          ? '个人最佳 ' + S.timing(city.best.time) + ' · 挑战自己的车影'
          : '落日唱片行 → 南湾码头 · 记录最佳车影',
      ) +
      activityChoice(
        'garage',
        '海风旅馆车库',
        city.garage.slots.length
          ? '已租 ' + city.garage.slots.length + ' 个车位 · 收藏与换色'
          : '首个车位 $' + S.rent[0] + ' · 收藏与换色',
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
  function garagePanel() {
    const g = sim.city.garage;
    const bays = g.slots
      .map((id, i) => {
        const car = sim.city.car(id);
        const controls = car
          ? '<div class="swatches">' +
            S.paints
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
  function content(type) {
    if (type === 'activities') return activityBoard();
    if (type === 'garage') return garagePanel();
    if (type === 'activityResult') {
      const r = activityResult;
      return (
        heading('SOUTH BAY DISPATCH', S.activities[r.kind].title + '完成') +
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
              '<div><dt>' +
              t +
              '</dt><dd>' +
              k.map((s) => '<kbd>' + s + '</kbd>').join(' ') +
              '</dd></div>',
          )
          .join('') +
        '</dl><p class="guide-note">五星时下车，等空巡直升机把悬梯放到身边，按 F 夺机。用方向键或 WASD 飞行，松手悬停，M 打开楼顶航图。飞近 H 按 F 降落，E 离舱。绿色楼梯通往街边，飞机会留在楼顶。</p><p class="guide-note">街上每辆车都能开，包括执勤警车。步行靠近按 E 上车，多辆车挨在一起时按 Q 或点「切换目标」选车。橙色菱形表示可抢，绿色圆点表示可直接上车。</p><p class="guide-note">抢车会引来一星通缉。你弃车时，警员会下车追赶。你开走警车后，警员会就近征用车辆，征用的民用车上方会显示蓝色盾牌。换车保留当前星级，持续被目击会升至最高五星。离开追兵视线，搜寻倒计时归零即可脱身。</p><p class="guide-note">步行时按屏幕方向移动，按住空格疾跑。触屏可点「疾跑」切换。做委托时，在金色光圈内减速即可取件或交付。</p></div>'
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
        (airMap ? S.helipads : W.stops)
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
      const r = lastReward;
      return (
        heading(
          r.last ? 'ALL DELIVERIES COMPLETE' : 'DELIVERY COMPLETE',
          r.last ? '全部委托完成' : '委托完成',
        ) +
        '<div class="dialog-content"><p class="reward-title">' +
        r.title +
        '</p><div class="pay-row">送达用时<b>' +
        Math.max(1, Math.round(r.sec)) +
        ' 秒</b></div><div class="pay-row">委托报酬<b>$' +
        r.pay +
        '</b></div><div class="pay-row">准时奖励<b>$' +
        r.bonus +
        '</b></div><div class="pay-row">当前余额<b>$' +
        sim.cash +
        '</b></div><div class="dialog-actions">' +
        button('resume', r.last ? '继续自由漫游' : '接下一单', true, 'play') +
        button('home', '返回大厅') +
        '</div></div>'
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
      if (sim.city.active) return activityBoard();
      const j = sim.job,
        t = sim.target,
        isJob = sim.mode === 'story' && j;
      const text = isJob
        ? sim.phase === 'pickup'
          ? '去' + W.spot(j.from).name + '取' + j.item + '，再送往' + W.spot(j.to).name + '。'
          : '车上带着' + j.item + '，下一站是' + t.name + '。'
        : '沿海岸自由驾驶，也可以标记一个地标，让导航带你过去。';
      return (
        heading(isJob ? 'RADIO DISPATCH' : 'FREE DRIVE', isJob ? j.title : '自由漫游') +
        '<div class="dialog-content"><p>' +
        text +
        '</p>' +
        (isJob
          ? '<div class="pay-row">基础报酬<b>$' +
            j.pay +
            '</b></div><div class="pay-row">取件后 ' +
            j.limit +
            ' 秒内送达<b>+$80</b></div>'
          : '') +
        '<div class="dialog-actions">' +
        button('resume', '继续驾驶', true, 'play') +
        button('activities', '城市活动', false, 'flag') +
        button('map', '城市地图', false, 'map') +
        '</div></div>'
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
        sim.mode === 'story' ? '切换自由漫游' : sim.done === W.jobs.length ? '重玩电台委托' : '接电台委托',
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
  function openModal(type) {
    if (starting || (type === 'pause' && !playing)) return;
    if (modal === 'pause' && ['guide', 'map', 'objective', 'activities'].includes(type))
      parentModal = 'pause';
    else if (type === 'pause' || !sheet.open) parentModal = '';
    modal = type;
    clearInput();
    radio.engine(0);
    if (type === 'map')
      selected =
        playing && sim.flight.pilot
          ? sim.flight.guidePad || S.helipads[0]
          : W.spot(sim.target?.id) || W.spot(selected?.id) || W.stops[0];
    sheet.classList.toggle('map-sheet', type === 'map');
    body.innerHTML = content(type);
    if (type === 'garage') {
      for (const canvas of body.querySelectorAll('[data-car-preview]')) {
        const car = sim.city.car(sim.city.garage.slots[Number(canvas.dataset.carPreview)]);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(3.9, 0, 0, 3.9, 82, 60);
        S.art.carArt(ctx, { ...car, x: 0, y: 0, a: 0.15 }, false, false);
      }
    }
    if (!sheet.open) sheet.showModal();
    if (playing) {
      game?.loop.sleep();
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
    clearInput();
    if (playing && !starting) {
      game?.loop.wake();
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
    if (c && sheet.open) S.mapDraw(c, sim, true, selected);
  }
  async function full() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
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
          touchSprint = !touchSprint;
          updateInput();
        }
        break;
      case 'recover':
        sim.recover();
        view.cam = null;
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
        stop.dataset.pad ? S.helipads.find((p) => p.id === stop.dataset.pad) : W.spot(stop.dataset.stop),
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
        m = S.mapDraw(c, sim, true, selected),
        pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const near = (
        sim.flight.pilot && playing ? S.helipads.filter((p) => !sim.flight.occupied(p)) : W.stops
      )
        .map((s) => ({ s, d: S.distance(m.xy(s.x, s.y), pt) }))
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
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (sheet.open) {
      if (e.code === 'KeyJ' && !e.repeat && modal === 'activities') {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.code === 'KeyM' && !e.repeat && modal === 'map') {
        e.preventDefault();
        closeModal();
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
      openModal('activities');
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      openModal('map');
    } else if (playing && e.code === 'Escape') {
      e.preventDefault();
      openModal('pause');
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
      start(sim.city.active ? sim.mode : 'story');
    }
  });
  window.addEventListener('keyup', (e) => {
    if (physical.delete(e.code)) updateInput();
  });
  document.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (!playing || sheet.open) return;
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
  window.addEventListener('resize', resize);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInput();
      if (playing && !sheet.open && !starting) openModal('pause');
    }
  });
  window.addEventListener('pagehide', () => {
    if (playing) sim.save();
  });
  soundUI();
  refreshMenu();
})();
