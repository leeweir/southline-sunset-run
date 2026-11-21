'use strict';
(() => {
  const hz = (n) => 440 * 2 ** ((n - 69) / 12);
  class Radio {
    constructor() {
      this.on = false;
      this.step = 0;
      this.next = 0;
      this.timer = 0;
      this.usable = !!(window.AudioContext || window.webkitAudioContext);
    }
    async toggle() {
      if (!this.usable) return false;
      if (this.on) {
        this.on = false;
        clearInterval(this.timer);
        this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.035);
        return false;
      }
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Audio();
        this.bus = this.ctx.createGain();
        this.bus.gain.value = 0;
        this.bus.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.24, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.motor = this.ctx.createOscillator();
        this.motor.type = 'triangle';
        this.motorGain = this.ctx.createGain();
        this.motorGain.gain.value = 0;
        this.motor.connect(this.motorGain);
        this.motorGain.connect(this.bus);
        this.rotor = this.ctx.createOscillator();
        this.rotor.frequency.value = 13;
        this.rotorDepth = this.ctx.createGain();
        this.rotorDepth.gain.value = 0;
        this.rotor.connect(this.rotorDepth);
        this.rotorDepth.connect(this.motorGain.gain);
        this.rotor.start();
        this.motor.start();
        this.siren = this.ctx.createOscillator();
        this.siren.type = 'triangle';
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.siren.connect(this.sirenGain);
        this.sirenGain.connect(this.bus);
        this.siren.start();
      }
      await this.ctx.resume();
      this.on = true;
      this.bus.gain.setTargetAtTime(0.45, this.ctx.currentTime, 0.06);
      this.next = this.ctx.currentTime + 0.07;
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 75);
      return true;
    }
    tone(freq, time, len, type, level, end, cutoff) {
      const ctx = this.ctx,
        osc = ctx.createOscillator(),
        vol = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      if (end) osc.frequency.exponentialRampToValueAtTime(end, time + len);
      vol.gain.setValueAtTime(0.0001, time);
      vol.gain.exponentialRampToValueAtTime(level, time + 0.012);
      vol.gain.exponentialRampToValueAtTime(0.0001, time + len);
      if (cutoff) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        osc.connect(filter);
        filter.connect(vol);
      } else osc.connect(vol);
      vol.connect(this.bus);
      osc.start(time);
      osc.stop(time + len + 0.02);
    }
    hat(time, level, len, high) {
      const src = this.ctx.createBufferSource(),
        f = this.ctx.createBiquadFilter(),
        v = this.ctx.createGain();
      src.buffer = this.noise;
      f.type = 'highpass';
      f.frequency.value = high;
      v.gain.setValueAtTime(level, time);
      v.gain.exponentialRampToValueAtTime(0.0002, time + len);
      src.connect(f);
      f.connect(v);
      v.connect(this.bus);
      src.start(time);
      src.stop(time + len);
    }
    schedule() {
      if (!this.on) return;
      if (this.next < this.ctx.currentTime - 0.1) this.next = this.ctx.currentTime + 0.02;
      const chords = [
        [45, 52, 59, 60],
        [41, 48, 55, 57],
        [48, 55, 59, 64],
        [43, 50, 57, 59],
      ];
      const melody = [0, 0, 76, 0, 74, 0, 0, 72, 0, 0, 71, 0, 0, 72, 0, 67];
      while (this.next < this.ctx.currentTime + 0.24) {
        const i = this.step % 16,
          bar = Math.floor(this.step / 16),
          ch = chords[bar % 4],
          t = this.next;
        if (i % 4 === 0) this.tone(103, t, 0.19, 'sine', 0.26, 40);
        if (i === 4 || i === 12) this.hat(t, 0.12, 0.13, 1400);
        if (i % 2 === 0) this.hat(t, 0.045, i % 4 === 2 ? 0.085 : 0.04, 6500);
        if ([0, 3, 6, 8, 11, 14].includes(i))
          this.tone(hz(ch[0] - (i === 14 ? 0 : 12)), t, 0.2, 'sawtooth', 0.105, 0, 450);
        if (i === 2 || i === 10)
          ch.slice(1).forEach((n) => this.tone(hz(n), t, 0.48, 'triangle', 0.047, 0, 1350));
        if (bar % 2 === 1 && melody[i])
          this.tone(hz(melody[i] + (bar % 4 === 3 ? -2 : 0)), t, 0.36, 'sine', 0.055);
        this.step++;
        this.next += 60 / 96 / 4;
      }
    }
    engine(speed, patrolVolume = 0, rotor = false) {
      if (!this.ctx) return;
      const n = Math.abs(speed || 0);
      this.rotorDepth.gain.setTargetAtTime(this.on && rotor ? 0.026 : 0, this.ctx.currentTime, 0.1);
      this.motor.frequency.setTargetAtTime(
        rotor ? 54 + n * 0.07 : 32 + n * 0.27,
        this.ctx.currentTime,
        0.11,
      );
      this.motorGain.gain.setTargetAtTime(
        this.on && rotor ? 0.036 : this.on && n > 4 ? 0.018 + n * 0.00013 : 0,
        this.ctx.currentTime,
        0.12,
      );
      const t = this.ctx.currentTime;
      this.siren.frequency.setTargetAtTime(476 + 150 * Math.sin(t * 4.5), t, 0.1);
      this.sirenGain.gain.setTargetAtTime(this.on ? patrolVolume * 0.068 : 0, t, 0.13);
    }
    fx(kind) {
      if (!this.on) return;
      const t = this.ctx.currentTime;
      if (kind === 'dispatch') {
        this.tone(784, t, 0.09, 'triangle', 0.1);
        this.tone(1047, t + 0.12, 0.12, 'triangle', 0.08);
        return;
      }
      if (kind === 'bump') {
        this.tone(87, t, 0.11, 'triangle', 0.15, 45);
        return;
      }
      (kind === 'reward' ? [64, 69, 73, 76] : [69, 76]).forEach((n, i) =>
        this.tone(hz(n), t + i * 0.085, 0.23, 'sine', 0.095),
      );
    }
  }
  window.Southline.Radio = Radio;
})();
