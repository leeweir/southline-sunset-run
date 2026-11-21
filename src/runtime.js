import { CityView } from './render/view.js';

const stepSeconds = 1 / 60;

export class StreetRuntime {
  constructor(host, simulation, input, updateInstruments) {
    this.host = host;
    this.simulation = simulation;
    this.input = input;
    this.updateInstruments = updateInstruments;
    this.view = new CityView(simulation);
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', '南湾市，使用方向键驾驶或步行');
    this.context = this.canvas.getContext('2d', { alpha: false });
    if (!this.context) throw new Error('Canvas 2D unavailable');
    host.append(this.canvas);
    this.running = false;
    this.frame = this.frame.bind(this);
  }
  resetCamera() {
    this.view.cam = null;
    this.view.nextRoute = -1;
  }
  resize() {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    if (!width || !height) return;
    this.ratio = Math.min(devicePixelRatio || 1, width < 700 ? 1.45 : 1.55);
    this.canvas.width = Math.round(width * this.ratio);
    this.canvas.height = Math.round(height * this.ratio);
    this.draw(0);
  }
  resume() {
    if (this.running) return;
    this.running = true;
    this.previous = null;
    this.accumulator = 0;
    this.hudElapsed = 0;
    this.resize();
    this.frameId = requestAnimationFrame(this.frame);
  }
  pause() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }
  draw(delta) {
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.view.draw(
      this.context,
      this.canvas.width / this.ratio,
      this.canvas.height / this.ratio,
      delta,
      this.input,
    );
  }
  frame(timestamp) {
    if (!this.running) return;
    const elapsed = this.previous === null ? 0 : Math.min((timestamp - this.previous) / 1000, 0.1);
    this.previous = timestamp;
    this.accumulator += elapsed;
    while (this.accumulator >= stepSeconds && this.running) {
      this.accumulator -= stepSeconds;
      this.simulation.step(stepSeconds, this.input);
    }
    this.draw(elapsed);
    if (!this.running) return;
    this.hudElapsed += elapsed;
    if (this.hudElapsed >= 0.12) {
      this.hudElapsed = 0;
      this.updateInstruments();
    }
    this.frameId = requestAnimationFrame(this.frame);
  }
}
