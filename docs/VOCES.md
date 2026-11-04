# Voces grabadas (ElevenLabs u otra)

El juego usa la voz del navegador si no encuentra audios. Para usar voces grabadas:

1. Generá cada frase de abajo (por ejemplo en ElevenLabs, voz de hombre argentino de unos 50 años, tono cansado y con miedo, como grabado con una cámara).
2. Exportá en **MP3** con el nombre exacto de la columna *archivo* y copialo en `public/audio/voz/`.
3. Agregá el nombre (sin `.mp3`) a `public/audio/voz/manifest.json`, por ejemplo `["cinta1-02", "cinta1-03"]`.
4. Subí los cambios: Vercel lo publica solo. Los subtítulos siguen saliendo del texto del juego.

Consejo: generá con un poco de *ruido de cinta* o pasalo por un ecualizador telefónico para que suene a VHS de 1998.

## CINTA 01 — EL PRIMER CONTACTO

| archivo | frase |
|---|---|
| — (sonido, no se graba) | [Estática] |
| `cinta1-02.mp3` | Inspector Rubén Salgado. Catorce de octubre del noventa y ocho. Una y veintidós de la mañana. |
| `cinta1-03.mp3` | La fiscalía cerró la causa Carvajal como abandono de hogar. Cuatro personas, che. Nadie se va sin llevarse el auto. |
| `cinta1-04.mp3` | Los vecinos dicen que el abuelo trajo algo de Tucumán. Algo que vivía en la pieza del fondo. |
| `cinta1-05.mp3` | Anoche descubrí algo con esta cámara. |
| `cinta1-06.mp3` | A simple vista, la galería está vacía. Pero por el visor... está ahí. |
| `cinta1-07.mp3` | Mientras lo tengas en el visor, no se mueve. |

## CINTA 02 — EL INQUILINO

| archivo | frase |
|---|---|
| — (sonido, no se graba) | [Respiración agitada. Pasos rápidos.] |
| `cinta2-02.mp3` | Dos y cuarenta y siete. Se mueve cuando no lo mirás. |
| `cinta2-03.mp3` | Apagué la cámara un segundo para ahorrar batería... y escuché las cadenas. |
| `cinta2-04.mp3` | Cuando la volví a prender, estaba cuatro metros más cerca. |
| `cinta2-05.mp3` | Me hice un mate para no dormirme. Lo calenté hace cinco minutos y el agua ya está helada. |
| `cinta2-06.mp3` | El abuelo le decía "el inquilino". Los peones del ingenio le decían el Familiar. |
| `cinta2-07.mp3` | Juntá todas las baterías que encuentres. No te hagas el valiente. |

## CINTA 03 — LA ÚLTIMA CINTA

| archivo | frase |
|---|---|
| — (sonido, no se graba) | [Interferencia. Cadenas que se arrastran.] |
| `cinta3-02.mp3` | Cuatro y cuarto. Está atrás mío. Siento el aliento en la nuca. |
| `cinta3-03.mp3` | El abuelo Carvajal le pagaba uno por año. Un peón del ingenio, cada nueve de octubre. |
| `cinta3-04.mp3` | Cuando el viejo se murió, nadie siguió pagando. Entonces cobró solo. Los cuatro. |
| `cinta3-05.mp3` | La puerta del fondo no se abre mientras él tenga las cintas. Llevátelas todas. |
| `cinta3-06.mp3` | Si encontraste esta cámara... no corras. No le des la espalda con la cámara apagada. |
| `cinta3-07.mp3` | Y no dejes que la batería llegue a cero. Por lo que más quieras. |
| — (sonido, no se graba) | [La grabación sigue. Alguien entra a la pieza.] |

## Radio del almacén (locutor, tono de AM de madrugada)

| archivo | frase |
|---|---|
| `radio-1.mp3` | Radio del Sur, AM 870. Son las tres y diez de la mañana. |
| `radio-2.mp3` | Sigue sin novedades la búsqueda de la familia Carvajal, desaparecida el viernes en Banfield. |
| `radio-3.mp3` | Fuentes policiales confirmaron que un inspector ingresó anoche a la vivienda de la calle Maipú y tampoco se reportó. |
| `radio-4.mp3` | Los vecinos piden que la casa sea clausurada. |
| `radio-susurro.mp3` | No te des vuelta. *(susurrado, grave, muy lento: ya no es el locutor)* |
