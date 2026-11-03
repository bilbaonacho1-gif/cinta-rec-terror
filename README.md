# REC — La Última Cinta (versión AI Studio mejorada)

Terror found footage argentino en primera persona para navegador. Banfield, octubre de 1998: la familia
Carvajal, la del almacén del barrio, desapareció el 9 de octubre. El inspector Rubén Salgado entró a buscarlos
y sólo encontraron su cámara. Recuperá sus tres cintas VHS y salí por la puerta de la pieza del fondo… si el
Familiar te deja.

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # verifica tipos y genera dist/
```

Para probar el giroscopio en el celular hace falta HTTPS: `npm run dev:https` y abrí la URL "Network"
(aceptá el certificado autofirmado). Usá auriculares.

## Ambientación argentina

- **La leyenda del Familiar** (folclore de los ingenios azucareros de Tucumán): el abuelo Ramón Carvajal se lo
  trajo en 1951 y lo tuvo "de inquilino" en la pieza del fondo, pagándole uno por año cada 9 de octubre.
  Cuando el abuelo murió, nadie siguió pagando.
- **Casa chorizo** con baldosas calcáreas, el **almacén de la familia** al frente (persiana baja, estanterías con
  mercadería, mostrador con balanza, registradora, libreta de fiado y cartel de "Hoy no se fía, mañana sí"),
  living con el desayuno del 9 de octubre (pan, dulce de leche), mate y termo en el escritorio, sifones,
  ruda en la entrada, cintitas rojas en el marco de la pieza del fondo y el almanaque de la carnicería del barrio.
- **Radio del almacén**: prendela para escuchar el boletín de la madrugada… y lo que dice después.
- Textos y cintas en voseo; la voz usa una voz `es-AR` si el dispositivo la tiene.
- Sonidos del barrio sintetizados: perros que ladran y de golpe se callan, un colectivo por la avenida,
  golpes en la persiana y las cadenas del Familiar.

## Publicar en Vercel

El repo ya está listo (`vercel.json`): en https://vercel.com/new importá este repositorio de GitHub y tocá
**Deploy**. Vercel detecta Vite solo (build `npm run build`, salida `dist`). Cada push a `main` vuelve a publicar.

## Cómo se juega

Antes de empezar aparece la pantalla **"Cómo se juega"** (también está en la pausa) con el objetivo, la regla
del monstruo, la visión nocturna, la batería y los controles de celular o de compu.

## Reglas

- A simple vista la casa parece vacía. **El Familiar (una cosa sin piel, encorvada) sólo se ve a través de la cámara** (REC).
- **Visión nocturna ("rayos X")**: con NV / [N] la cámara ve en la oscuridad total. Gasta el doble de batería.
  Cuando está muy oscuro el botón NV titila y el juego te lo recuerda.
- **No se mueve mientras está en el centro del visor.** Cuando apartás la vista o apagás la cámara, avanza.
- La batería arranca en 87%, baja con la cámara encendida y el **doble** con visión nocturna.
  Hay tres packs de +20%. En 0% la cámara se apaga y quedás a ciegas.
- Cada cinta que encontrás la vuelve más agresiva. Si te alcanza: "SEÑAL PERDIDA" → REBOBINAR.

## Controles

| | Celular | PC |
|---|---|---|
| Mirar | mover el dispositivo (arrastrar para recentrar) | mouse (click para capturarlo) |
| Caminar | joystick de la izquierda | WASD / flechas |
| Interactuar | botón TOCAR o tocar la pantalla | E / espacio / click |
| Cámara · Visión nocturna | REC · NV | C · N |
| Zoom · Batería | T/W · BAT + | rueda o Z/X · B |
| Detener cinta · Pausa | ■ STOP · II | Q · Esc |

## Qué cambió respecto de la versión original

- **Bug crítico:** el loop de animación quedaba con el estado inicial congelado (closure de React), así que
  la batería nunca bajaba y la entidad nunca se movía. Ahora el juego corre en `src/engine/Engine.ts`,
  fuera del render de React, y la interfaz lee un store liviano (no re-renderiza 60 veces por segundo).
- `npm install` fallaba por un conflicto de `esbuild`; se quitaron dependencias sin uso (Gemini, Express,
  dotenv, motion, lucide) y Google Fonts. Ya no se pide el micrófono.
- Entidad original con esqueleto y poses (cabeza envuelta en cinta magnética) en lugar de un cilindro;
  se mueve por una red de puntos entre habitaciones (no atraviesa paredes) y se la detecta por ángulo
  del visor + línea de visión.
- Casa reconstruida sin huecos, con colisiones reales, puertas, ventanas, luces que titilan y muebles.
- Giroscopio con orientación completa del dispositivo (cuaternión), funciona en vertical y horizontal.
- Post-proceso VHS en un solo pase: ruido de sensor, scanlines, aberración cromática, glitches,
  visión nocturna real con iluminador IR, encendido/apagado de la cámara.
- Las cintas se ven dentro de la casa (renderizada desde donde se grabaron), con voz y subtítulos.
- Eventos narrativos (primera aparición, retrato que cambia, puerta que se cierra, golpes, susurros,
  interferencias, batería que cae) y un final con giro.
- Audio 100% sintetizado y espacializado.

## Créditos de modelos 3D

- «Terror Engine - Skinless Crawler» de JuanCarlosOsanteHernandez (**CC BY-NC 4.0, uso no comercial**) — https://sketchfab.com/3d-models/terror-engine-skinless-crawler-22e900c82b194a03bcba20c7765dadee

- «Breakfast (Argentina edition)» de Drawnah — https://sketchfab.com/3d-models/breakfast-argentina-edition-68489719319b4aa2b8d62b10c755d0db
- «Food Collection - Game Ready» de Melon Polygons — https://sketchfab.com/3d-models/food-collection-game-ready-969b4e6ef7444650ba8a22a46d57ff43

Optimizados para celular (texturas WebP, sin mapas de normales). Detalle en `public/models/CREDITS.md`.
