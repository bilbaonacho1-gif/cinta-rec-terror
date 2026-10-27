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
