import type * as THREE from 'three';
import type { AudioSystem, LoopHandle } from '../audio/AudioSystem';
import { hasSpeech, say } from '../audio/voice';
import { RADIO_BULLETIN, RADIO_WHISPER } from '../data/documents';
import { store } from './store';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * La radio del almacén: un boletín de madrugada sobre la desaparición.
 * Una vez que la entidad despertó, la última frase ya no la dice el locutor.
 */
export class Radio {
  on = false;
  whispered = false;
  private token = 0;
  private hiss: LoopHandle | null = null;

  constructor(
    private audio: AudioSystem,
    private pos: THREE.Vector3,
  ) {}

  toggle(scary: boolean, onWhisper: () => void): void {
    if (this.on) this.stop();
    else void this.run(scary, onWhisper);
  }

  private async run(scary: boolean, onWhisper: () => void): Promise<void> {
    const tok = ++this.token;
    this.on = true;
    this.audio.play('switchClick', { pos: this.pos, volume: 0.8 });
    this.audio.play('static', { pos: this.pos, duration: 0.9, volume: 0.9 });
    this.hiss = this.audio.loop('tapeHiss', { pos: this.pos, volume: 0.8 });
    store.set({ radio: true });
    await wait(1000);
    for (const line of RADIO_BULLETIN) {
      if (tok !== this.token) return;
      store.set({ subtitle: `RADIO: ${line}` });
      await say(line, { rate: 1.08, pitch: 1.05 });
      await wait(200);
    }
    if (scary && !this.whispered && tok === this.token) {
      this.whispered = true;
      this.audio.play('interference', { pos: this.pos, duration: 1.4, volume: 1 });
      store.set({ subtitle: '[Interferencia]' });
      await wait(1500);
      if (tok !== this.token) return;
      store.set({ subtitle: RADIO_WHISPER });
      onWhisper();
      if (hasSpeech()) await say(RADIO_WHISPER, { rate: 0.6, pitch: 0.1, volume: 1 });
      else await wait(2200);
    }
    if (tok === this.token) this.stop();
  }

  stop(): void {
    if (!this.on) return;
    this.token++;
    this.on = false;
    if (hasSpeech()) speechSynthesis.cancel();
    this.hiss?.stop(0.3);
    this.hiss = null;
    this.audio.play('switchClick', { pos: this.pos, volume: 0.6 });
    store.set({ radio: false, subtitle: null });
  }
}
