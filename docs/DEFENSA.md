# Guía para defender el parcial

Resumen de **dónde está cada requisito de la consigna en el código, cómo funciona y qué responder** si lo
preguntan. Las rutas son desde la raíz del repo.

---

## 1. La idea en 30 segundos

> "Es un juego de terror en primera persona para celular. El celular es una videocámara de 1998: con el
> giroscopio mirás la casa moviendo el teléfono. El monstruo **sólo se ve por la cámara** y **no se mueve mientras
> lo tenés en el centro del visor**. Ganás si encontrás las 3 cintas VHS y escapás; perdés si te atrapa 3 veces.
> Está hecho con Three.js, se entra escaneando el QR del afiche y está publicado en Vercel."

## 2. Arquitectura (cómo está organizado)

- `src/engine/Engine.ts` es el **corazón**: crea el renderer, la escena, la cámara y todos los sistemas, corre el
  loop (`renderer.setAnimationLoop(() => this.frame())`) y tiene las acciones que dispara la interfaz
  (`toggleCamera`, `interact`, `useBattery`, `pause`…).
- La **interfaz** (HUD, menús, pantallas) es HTML/CSS superpuesto al canvas, hecho con React (`src/components/`).
  React **no** maneja el juego: sólo lee un *store* liviano (`src/engine/store.ts`) que el motor actualiza
  pocas veces por segundo. Así la UI no se re-renderiza 60 veces por segundo.
- La escena se arma en `src/scene/HouseBuilder.ts` (casa, muebles, luces, puntos de navegación del monstruo).

**Si preguntan por qué React:** "Sólo para la interfaz superpuesta (menús y HUD), que tiene mucho estado. Todo lo 3D
es Three.js puro en clases TypeScript, que se compilan a JavaScript ES2022."

## 3. Requisitos A — Escena 3D

### Geometrías complejas compuestas
- `src/scene/props.ts`: cada mueble es un `THREE.Group` armado con primitivas (`BoxGeometry`, `CylinderGeometry`,
  `IcosahedronGeometry`…). Ejemplos: `radio()`, `balanza()`, `cashRegister()`, `sodaCrate()` (cajón con 5 sifones).
- `src/entities/Humanoid.ts`: figura con "huesos" (grupos anidados) para poses.
- **Optimización**: `StaticBatch` (`src/scene/builders.ts`) fusiona toda la geometría estática de cada habitación
  **por material** con `mergeGeometries` → pocas *draw calls*.

### Iluminación y sombras
- `AmbientLight` + `HemisphereLight` de relleno (`HouseBuilder` constructor).
- **Pool de 4 `PointLight`** (`src/scene/lighting.ts`, clase `LightPool`): hay ~15 lámparas en la casa, pero sólo
  4 luces reales que se reasignan a las lámparas más cercanas al jugador cada 0,25 s. *Por qué:* cambiar la cantidad
  de luces obliga a recompilar los shaders; con un número fijo, no.
- **Sombras optimizadas** (`HouseBuilder.makeShadowLight` / `updateShadowLight`): **una sola** `SpotLight` con
  sombra (mapa de 512 px, `PCFShadowMap`) que se ubica en la lámpara de techo más cercana apuntando hacia abajo.
  Sólo proyectan muebles, modelos y el monstruo (`castShadow`); paredes y pisos sólo reciben (`receiveShadow`),
  así el pase de sombras dibuja poca geometría. Si los FPS caen, `Engine.measure()` apaga la sombra.

### Materiales y texturas
- Texturas generadas por código en canvas (`src/assets/textures.ts`): empapelados, baldosas calcáreas, madera,
  persiana. Se aplican con **UV en coordenadas de mundo** para que no se estiren (`worldBox` en `builders.ts`).
- **PBR**: los modelos GLB y el monstruo usan `MeshStandardMaterial` (`src/scene/ModelKit.ts`,
  `src/entities/Monster.ts`). Sin mapa de entorno se usa `metalness: 0` (si no, se ven negros).

### Modelos 3D
- `src/scene/ModelKit.ts` carga los GLB, separa las piezas por nombre (mate, termo, productos) y las apoya en el
  piso. El monstruo (`Monster.useModel`) es un GLB con esqueleto y animaciones.

## 4. Requisitos A2 — Interactividad (al menos dos mecanismos táctiles)

| Mecanismo | Dónde | Cómo funciona |
|---|---|---|
| **Giroscopio** | `src/controllers/GyroscopeController.ts` | `deviceorientation` → cuaternión (alpha/beta/gamma + orientación de pantalla). En iPhone pide permiso con `DeviceOrientationEvent.requestPermission()` dentro del toque de ACTIVAR CÁMARA. |
| **Raycaster al tocar** | `Engine.pickAt()` | Convierte el toque a coordenadas normalizadas (−1..1), `raycaster.setFromCamera(ndc, camera)` e intersecta contra esferas invisibles de cada objeto **y** contra paredes/muebles: si lo primero que toca el rayo es una pared, no selecciona nada. |
| **Drag / rotate de objetos** | `src/engine/Inspector.ts` | Al agarrar una cinta, la foto o el mate, aparece delante de la cámara; el arrastre del dedo cambia `rotation.x / rotation.y` (con inercia) y el pellizco la acerca. |
| **Joystick táctil** | `src/components/Joystick.tsx` | Pointer Events con `setPointerCapture`; el desplazamiento del círculo es la dirección de movimiento. |
| **Mantener apretado = caminar** | `LookController.onDown` | Si el dedo queda quieto 350 ms se camina hacia adelante (modo una mano). |
| **Botones UI** y **pinch zoom** | `CamcorderHUD.tsx`, `LookController` | REC, NV, batería, zoom; dos dedos cambian el FOV. |

### Animaciones
- **`AnimationMixer`** (`Monster.useModel` / `Monster.animate`): clips `idle`, `walk` y `attack` del GLB, con
  *crossfade*. Detalle clave del juego: cuando lo estás mirando **no se llama a `mixer.update()`**, así queda
  totalmente congelado.
- **`requestAnimationFrame`** (loop de `Engine.frame()`): puertas, péndulo del reloj, parpadeo de luces, balanceo
  de la cámara al caminar, giro automático del objeto inspeccionado.

## 5. Requisitos A3 — Cámara

- `PerspectiveCamera` (`Engine`), con el **FOV adaptado a la orientación** (`LookController.setAspect`): en vertical
  se abre para no perder campo de visión horizontal.
- Control por **sensores** (giroscopio) o por **toque** (arrastrar), y *pointer lock* con mouse en compu.

## 6. Requisitos B — Mobile-First

- **PixelRatio**: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` en `Engine.resize()`, que se llama
  en `resize` y `orientationchange`.
- **Resolución adaptativa**: el post-proceso renderiza a una escala interna (`post.renderScale`) que baja si los
  FPS caen de 45 y sube si pasan 58 (`Engine.measure`).
- **Medidor de FPS**: Pausa → MEDIDOR DE FPS, o el link con `?fps` al final. *Muéstrenlo en la presentación.*
- **Carga**: modelos con geometría **Draco** (3,6 MB → 1,7 MB) y texturas WebP; barra de progreso con
  `THREE.LoadingManager` + progreso en bytes (`src/engine/loading.ts`); INICIAR se habilita al terminar.
- **UI**: botones ≥ 48 px en las esquinas (pulgares), modo una mano, áreas seguras del *notch*, ayuda al empezar,
  aviso de luces que parpadean y opción para reducirlas (accesibilidad).

## 7. Requisito C — QR

- `entrega/qr-cinta-rec-terror.png` (2048 px) y `.svg`, con corrección de errores alta (H), apuntando a
  https://cinta-rec-terror.vercel.app/.
- `entrega/afiche-A4.pdf` (para imprimir) y `entrega/mockup.png`. Las fuentes están en `entrega/fuentes/`.

## 8. Lógica del juego (por si preguntan "¿cómo se gana / pierde?")

- `Engine.interact()` → al agarrar las 3 cintas se habilita la puerta del fondo → `Engine.ending()` → pantalla
  **ESCAPASTE** (`EndScreen`).
- `Engine.onCaught()` → resta un rebobinado (`store.lives`); con vidas vuelve al último punto guardado
  (`Engine.retry()`); con 0 → **PERDISTE** (`LostScreen`).
- El monstruo (`src/scene/EntitySystem.ts`) se mueve por una **red de puntos** entre habitaciones (no atraviesa
  paredes). `computeVisibility()` proyecta 3 puntos del cuerpo a la pantalla (`vector.project(camera)`) y tira un
  rayo para ver si hay una pared en el medio: si está en el centro del visor y sin obstáculos, está "observado" y
  no se mueve.

## 8 bis. Monstruo, escondites, sustos y tutorial

- **IA** (`EntitySystem.updateHunt`): *roam* (va hacia donde cree que estás), *chase* (te ve: raycast desde su
  cabeza hasta tus ojos, hasta 11 m), *search* (llega al último lugar donde te vio y mira alrededor) y *leave* (se
  aleja y desaparece). Camina con `walk()`: sigue la ruta de la red de puntos y suena un paso cada ~0,7 s.
- **Escondites** (`Engine.enterHide`): la cámara pasa abajo de la cama o detrás de la rendija del ropero (con un
  overlay CSS). `setPlayerHidden()` decide si te vio entrar: si te estaba persiguiendo de cerca y con línea de
  visión, va directo al escondite; si no, busca y se va.
- **Cinemática** (`Engine.catchCinematic`): mientras dura, una función por tiempo pisa la posición y orientación de
  la cámara después del `LookController`; apunta a la posición real del hueso de la cabeza (`Monster.headWorld`).
- **Sonido de terror**: `stinger` cuando vuelve a aparecer en el visor, loop `chase` según la distancia, `suspense`
  según la tensión, `heavyStep` en cada paso y `heartbeat` cuando está a menos de 5 m.
- **Tutorial progresivo** (`Director.update`): cada aviso aparece una sola vez cuando hace falta, con la tecla o el
  botón del dispositivo (`store.key`), y los objetivos nuevos se anuncian arriba (`store.newObjective`).

## 9. Preguntas probables

**¿Por qué no usaron OrbitControls?** — Porque es primera persona: la cámara se controla con el giroscopio o el
dedo, que es lo que pide la consigna como alternativa ("movimiento por eventos táctiles/sensores").

**¿Cómo optimizaron para celular?** — Geometría fusionada por material, pool fijo de luces, una sola sombra de
512 px, texturas WebP, Draco, pixelRatio máximo 2 y resolución adaptativa según los FPS.

**¿Qué hace el post-proceso?** — `src/effects/PostFX.ts`: la escena se dibuja a una textura y un único shader le
agrega ruido, scanlines, aberración cromática, glitches y la visión nocturna verde. Un solo pase = barato.

**¿Los sonidos son archivos?** — No: música, ambiente y efectos se sintetizan con WebAudio (`src/audio/sounds.ts`)
y se espacializan con `PannerNode` HRTF (por eso con auriculares se escucha de dónde vienen los pasos). Las voces
pueden ser la del navegador o grabaciones opcionales (ElevenLabs) — `docs/VOCES.md`.

**¿Qué assets externos usaron?** — Tres modelos de Sketchfab (créditos en el README; el monstruo es CC BY-NC, uso
no comercial) y una foto generada con IA. Todo lo demás es generado por código.

## 10. Checklist antes de presentar

- [ ] Abrir el link en un celular de gama media con `?fps` y sacar captura del medidor.
- [ ] Imprimir el afiche A4 y sacar una foto real escaneándolo (mockup en contexto real).
- [ ] Probar en iPhone que pida el permiso del giroscopio (ACTIVAR CÁMARA).
- [ ] Llevar auriculares para la demo.
- [ ] Repasar las secciones 3 a 8 de esta guía.
