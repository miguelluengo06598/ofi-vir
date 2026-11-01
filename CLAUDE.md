# Oficina Virtual IA — contexto del proyecto

## Qué es
Plataforma web donde una empresa tiene su **oficina virtual** con **agentes de IA** organizados por **departamentos** (Ventas, Atención al cliente, Marketing, Operaciones · CRM, Dirección). Los agentes los crean **especialistas externos (creadores)** y se publican en un **marketplace** tras pasar un proceso de certificación. Las empresas los contratan y pagan **por uso con créditos** (tokens de IA + tarifa del creador). La plataforma se queda una comisión.

**Fase actual: SOLO DISEÑO DE LA INTERFAZ.** Todo funciona con datos simulados (mock). No hay backend, ni base de datos, ni llamadas a IA, ni pagos reales todavía.

## Stack
- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Framer Motion para animaciones y transiciones
- lucide-react para iconos
- Datos simulados en `src/data/*.ts`
- No añadir otras librerías sin preguntar.

## Estilo visual: "cristal sobre escena"
Referencia: interfaz tipo visionOS. Paneles de cristal esmerilado flotando sobre una foto a pantalla completa de una oficina/salón de lujo con ventanales panorámicos y vistas a montañas al atardecer.

### Fondo
- Imagen a pantalla completa (`object-cover`), fija, en `public/scenes/`. Cada departamento puede tener su propia escena.
- Capa de oscurecimiento encima, definida por escena en `src/data/scenes.ts` (día `0.40→0.50`, atardecer `0.35→0.50`, noche `0.25→0.45`) para que el cristal y el texto se lean (contraste medido sobre la imagen).
- Selector de escena (día / atardecer / noche) en la TopBar; la elección se guarda en `localStorage` y las escenas se funden entre sí. `oficina-dia.jpg` y `oficina-noche.jpg` son versiones graduadas de la foto del atardecer: sustituirlas por fotos reales cuando existan.
- Las imágenes deben ser propias o con licencia libre (nunca capturas de otros diseños).

### Cristal (tokens — definirlos en `tailwind.config` y `globals.css`)
| Token | Valor |
|---|---|
| glass-bg | `rgba(255,255,255,0.10)` |
| glass-bg-strong | `rgba(255,255,255,0.16)` (hover / activo) |
| glass-border | `1px solid rgba(255,255,255,0.18)` |
| glass-blur | `backdrop-filter: blur(28px) saturate(140%)` |
| glass-tint | `rgba(0,0,0,0.14)` bajo el cristal (velo oscuro para el contraste del texto) |
| glass-shadow | `0 8px 32px rgba(0,0,0,0.25)` + brillo interior `inset 0 1px 0 rgba(255,255,255,0.15)` |
| radio panel | 28px |
| radio tarjeta | 20px |
| radio botón | 999px (píldora) |

### Color
- Texto principal: blanco `#FFFFFF`; secundario: `rgba(255,255,255,0.78)`; terciario: `rgba(255,255,255,0.62)` (subidos desde 0.65 / 0.45 por contraste sobre el cristal).
- Acento: azul `#4F8CFF` (burbujas enviadas, botón enviar, elementos activos).
- Estado de agentes: trabajando `#34D399`, espera aprobación `#FBBF24`, en pausa `#9CA3AF`, error `#F87171`. Siempre acompañados de texto, nunca solo color.
- Cada departamento tiene un color propio para su tarjeta (degradado suave, opacidad ~0.6): Ventas azul, Atención verde azulado, Marketing ámbar, Operaciones violeta, Dirección grafito.

### Tipografía
- Poppins (Google Fonts). Títulos 600, cuerpo 400.
- Escala: 28 / 20 / 15 / 13 / 11 px.

### Componentes base (en `src/components/glass/`)
- `GlassPanel` — contenedor de cristal reutilizable.
- `PillButton` — botón píldora de cristal, con icono opcional y estado activo.
- `Dock` — barra vertical flotante a la izquierda con botones circulares y tooltip al pasar el ratón.
- `TopBar` — izquierda: filtros y calendario; centro: navegación en píldoras; derecha: mensajes, notificaciones con contador, búsqueda y avatar del usuario con punto de estado.
- `Avatar` — círculo con iniciales y degradado de color, punto de estado opcional.
- `StatusBadge` — punto + texto del estado del agente.
- `GlassCard` — tarjeta con cabecera de color, título, descripción, etiqueta y acciones.

### Movimiento
- Entradas: fade + desplazamiento de 12px + ligero blur que se aclara (300 ms, ease-out).
- Hover en tarjetas: elevar 4px y aumentar brillo del cristal.
- Al abrir una tarjeta, se expande en panel con `layoutId` de Framer Motion.
- Respetar `prefers-reduced-motion`.

## Reglas para Claude
- Toda la interfaz en **español**.
- Componentes pequeños y reutilizables; nada de estilos de cristal duplicados: usar siempre los componentes base.
- Accesibilidad: botones reales (`<button>`), `aria-label` en botones de solo icono, foco visible, contraste suficiente sobre el cristal.
- Rendimiento: `backdrop-filter` es costoso; no anidar más de 2 capas de cristal. El CSS ya lo impone: un `.glass` dentro de otro `.glass` no desenfoca.
- Las utilidades de Tailwind que chocan con `.glass` deben funcionar (sus reglas están en `@layer components`); usa `bg-…!` solo si hace falta.
- Responsive: en móvil el dock pasa a barra inferior y los paneles se apilan.
- Datos de ejemplo realistas, sin lorem ipsum.
- Al terminar cada paso, explicar qué se ha hecho y cómo verlo en el navegador.
