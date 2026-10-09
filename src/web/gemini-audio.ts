export function encodePcm(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return btoa(String.fromCharCode(...bytes));
}
export function decodePcm(data: string): Float32Array {
  if (!data || data.length > 256000) throw new Error('Invalid voice audio.');
  const binary = atob(data); if (binary.length % 2) throw new Error('Invalid PCM length.');
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const view = new DataView(bytes.buffer), samples = new Float32Array(bytes.length / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
  return samples;
}

/** Web Audio schedules adjacent Gemini chunks; it never controls the workout clock. */
export class GeminiAudio {
  readonly context: AudioContext;
  private microphone?: MediaStreamAudioSourceNode;
  private capture?: AudioWorkletNode;
  private silent?: GainNode;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private analyser: AnalyserNode;
  private waveform = new Float32Array(256);
  get outputLevel() {
    if (!this.sources.size || this.context.state !== 'running') return 0;
    this.analyser.getFloatTimeDomainData(this.waveform);
    let energy = 0; for (const sample of this.waveform) energy += sample * sample;
    return Math.min(1, Math.sqrt(energy / this.waveform.length) * 8);
  }
  constructor(private playbackChanged: (playing: boolean) => void) {
    try { this.context = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' }); }
    catch { this.context = new AudioContext({ latencyHint: 'interactive' }); }
    this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 256; this.analyser.connect(this.context.destination);
  }
  async resume() { await this.context.resume(); }
  async captureMicrophone(stream: MediaStream, chunk: (data: string, rate: number, level: number, frameMs: number) => void) {
    await this.context.audioWorklet.addModule('/web/gemini-microphone.js');
    if (this.context.state === 'closed') return;
    this.microphone = this.context.createMediaStreamSource(stream);
    this.capture = new AudioWorkletNode(this.context, 'gemini-microphone');
    this.capture.port.onmessage = event => {
      const { samples, rate } = event.data as { samples: Float32Array; rate: number };
      let energy = 0; for (const sample of samples) energy += sample * sample;
      chunk(encodePcm(samples), rate, Math.sqrt(energy / samples.length), samples.length / rate * 1000);
    };
    this.silent = this.context.createGain(); this.silent.gain.value = 0;
    this.microphone.connect(this.capture); this.capture.connect(this.silent); this.silent.connect(this.context.destination);
  }
  stopMicrophone() {
    if (this.capture) { this.capture.port.onmessage = null; this.capture.port.close(); }
    this.microphone?.disconnect(); this.capture?.disconnect(); this.silent?.disconnect();
    this.microphone = undefined; this.capture = undefined; this.silent = undefined;
  }
  play(data: string, rate: number) {
    const samples = decodePcm(data);
    if (!samples.length || rate !== 24000) throw new Error('Unexpected voice audio format.');
    if (this.nextTime - this.context.currentTime > 20) throw new Error('Voice playback is falling behind.');
    const buffer = this.context.createBuffer(1, samples.length, rate); buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.analyser);
    this.nextTime = Math.max(this.nextTime, this.context.currentTime + 0.015);
    this.sources.add(source); this.playbackChanged(true);
    source.onended = () => { source.disconnect(); this.sources.delete(source); if (!this.sources.size) this.playbackChanged(false); };
    source.start(this.nextTime); this.nextTime += buffer.duration;
  }
  interrupt() {
    for (const source of this.sources) { source.onended = null; source.stop(); source.disconnect(); }
    this.sources.clear(); this.nextTime = 0; this.playbackChanged(false);
  }
  close() { this.stopMicrophone(); this.interrupt(); this.analyser.disconnect(); void this.context.close().catch(() => {}); }
}
