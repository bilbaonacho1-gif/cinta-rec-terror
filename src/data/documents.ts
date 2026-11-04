/** Textos que se encuentran en la casa. La historia se cuenta en fragmentos. */
export const DOCUMENTS = {
  report: `INFORME — Insp. Rubén Salgado
Causa Carvajal (expte. 1144/98) — Lomas de Zamora

Familia de cuatro: Héctor, Norma, Lucía (14) y Martín (9).
Desaparecidos el viernes 9 de octubre.
La casa estaba cerrada por dentro. La persiana del almacén, baja.
El Falcon, en el garaje.

La fiscalía lo caratuló "abandono de hogar".
No hay cuerpos. No hay sangre. Sólo una videocámara
prendida en la galería y una caja de cintas.

En todas las cintas aparece la familia.
En todas hay alguien más, al fondo.

Vuelvo esta noche con la cámara.
Si alguien lee esto: no la apagues.`,

  clipping: `EL ECO DEL SUR — Lunes 12 de octubre de 1998

MISTERIO EN BANFIELD: SIGUE SIN APARECER
LA FAMILIA DEL ALMACÉN

Los cuatro integrantes de la familia Carvajal, dueños del
tradicional almacén de la calle Maipú, siguen sin aparecer.

"La persiana no se levanta desde el viernes. Y de noche se
escuchan cadenas", dijo una vecina que pidió reserva de su nombre.

Otros aseguran haber visto "una luz roja" moviéndose por las
ventanas. La policía sólo encontró una videocámara, todavía grabando.`,

  board: `Fotos impresas de cuadros de video. Decenas.
Gente mirando a cámara. Detrás de cada una, la misma silueta,
cada vez un poco más cerca.

Debajo, con la letra de Salgado:
"NO SE MUEVE SI LO MIRÁS. NUNCA LE DES LA ESPALDA."
Y más abajo, en birome roja:
"¿EL FAMILIAR? — preguntar en Tucumán"`,

  letter: `Tucumán, 9 de octubre de 1951

Querido hijo:
Me voy a Buenos Aires con ustedes. El ingenio cierra
y el patrón ya no puede tenerlo.

No te asustes. En el sótano del ingenio vivía algo que
los peones llamaban el Familiar. Al patrón le daba plata,
buenas zafras, suerte. Y cada 9 de octubre se cobraba
un peón. Así fue siempre.
Los peones decían que no tiene piel. Que camina
encorvado, con los brazos largos, y que no se mueve
mientras uno lo mira.

El patrón me lo dejó a mí. Va a vivir en la pieza del fondo,
como un inquilino. No se lo mira, no se le habla,
y nunca, nunca, se le deja de pagar.

Tu padre,
Ramón Carvajal`,

  fiado: `LIBRETA DE FIADO — Almacén Carvajal

Sra. Ofelia ........ 1 kg yerba, fideos ........ $ 4,50
Tito (carnicería) .. 2 sifones, lavandina ...... $ 3,20
Chiche ............. cigarrillos, vino ......... $ 6,00
La de Gutiérrez .... dulce de leche, pan ....... $ 2,80

9/10/97 — EL DEL FONDO .......... pagado (papá)

[Desde acá, otra letra, temblorosa:]
Papá murió en marzo. No sé cómo se paga.
No sé qué quiere.

9/10/98 — EL DEL FONDO .......... 4`,

  almanac: `Almanaque de la Carnicería "Don Tito", octubre de 1998.
El 9 está encerrado en un círculo rojo. Al lado, con birome:
"cobra".

Atrás, colgados del mismo clavo, hay almanaques viejos.
1997, 1996, 1995... hasta 1952.
En todos, el 9 de octubre está marcado.`,

  breakfast: `El desayuno del viernes 9 sigue en la mesa ratona.
El pan está duro como una piedra. El frasco de dulce de leche,
sin abrir. Cuatro tazas, y la yerba del mate todavía húmeda.

Nadie se levantó de esta mesa.
Simplemente dejaron de estar.`,

  mate: `El mate de Salgado, en el escritorio.
La yerba todavía está húmeda.

El agua del termo está helada.
Al lado, en un papelito: "lo calenté hace cinco minutos".`,

  drawing: `Un dibujo con crayones, pegado con cinta scotch a la altura de un nene.
Una casa, cuatro personas de palito y, al lado de la tele,
una figura larga y roja, sin cara.

Arriba, con letra de Martín (9 años):
"EL SEÑOR DE LA TELE"
"no le gusta que lo miren"

Atrás, en lápiz: "si viene, abajo de la cama no te ve".`,

  ribbons: `Cintitas rojas atadas al marco de la pieza del fondo.
Cientos. Algunas nuevas, otras desteñidas por los años.

"Contra la envidia", decía la abuela.
Acá no hay envidia. Acá alguien tenía miedo de lo que dormía adentro.`,

  portraitCaption: 'Los Carvajal en Tucumán, 1932. El nene de saco, sentado a la izquierda, es el abuelo Ramón.',
  portraitFigureCaption: 'Los Carvajal en Tucumán, 1932.\n...¿Qué es eso que asoma atrás del padre? No tiene piel. Y mira a cámara.',
  floorPhotoCaption: 'La misma foto de 1932, otra vez. Hay copias tiradas por toda la casa, como si alguien las hubiera ido soltando.',
  floorPhotoFigureCaption: 'La misma foto. Por el visor, la cosa sin piel ya no está atrás del padre:\nestá más adelante. Más cerca de la cámara.',
};

export type DocId = keyof typeof DOCUMENTS;

/** Boletín de la radio del almacén (se lee en voz alta). */
export const RADIO_BULLETIN = [
  'Radio del Sur, AM 870. Son las tres y diez de la mañana.',
  'Sigue sin novedades la búsqueda de la familia Carvajal, desaparecida el viernes en Banfield.',
  'Fuentes policiales confirmaron que un inspector ingresó anoche a la vivienda de la calle Maipú y tampoco se reportó.',
  'Los vecinos piden que la casa sea clausurada.',
];

/** Lo que dice la radio cuando ya no es la radio. */
export const RADIO_WHISPER = 'No te des vuelta.';
