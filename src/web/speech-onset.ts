/** Local onset confirmation supplements provider VAD; brief noise must not flush speech. */
export class SpeechOnset {
  private candidateMs = 0;
  private noiseFloor = 0.003;
  reset(): void { this.candidateMs = 0; this.noiseFloor = 0.003; }
  observe(level: number, frameMs: number, playing: boolean): boolean {
    if (!Number.isFinite(level) || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 100) { this.candidateMs = 0; return false; }
    const threshold = Math.max(playing ? 0.035 : 0.015, Math.min(0.08, this.noiseFloor * 3));
    if (level < threshold) {
      this.candidateMs = 0;
      this.noiseFloor += (Math.min(level, 0.02) - this.noiseFloor) * 0.03;
      return false;
    }
    this.candidateMs += frameMs;
    return this.candidateMs >= (playing ? 128 : 96);
  }
}
