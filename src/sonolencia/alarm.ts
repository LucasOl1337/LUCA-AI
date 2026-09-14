/** Web Audio starts in the user's click; no microphone or audio downloads. */
export class DrowsinessAlarm {
  private context = new AudioContext();
  private oscillator: OscillatorNode;
  private gain: GainNode;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor() {
    this.gain = this.context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.context.destination);
    this.oscillator = this.context.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = 880;
    this.oscillator.connect(this.gain);
    this.oscillator.start();
  }
  async unlock() {
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Ative o áudio do navegador e tente novamente.');
  }
  get available() { return this.context.state === 'running'; }
  private pulse = () => {
    const at = this.context.currentTime;
    const gain = this.gain.gain;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(0, at);
    gain.linearRampToValueAtTime(0.28, at + 0.015);
    gain.setValueAtTime(0.28, at + 0.22);
    gain.linearRampToValueAtTime(0, at + 0.25);
  };
  start() {
    if (this.timer !== undefined) return;
    this.pulse();
    this.timer = setInterval(this.pulse, 650);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(0, this.context.currentTime);
  }
  close() {
    this.stop();
    this.oscillator.stop();
    void this.context.close().catch(() => {});
  }
}
