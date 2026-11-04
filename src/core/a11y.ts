/**
 * Opciones de accesibilidad compartidas por los sistemas de efectos.
 * reduceFlashing: baja los glitches, los temblores de cámara y el parpadeo estroboscópico de las luces
 * (por defecto activo si el sistema pide "reducir movimiento").
 */
export const a11y = {
  reduceFlashing: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
};
