import type { LoopName, SoundName } from './sounds';

/**
 * Reemplazos opcionales de audio. Por defecto todo se sintetiza.
 * Para usar grabaciones reales, copiá el archivo en public/audio/ y registralo acá, por ejemplo:
 *   knock: 'knock.mp3',
 *   wind: 'wind-loop.ogg',
 */
export const AUDIO_FILES: Partial<Record<SoundName | LoopName, string>> = {};
