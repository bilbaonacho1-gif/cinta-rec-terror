/**
 * Voz sintetizada del navegador (speechSynthesis), preferentemente rioplatense.
 * Si el dispositivo no tiene voces en español se usa la que haya; si no hay voz, sólo se espera.
 */
let voice: SpeechSynthesisVoice | null = null;
let ready = false;

function pick(): void {
  const voices = speechSynthesis.getVoices();
  voice = ['es-AR', 'es-UY', 'es-US', 'es-419', 'es-MX', 'es-ES'].map((l) => voices.find((v) => v.lang.replace('_', '-') === l)).find(Boolean) ?? voices.find((v) => v.lang.startsWith('es')) ?? null;
}

export function hasSpeech(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

export function spanishVoice(): SpeechSynthesisVoice | null {
  if (!hasSpeech()) return null;
  if (!ready) {
    ready = true;
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  }
  return voice;
}

/** Duración estimada de una frase leída en voz alta (segundos). */
export function estimateSpeech(text: string): number {
  return Math.max(1.6, text.split(/\s+/).length * 0.42 + 0.7);
}

/** Lee una frase y resuelve al terminar (o por tiempo, si el navegador no avisa). */
export function say(text: string, o: { rate?: number; pitch?: number; volume?: number } = {}): Promise<void> {
  const fallback = estimateSpeech(text) / (o.rate ?? 1);
  if (!hasSpeech()) return new Promise((r) => setTimeout(r, fallback * 1000));
  return new Promise((resolve) => {
    let done = false;
    const start = performance.now();
    // si el dispositivo no tiene voz, el error llega al instante: el subtítulo igual tiene que poder leerse
    const minMs = fallback * 700;
    const finish = () => {
      if (done) return;
      done = true;
      const left = minMs - (performance.now() - start);
      if (left > 0) setTimeout(resolve, left);
      else resolve();
    };
    const u = new SpeechSynthesisUtterance(text);
    const v = spanishVoice();
    u.lang = v?.lang ?? 'es-AR';
    if (v) u.voice = v;
    u.rate = o.rate ?? 1;
    u.pitch = o.pitch ?? 1;
    u.volume = o.volume ?? 0.9;
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setTimeout(finish, (fallback * 2.2 + 1.5) * 1000);
  });
}

// ------------------------------------------------------------------ voces grabadas (ElevenLabs u otra)
/**
 * Voces grabadas opcionales: si en public/audio/voz/manifest.json figura un id (por ejemplo "cinta1-02"),
 * se reproduce public/audio/voz/<id>.mp3 en lugar de la voz del navegador. Ver docs/VOCES.md.
 */
let recorded: Set<string> | null = null;
let currentClip: HTMLAudioElement | null = null;

export async function loadVoiceManifest(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}audio/voz/manifest.json`, { cache: 'no-cache' });
    if (r.ok) recorded = new Set((await r.json()) as string[]);
  } catch {
    /* sin voces grabadas: se usa speechSynthesis */
  }
}

export function recordedVoice(id: string): string | null {
  return recorded?.has(id) ? `${import.meta.env.BASE_URL}audio/voz/${id}.mp3` : null;
}

/** Reproduce un clip de voz; avisa la duración real apenas la conoce y cuando termina. */
export function playClip(url: string, o: { volume?: number; onDuration?: (s: number) => void; onEnd?: () => void } = {}): HTMLAudioElement {
  stopClip();
  const a = new Audio(url);
  a.volume = o.volume ?? 1;
  a.onloadedmetadata = () => o.onDuration?.(a.duration);
  a.onended = () => o.onEnd?.();
  a.onerror = () => o.onEnd?.();
  void a.play().catch(() => o.onEnd?.());
  currentClip = a;
  return a;
}

export function stopClip(): void {
  if (!currentClip) return;
  currentClip.onended = null;
  currentClip.pause();
  currentClip = null;
}

export function pauseClip(pause: boolean): void {
  if (!currentClip) return;
  if (pause) currentClip.pause();
  else void currentClip.play().catch(() => undefined);
}

/** Igual que say(), pero con el clip grabado si existe. */
export function sayOrPlay(id: string, text: string, o: { rate?: number; pitch?: number; volume?: number } = {}): Promise<void> {
  const url = recordedVoice(id);
  if (!url) return say(text, o);
  return new Promise((resolve) => playClip(url, { volume: o.volume ?? 1, onEnd: () => resolve() }));
}
