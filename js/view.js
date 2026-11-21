'use strict';
(() => {
  const S = window.Southline,
    W = S.world,
    { A, B, C, D, project, polygon, line, oval, drawSprite } = S.art;
  function lampArt(ctx, x, y, dusk) {
    const p = project(x, y);
    oval(ctx, p.x, p.y, 2.1, 1.1, '#655f63');
    line(ctx, p, { x: p.x + 0.1, y: p.y - 28 }, '#666679', 1.15);
    line(ctx, { x: p.x, y: p.y - 28 }, { x: p.x - 5, y: p.y - 29.5 }, '#827780', 1.3);
    oval(ctx, p.x - 5.5, p.y - 29, 2.2, 0.95, '#f7cd8e');
    if (dusk > 0.1) {
      ctx.save();
      ctx.globalAlpha = dusk * 0.67;
      ctx.shadowColor = '#ffc38d';
      ctx.shadowBlur = 7;
      oval(ctx, p.x - 5.5, p.y - 29, 2.35, 1.05, '#ffe7ad');
      ctx.restore();
    }
  }
  function headlamps(ctx, c, dusk) {
    const co = Math.cos(c.a),
      si = Math.sin(c.a);
    for (const side of [-1, 1]) {
      const x = c.x + 15 * co - side * 5 * si,
        y = c.y + 15 * si + side * 5 * co;
      const base = project(x, y, 3),
        end = project(x + co * 44, y + si * 44);
      const grad = ctx.createLinearGradient(base.x, base.y, end.x, end.y);
      grad.addColorStop(0, 'rgba(255,219,145,' + dusk * 0.43 + ')');
      grad.addColorStop(1, 'rgba(255,216,140,0)');
      polygon(
        ctx,
        [
          base,
          project(x + co * 44 - si * 6, y + si * 44 + co * 6),
          project(x + co * 44 + si * 6, y + si * 44 - co * 6),
        ],
        grad,
      );
    }
  }
  function mark(ctx, p, time, color, large) {
    const q = project(p.x, p.y);
    const pulse = (Math.sin(time * 3) + 1) / 2,
      r = large ? 22 : 11;
    ctx.save();
    ctx.globalAlpha = 0.17 + pulse * 0.08;
    oval(ctx, q.x, q.y, r + 3 * pulse, (r + 3 * pulse) * 0.59, color);
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, r, r * 0.57, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (!large) return;
    const h = 28 + Math.sin(time * 2.8) * 2;
    line(ctx, { x: q.x, y: q.y - 4 }, { x: q.x, y: q.y - h + 4 }, 'rgba(255,224,163,.65)', 1.2);
    polygon(
      ctx,
      [
        { x: q.x, y: q.y - h - 9 },
        { x: q.x + 8, y: q.y - h },
        { x: q.x, y: q.y - h + 9 },
        { x: q.x - 8, y: q.y - h },
      ],
      color,
      '#594759',
      1,
    );
    oval(ctx, q.x, q.y - h, 2.7, 2.7, '#594759');
  }
  class CityView {
    constructor(sim) {
      this.sim = sim;
      this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      this.ground = S.art.groundArt();
      this.lampPool = S.art.sprite([-29, -13, 58, 26], 1, (ctx) => {
        ctx.scale(1, 0.45);
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
        glow.addColorStop(0, 'rgba(255,201,133,.62)');
        glow.addColorStop(1, 'rgba(255,201,133,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-29, -29, 58, 58);
      });
      this.props = [];
      for (const b of W.buildings) {
        const q = project(b.x, b.y);
        this.props.push({
          type: 'building',
          model: b,
          q,
          s: S.art.buildingArt(b),
          depth: C * (b.x + b.w / 2) + D * (b.y + b.d / 2),
        });
      }
      for (const t of W.palms)
        this.props.push({
          type: 'palm',
          model: t,
          q: project(t.x, t.y),
          s: S.art.palmArt(t),
          depth: project(t.x, t.y).y,
        });
      for (const l of W.lamps)
        this.props.push({ type: 'lamp', model: l, q: project(l.x, l.y), depth: project(l.x, l.y).y });
      this.cam = null;
      this.path = [];
      this.nextRoute = -1;
      this.targetId = null;
    }
    draw(ctx, w, h, dt, input) {
      const sim = this.sim,
        p = sim.player,
        flight = sim.flight,
        pilot = flight.pilot,
        target = pilot || flight.roof ? null : sim.target,
        anchor = project(p.x, p.y, flight.height);
      const dusk = S.clamp((sim.cityTime - 12) / 210, 0, 1);
      if (this.targetId !== (target?.id || null) || sim.time >= this.nextRoute) {
        this.path = W.route({ x: p.x, y: p.y }, target);
        this.nextRoute = sim.time + 0.22;
        this.targetId = target?.id || null;
      }
      const speed = pilot ? Math.hypot(pilot.vx, pilot.vy) : sim.car?.speed || 0,
        lead = pilot
          ? project(pilot.vx * 0.16, pilot.vy * 0.16)
          : project(Math.cos(p.a) * speed * 0.22, Math.sin(p.a) * speed * 0.22);
      const goal = { x: anchor.x + lead.x, y: anchor.y + lead.y - 8 };
      if (!this.cam || Math.hypot(goal.x - this.cam.x, goal.y - this.cam.y) > 155) this.cam = { ...goal };
      const k = 1 - Math.exp(-Math.min(0.15, dt) * 7);
      this.cam.x += (goal.x - this.cam.x) * k;
      this.cam.y += (goal.y - this.cam.y) * k;
      const zoom =
        (w < 620 ? 1.61 : w < 1000 ? 1.73 : 2.03) *
        (1 - Math.min(0.13, Math.abs(speed) / 1500)) *
        (1 - flight.height / 600);
      const focusY = h * (w < 620 ? 0.5 : 0.54);
      const tx = w / 2 - this.cam.x * zoom,
        ty = focusY - this.cam.y * zoom;
      const left = -tx / zoom,
        top = -ty / zoom,
        right = (w - tx) / zoom,
        bottom = (h - ty) / zoom;
      const water = ctx.createLinearGradient(0, 0, w * 0.6, h);
      water.addColorStop(0, '#829da5');
      water.addColorStop(0.5, '#548a97');
      water.addColorStop(1, '#416f84');
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(zoom, zoom);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Stationary wave crests shimmer in the water beyond the island.
      for (let yy = Math.floor(top / 23) * 23; yy < bottom; yy += 23) {
        const shift = Math.sin(yy * 2.04) * 48;
        for (let xx = Math.floor((left - shift) / 90) * 90 + shift; xx < right; xx += 90) {
          const t = sim.time * 1.1 + xx * 0.012 + yy * 0.029,
            len = 5 + 3 * Math.sin(t);
          line(ctx, { x: xx, y: yy }, { x: xx + len, y: yy - 0.35 }, 'rgba(222,226,194,.32)', 0.85);
        }
      }
      drawSprite(ctx, this.ground, 0, 0);
      const visible = (q) =>
        q.x >= left - 145 && q.x <= right + 100 && q.y >= top - 100 && q.y <= bottom + 195;
      if (dusk > 0.06) {
        ctx.globalAlpha = dusk;
        for (const l of W.lamps) {
          const q = project(l.x, l.y);
          if (visible(q)) drawSprite(ctx, this.lampPool, q.x - 5.5, q.y);
        }
        ctx.globalAlpha = 1;
        for (const c of sim.vehicles) {
          if ((c === sim.car || c.occupied || c.patrol) && visible(project(c.x, c.y)))
            headlamps(ctx, c, dusk);
        }
      }
      for (const skid of sim.trails) {
        const u = Math.cos(skid.a),
          v = Math.sin(skid.a);
        for (const side of [-1, 1]) {
          const x = skid.x - u * 10 - v * side * 6,
            y = skid.y - v * 10 + u * side * 6;
          line(ctx, project(x, y), project(x - u * 3.4, y - v * 3.4), 'rgba(36,37,49,.34)', 1.5);
        }
      }
      if (target) {
        ctx.beginPath();
        this.path.forEach((n, i) => {
          const q = project(n.x, n.y);
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        });
        ctx.strokeStyle = 'rgba(251,216,146,.67)';
        ctx.lineWidth = 1.65;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const actors = this.props.filter((o) => visible(o.q));
      const add = (type, model, extra = {}) => {
        const q = project(model.x, model.y);
        if (visible(q)) actors.push({ type, model, q, depth: q.y, ...extra });
      };
      const nearby = sim.nearbyVehicle;
      const activity = sim.city.active,
        air = sim.wanted.helicopter,
        airTime = this.reducedMotion.matches ? 0 : sim.time,
        guidePad = pilot && flight.guidePad;
      add('garage', W.spot('motel'));
      if (sim.wanted.roadblock) add('barrier', sim.wanted.roadblock);
      if (air) S.art.beam(ctx, air);
      if (pilot) {
        const q = project(p.x, p.y);
        oval(ctx, q.x, q.y, 14, 5, 'rgba(46,48,57,.23)');
      }
      if (sim.streetFoot)
        for (const pad of S.helipads) {
          if (S.distance(p, pad.street) < 105) add('stair-door', pad.street);
        }
      if (sim.city.actor) add('mission-person', sim.city.actor);
      const ghost = sim.city.ghost;
      if (ghost) add('ghost', ghost);
      sim.vehicles.forEach((c) => add('car', c, { player: c === sim.car }));
      for (const unit of sim.wanted.units) {
        if (unit.officer) add('officer', unit.officer);
      }
      sim.people.forEach((c) => add('person', c));
      for (const driver of sim.drivers) add('person', driver, { driver: true });
      if (sim.streetFoot) add('person', sim.foot, { player: true });
      if (target && activity?.kind === 'race') add('gate', target);
      else if (target && target !== sim.city.actor && !target.fugitive) add('beacon', target);
      actors.sort((a, b) => a.depth - b.depth);
      for (const o of actors) {
        const { model, q } = o;
        if (o.type === 'building' || o.type === 'palm') {
          const b = o.s,
            within =
              anchor.x > q.x + b.left - 6 &&
              anchor.x < q.x + b.left + b.width + 6 &&
              anchor.y - 5 > q.y + b.top &&
              anchor.y - 5 < q.y + b.top + b.height;
          const occludes = !flight.height && within && o.depth > anchor.y - 1.5;
          if (occludes) ctx.globalAlpha = o.type === 'building' ? 0.33 : 0.58;
          drawSprite(ctx, b, q.x, q.y);
          if (dusk > 0.12 && o.type === 'building') {
            const columns = Math.max(2, Math.floor((model.w - 6) / (model.style === 0 ? 14 : 17)));
            const gap = (model.w - 7) / columns,
              floors = Math.max(1, Math.floor((model.h - 10) / 16)),
              pitch = (model.h - 8) / floors;
            ctx.globalAlpha = dusk * (occludes ? 0.23 : 0.75);
            for (let n = 0; n < columns; n++) {
              if ((n + model.seed) % 3 !== 0) continue;
              const x = model.x + 5 + n * gap,
                y = model.y + model.d,
                z = 6 + (n % floors) * pitch;
              polygon(
                ctx,
                [
                  project(x, y, z),
                  project(x + gap * 0.6, y, z),
                  project(x + gap * 0.6, y, z + 7),
                  project(x, y, z + 7),
                ],
                '#ffd29a',
              );
            }
          }
          ctx.globalAlpha = 1;
          const pad = model.pad;
          if (pad) {
            if (occludes) ctx.globalAlpha = 0.35;
            S.art.helipad(ctx, pad, pad === guidePad || pad === flight.roof);
            const parked = flight.craft.find((c) => c.padId === pad.id && c.mode === 'parked');
            if (parked) S.art.helicopter(ctx, parked, airTime);
            ctx.globalAlpha = 1;
            if (flight.roof === pad) {
              ctx.save();
              ctx.translate(0, -S.art.Z * pad.z);
              S.art.personArt(ctx, sim.foot, sim.time, sim.walking, true);
              ctx.restore();
            }
          }
        } else if (o.type === 'stair-door') {
          oval(ctx, q.x, q.y, 5, 2.8, '#365d56');
          for (let i = -2; i <= 2; i += 2)
            line(ctx, { x: q.x + i, y: q.y - 1.5 }, { x: q.x + i, y: q.y + 1.5 }, '#9ce9c3', 0.95);
        } else if (o.type === 'garage') S.art.garageSign(ctx, model);
        else if (o.type === 'barrier') S.art.barrier(ctx, model, this.reducedMotion.matches ? 0 : sim.time);
        else if (o.type === 'gate') S.art.gate(ctx, model);
        else if (o.type === 'ghost') {
          ctx.save();
          ctx.globalAlpha = 0.38;
          S.art.carArt(ctx, model, false, false);
          ctx.restore();
        } else if (o.type === 'mission-person') {
          S.art.personArt(ctx, model, sim.time, model.walking, false);
          S.art.personPin(ctx, model, activity.kind === 'escort');
        } else if (o.type === 'lamp') lampArt(ctx, model.x, model.y, dusk);
        else if (o.type === 'car') {
          if (o.player) mark(ctx, model, sim.time, '#99ecd4', false);
          const blue =
            model.patrol &&
            (this.reducedMotion.matches || (Math.floor(sim.time * 2.6) + (model.slot ?? 0)) % 2 === 0);
          if (model.patrol)
            oval(ctx, q.x, q.y + 2, 19, 7, blue ? 'rgba(105,166,249,.25)' : 'rgba(248,115,109,.24)');
          const canEnterFreely = model.claimed && !model.onDuty;
          if (model === nearby) mark(ctx, model, sim.time, canEnterFreely ? '#99ecd4' : '#ffb67d', false);
          S.art.carArt(ctx, model, o.player, o.player && (input.hand || input.down), blue);
          if (model.fugitive) S.art.personPin(ctx, model, false);
          if (model.onDuty && !model.patrol) S.art.officerMark(ctx, q.x, q.y - 26, 3.6);
          if (!sim.car && (!model.occupied || S.distance(model, p) < 120)) {
            const r = model === nearby ? 4 : 2.7,
              h = q.y - 19;
            if (!canEnterFreely)
              polygon(
                ctx,
                [
                  { x: q.x, y: h - r },
                  { x: q.x + r, y: h },
                  { x: q.x, y: h + r },
                  { x: q.x - r, y: h },
                ],
                '#ffad75',
                '#593f44',
                0.9,
              );
            else oval(ctx, q.x, h, r, r, '#91e4c8');
            oval(ctx, q.x, h, 1, 1, canEnterFreely ? '#3a6467' : '#69463f');
          }
        } else if (o.type === 'officer') S.art.officerArt(ctx, model, sim.time);
        else if (o.type === 'person') {
          if (o.driver) ctx.globalAlpha = Math.min(1, model.left);
          S.art.personArt(
            ctx,
            model,
            sim.time,
            o.player ? sim.walking : o.driver ? model.walking : true,
            o.player,
          );
          ctx.globalAlpha = 1;
        } else mark(ctx, model, sim.time, '#ffd28e', true);
      }
      if (air) S.art.helicopter(ctx, air, airTime);
      if (pilot && pilot.mode !== 'parked') S.art.helicopter(ctx, pilot, airTime);
      // Keep a small locator visible when a tall facade crosses the driver.
      const ay = anchor.y - (pilot ? 23 : sim.car ? 16 : 19);
      polygon(
        ctx,
        [
          { x: anchor.x - 3, y: ay - 2.2 },
          { x: anchor.x + 3, y: ay - 2.2 },
          { x: anchor.x, y: ay + 1.4 },
        ],
        '#a8f3dd',
        '#385b61',
        0.65,
      );
      ctx.restore();
      if (dusk > 0) {
        const evening = ctx.createLinearGradient(w, 0, 0, h);
        evening.addColorStop(0, 'rgba(144,69,92,' + dusk * 0.28 + ')');
        evening.addColorStop(0.5, 'rgba(46,44,91,' + dusk * 0.4 + ')');
        evening.addColorStop(1, 'rgba(35,43,82,' + dusk * 0.55 + ')');
        ctx.fillStyle = evening;
        ctx.fillRect(0, 0, w, h);
      }
      const shade = ctx.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, 'rgba(59,45,66,.10)');
      shade.addColorStop(0.32, 'rgba(0,0,0,0)');
      shade.addColorStop(0.8, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(63,44,62,.095)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, w, h);
    }
  }
  const mapColors = {
    sea: '#2b4b59',
    land: '#566c68',
    block: '#617671',
    road: '#344454',
    line: '#81928a',
    park: '#78a08b',
    mint: '#96e8cd',
    gold: '#ffce90',
  };
  function mapDraw(canvas, sim, large, selected) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1),
      w = bounds.width,
      h = bounds.height;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const p = sim.player,
      flight = sim.flight,
      pilot = flight.pilot,
      target = pilot ? (large && selected?.building ? selected : flight.guidePad) : sim.target;
    const pad = large ? 15 : 6,
      range = large ? null : W.step * (pilot ? 3.9 : 2.95);
    const scale = large
      ? Math.min((w - 2 * pad) / (W.width + 255), (h - 2 * pad) / (W.height + 240))
      : w / range;
    const cx = large ? W.width / 2 : p.x,
      cy = large ? W.height / 2 : p.y;
    const xy = (x, y) => ({ x: w / 2 + (x - cx) * scale, y: h / 2 + (y - cy) * scale });
    ctx.fillStyle = mapColors.sea;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 - cx * scale, h / 2 - cy * scale);
    ctx.scale(scale, scale);
    const coast = [
      [-92, -82],
      [-55, -113],
      [W.width + 52, -110],
      [W.width + 101, -52],
      [W.width + 130, W.height - 210],
      [W.width + 103, W.height + 70],
      [W.width - 80, W.height + 115],
      [W.width - 570, W.height + 142],
      [-95, W.height + 88],
    ];
    polygon(
      ctx,
      coast.map(([x, y]) => ({ x, y })),
      mapColors.land,
      '#b7ad8f',
      8,
    );
    for (const b of W.blocks) {
      ctx.fillStyle = b.type === 'park' ? mapColors.park : mapColors.block;
      ctx.fillRect(b.x, b.y, b.size, b.size);
      if (b.type === 'pool') {
        ctx.fillStyle = '#79a9a5';
        ctx.fillRect(b.x + 83, b.y + 68, 52, 49);
      }
    }
    for (const b of W.buildings) {
      ctx.fillStyle = '#73847c';
      ctx.fillRect(b.x, b.y, b.w, b.d);
      if (large) {
        ctx.strokeStyle = '#59706c';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x, b.y, b.w, b.d);
      }
    }
    ctx.fillStyle = '#b39984';
    for (const x of [W.width - 116, W.width - 60, W.width - 4]) ctx.fillRect(x, W.height + 84, 12, 111);
    for (let i = 0; i <= W.cols; i++)
      line(
        ctx,
        { x: i * W.step, y: -56 },
        { x: i * W.step, y: W.height + 56 },
        mapColors.road,
        large ? 40 : 51,
      );
    for (let j = 0; j <= W.rows; j++)
      line(
        ctx,
        { x: -56, y: j * W.step },
        { x: W.width + 56, y: j * W.step },
        mapColors.road,
        large ? 40 : 51,
      );
    for (let i = 0; i <= W.cols; i++)
      line(ctx, { x: i * W.step, y: -56 }, { x: i * W.step, y: W.height + 56 }, mapColors.line, 2.5);
    for (let j = 0; j <= W.rows; j++)
      line(ctx, { x: -56, y: j * W.step }, { x: W.width + 56, y: j * W.step }, mapColors.line, 2.5);
    if (target) {
      const path = pilot ? [p, target] : W.route(p, target);
      ctx.beginPath();
      path.forEach((n, i) => (i ? ctx.lineTo(n.x, n.y) : ctx.moveTo(n.x, n.y)));
      ctx.lineWidth = (large ? 2.5 : 2) / scale;
      ctx.strokeStyle = pilot ? '#b3f5d3' : mapColors.gold;
      if (pilot) ctx.setLineDash([3 / scale, 3 / scale]);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
    if (large) {
      ctx.font = '600 ' + S.clamp(w * 0.023, 10, 15) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(231,232,210,.72)';
      [
        [W.step * 0.77, W.step * 3.62, '棕 榈 海 岸'],
        [W.step * 2.21, W.step * 0.4, '霓 虹 街 区'],
        [W.step * 4.48, W.step * 3.57, '南 湾 港'],
      ].forEach(([x, y, s]) => {
        const q = xy(x, y);
        ctx.fillText(s, q.x, q.y);
      });
    }
    for (const s of W.stops) {
      if (pilot) break;
      if (!large && target !== s) continue;
      const q = xy(s.x, s.y),
        active = s.id === selected?.id || s === target,
        rad = large ? (active ? 6 : 4.5) : 3.6;
      polygon(
        ctx,
        [
          { x: q.x, y: q.y - rad },
          { x: q.x + rad, y: q.y },
          { x: q.x, y: q.y + rad },
          { x: q.x - rad, y: q.y },
        ],
        active ? mapColors.gold : '#d0c6ae',
        '#2d4350',
        1.5,
      );
    }
    for (const pad of S.helipads) {
      const parked = flight.craft.some((c) => c.mode === 'parked' && c.padId === pad.id);
      if (!pilot && !parked && !flight.roof && !(large && sim.wanted.helicopter)) continue;
      const q = xy(pad.x, pad.y),
        active = target === pad,
        r = large ? 6 : 4.5;
      ctx.fillStyle = active ? '#1e6457' : '#476762';
      ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      ctx.strokeStyle = parked ? '#ffcb88' : active ? '#d6ffe1' : '#a6cdb8';
      ctx.lineWidth = active || parked ? 1.7 : 0.85;
      ctx.strokeRect(q.x - r, q.y - r, r * 2, r * 2);
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + (large ? 9 : 7) + 'px sans-serif';
      ctx.fillStyle = '#eff6d8';
      ctx.fillText('H', q.x, q.y + r * 0.55);
    }
    if (!large && sim.streetFoot) {
      for (const streetCar of sim.cars) {
        if (streetCar.onDuty || streetCar.stored || S.distance(p, streetCar) > W.step) continue;
        const q = xy(streetCar.x, streetCar.y),
          r = 2.6;
        if (streetCar.claimed) {
          oval(ctx, q.x, q.y, r, r, '#91e4c8');
          continue;
        }
        polygon(
          ctx,
          [
            { x: q.x, y: q.y - r },
            { x: q.x + r, y: q.y },
            { x: q.x, y: q.y + r },
            { x: q.x - r, y: q.y },
          ],
          '#ffad75',
          '#473c48',
          0.85,
        );
      }
    }
    if (sim.wanted.phase === 'search') {
      const at = sim.wanted.lastSeen,
        q = xy(at.x, at.y),
        r = S.clamp(scale * 68, 7, 28);
      ctx.save();
      ctx.strokeStyle = '#ffba92';
      ctx.lineWidth = 1.35;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const unit of sim.wanted.vehicles) {
      const q = xy(unit.x, unit.y),
        r = large ? 4.8 : 3.9;
      ctx.save();
      if (unit.officer) ctx.globalAlpha = 0.58;
      oval(ctx, q.x, q.y, r + 1.2, r + 1.2, '#222e40');
      ctx.fillStyle = '#ff8c82';
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, Math.PI / 2, Math.PI * 1.5);
      ctx.fill();
      ctx.fillStyle = '#8ac9ff';
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.restore();
    }
    for (const unit of sim.wanted.units) {
      if (!unit.officer) continue;
      const q = xy(unit.officer.x, unit.officer.y);
      S.art.officerMark(ctx, q.x, q.y, large ? 4.7 : 3.8);
    }
    const activity = sim.city.active,
      b = sim.wanted.roadblock,
      hAir = sim.wanted.helicopter;
    if (b) {
      const q = xy(b.x, b.y);
      line(
        ctx,
        { x: q.x - (b.vertical ? 0 : 5), y: q.y - (b.vertical ? 5 : 0) },
        { x: q.x + (b.vertical ? 0 : 5), y: q.y + (b.vertical ? 5 : 0) },
        '#493b45',
        4.5,
      );
      line(
        ctx,
        { x: q.x - (b.vertical ? 0 : 5), y: q.y - (b.vertical ? 5 : 0) },
        { x: q.x + (b.vertical ? 0 : 5), y: q.y + (b.vertical ? 5 : 0) },
        '#ffc08a',
        2.7,
      );
    }
    if (hAir?.beam) {
      const q = xy(hAir.beam.x, hAir.beam.y),
        r = Math.max(3, scale * 44);
      oval(ctx, q.x, q.y, r, r, 'rgba(255,218,112,.38)');
      const center = xy(hAir.x, hAir.y);
      oval(ctx, center.x, center.y, 2.5, 2.5, '#ffe49f');
    }
    if (activity && target && !pilot) {
      const q = xy(target.x, target.y),
        color =
          activity.kind === 'dispatch' ? '#ff9679' : activity.kind === 'escort' ? '#e9afea' : '#f7d797';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(q.x, q.y, large ? 6 : 4.5, 0, 2 * Math.PI);
      ctx.stroke();
      oval(ctx, q.x, q.y, 2, 2, color);
    }
    const q = xy(p.x, p.y);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(p.a);
    polygon(
      ctx,
      [
        { x: 7, y: 0 },
        { x: -4.6, y: -4.3 },
        { x: -2.5, y: 0 },
        { x: -4.6, y: 4.3 },
      ],
      mapColors.mint,
      '#193b48',
      1.4,
    );
    ctx.restore();
    return { xy, scale };
  }
  Object.assign(S, { CityView, mapDraw });
})();
