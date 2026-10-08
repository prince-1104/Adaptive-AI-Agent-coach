declare const sampleRate: number;
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; }

/** Trusted capture only: batch mono PCM; no workout state or model code. */
class GeminiMicrophoneProcessor extends AudioWorkletProcessor {
  private samples = new Float32Array(512);
  private offset = 0;
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]; if (!input) return true;
    for (const value of input) {
      this.samples[this.offset++] = value;
      if (this.offset === this.samples.length) {
        this.port.postMessage({ samples: this.samples, rate: sampleRate });
        this.samples = new Float32Array(512); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('gemini-microphone', GeminiMicrophoneProcessor);
