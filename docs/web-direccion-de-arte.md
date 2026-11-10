# Web pública · Dirección de arte: «La oficina cobra vida»

La web pública es la misma oficina que ve el cliente, contada como una presentación. Mientras se baja por la página, la oficina de cristal pasa del día al atardecer y a la noche. Los departamentos son paneles de cristal que flotan, los agentes se encienden cuando les llega trabajo y una partícula de luz viaja entre departamentos con cada traspaso.

Regla de oro: **todo lo que se ve tiene que existir en la oficina real**. Si un efecto no se puede explicar con algo del producto, sobra.

Primitivas en `src/components/marketing/`. Catálogo vivo en `/_laboratorio` (solo en local y en los despliegues de prueba).

## 1. Tipografía

Poppins, la de la oficina. Titulares en 600 y con interletrado negativo para que tengan carácter. Cuerpo en 400. Escala fluida con `clamp()`, de 360 px a 1440 px de ancho (`tipografia.ts`, objeto `tipo`):

| Uso | Clase | Móvil → escritorio | Interlineado |
|---|---|---|---|
| Portada (una por página) | `tipo.display` | 44 → 96 px | 0,98 |
| Titular de sección a pantalla completa | `tipo.titular` | 34 → 64 px | 1,04 |
| Titular de panel o sección densa | `tipo.subtitular` | 24 → 36 px | 1,15 |
| Entradilla | `tipo.entradilla` | 17 → 21 px | 1,5 |
| Cuerpo sobre cristal | `tipo.cuerpo` | 16 px | 1,65 |
| Antetítulo (versalitas, +0,18 em) | `tipo.antetitulo` | 12 px | — |
| Cifras (contadores) | `tipo.cifra` | 40 → 72 px, números tabulares | 1 |

- Titulares con `text-balance`. Frases cortas, en español de España y tuteando.
- El texto que va directamente sobre la escena lleva `sobreEscena` (sombra suave). El que va sobre cristal, no.
- El texto largo, como los textos legales o las fichas, va en un cristal más opaco (`--glass-fill: rgba(16,16,22,0.5–0.62)`).

## 2. Paleta

La del sistema de cristal (CLAUDE.md) sin cambios, más un único color nuevo: **la luz**.

| Token | Valor | Uso |
|---|---|---|
| Texto | `#FFFFFF` / `rgba(255,255,255,.78)` / `.62` | Principal, secundario y terciario |
| Acento | `#4F8CFF` | Botones activos y enlaces destacados |
| **Luz** (`LUZ`) | `#FFD48A` | Halo de la partícula de traspaso y extremo de las líneas de luz. Cálida, como las lámparas al anochecer. **Solo para la luz**: nunca para texto ni fondos. |
| Estados | `#34D399` trabajando · `#FBBF24` aprobación · `#9CA3AF` pausa · `#F87171` error | Siempre con texto, nunca solo color |
| Departamentos | Ventas `#3B82F6` · Atención `#14B8A6` · Marketing `#F59E0B` · Operaciones `#8B5CF6` · Dirección `#9CA3AF` | Cabeceras de tarjeta y degradado origen → destino de las líneas |

La partícula tiene un núcleo blanco y un halo de luz. La línea va del color del departamento de origen al del destino, igual que en la oficina.

## 3. Escena

Tres momentos con las fotos que ya hay en `public/scenes/`. `EscenaScroll` las funde según el avance de la página:

| Avance de la página | Escena | Foto |
|---|---|---|
| 0-25 % | Día | `oficina-dia.jpg` (1672 × 941) |
| 25-45 % | Fundido al atardecer | `oficina-atardecer.png` (2400 × 1351) |
| 45-60 % | Atardecer | |
| 60-85 % | Fundido a la noche | `oficina-noche.jpg` (2400 × 1351) |

- Cada foto lleva el velo oscuro de su escena (`src/data/scenes.ts`), algo más oscuro que en la oficina: la web tiene más texto directamente sobre la escena.
- Paralaje: la foto es un 11 % más alta que la pantalla (sobra sobre todo por abajo) y sube un 6 % a lo largo de la página.
- next/image sirve AVIF o WebP al ancho de cada pantalla. La primera foto tiene prioridad de carga.

**Fotos pendientes:**
1. La foto de día solo mide 1672 px de ancho: se ve blanda en pantallas grandes y retina. Hace falta al menos **2880 px** (ideal 3840 px).
2. Día y noche son versiones retocadas de la foto del atardecer. Para que el cambio de luz sea creíble, lo ideal es **la misma toma real en los tres momentos**: mismo encuadre, trípode y hora dorada.
3. El concepto habla de una oficina **frente a la ciudad**, pero las fotos actuales muestran montañas. Si se quiere ciudad, hacen falta tres fotos nuevas, propias o con licencia libre.
4. Para móvil vertical conviene un recorte 9:16 de cada foto, con los ventanales en el centro. Hoy `object-cover` recorta los laterales.

## 4. Ritmo de las páginas

Alternar dos tipos de sección:

- **Pantalla completa** (`min-h-svh`, contenido centrado): portada, cambio de escena, cifras, demo en vivo y cierre. Poco texto, un titular `display` o `titular` y la escena respirando detrás.
- **Densa** (`py-16 sm:py-20`, rejilla de paneles): explicaciones, comparativas, precios y preguntas frecuentes. Cristal con cuerpo de 16 px.

Patrón recomendado: completa → densa → densa → completa (escena o cifras) → sección fija con pasos → densa → completa (cierre, ya de noche). Que no haya nunca dos secciones fijas seguidas.

## 5. Movimiento

- **Curvas:** salida rápida y llegada suave, `[0.22, 1, 0.36, 1]` para revelados y `easeOut` para todo lo demás. Duraciones de 300 a 700 ms. El paralaje, de 20 a 60 px.
- **Solo `transform` y `opacity`.** Nada de animar `width`, `height`, `top`, `margin` ni `filter`.
- **Cristal:** el `opacity` o el `filter` en un contenedor rompe el desenfoque de los cristales que lleva dentro. Por eso los paneles de cristal se animan solo con `transform`, y la opacidad se reserva para contenido sin cristal. No se anidan más de dos capas de cristal.
- **Sin saltos de diseño (CLS):** todo reserva su espacio antes de animar. El texto ocupa su sitio, los contadores reservan el ancho del número final, los vídeos usan `aspect-ratio` y las demos tienen una reserva del mismo alto.
- **Lo que se mueve más de 5 s tiene pausa:** vídeos y demo en vivo.

## 6. Accesibilidad y datos

| Situación | Comportamiento |
|---|---|
| `prefers-reduced-motion` | Sin paralaje, sin escena ligada al scroll (atardecer fijo), sin revelados, contadores con el valor final, pasos de `SeccionFija` como lista normal, vídeos en póster con «Reproducir vídeo» y partículas sustituidas por el brillo de llegada |
| `navigator.connection.saveData` o conexión 2G | Solo pósteres: ningún vídeo se descarga sin pulsar «Reproducir» |
| Lectores de pantalla | El texto revelado se lee entero una vez. Los pasos de la sección fija están en una lista oculta completa. Las demos son ilustraciones inertes, con descripción |
| Teclado | Foco visible del sistema (blanco, 2 px). Los controles son `<button>` reales |

`usePreferencias()` devuelve `{ reducido, ahorro }` sin desajustes de hidratación. En el laboratorio se pueden forzar las dos preferencias con `PreferenciasForzadas`.

## 7. Primitivas

| Primitiva | Qué hace |
|---|---|
| `RevelarTexto` | Revela un texto por palabras o por líneas al entrar en pantalla |
| `SeccionFija` | Panel fijo cuyo paso cambia con el scroll, con barra de progreso |
| `EscenaScroll` | Día → atardecer → noche ligado al scroll, con paralaje de la foto |
| `Paralaje` | Desplazamiento suave de paneles |
| `LineaDeLuz` | Curva y partícula entre dos elementos. Usa la misma geometría que la oficina (`handoffs/curva.ts`) y avisa con `alLlegar` para encender el destino |
| `Contador` | Cuenta animada sin salto de ancho |
| `VideoProducto` | Bucle silenciado y diferido, WebM + MP4, con póster y pausa |
| `DemoEnVivo` + `demoDiferida` | Componente real de la oficina cargado solo al acercarse |

Librerías: solo Framer Motion, que ya estaba en el proyecto. No ha hecho falta ninguna nueva.
