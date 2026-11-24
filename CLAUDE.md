# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Herramienta web 100 % en el navegador (publicada en GitHub Pages como `index.html`) que lee el consolidado de notas por periodo de un curso (`.xlsx`), corrige la ponderación del campo de Ciencia y Tecnología (PreFísica/PreQuímica 0,33→0,17, Tecnología 0,17→0,33; Ciencias queda en 0,50), recalcula las notas de cada área y lista lo que pierde cada estudiante (nota < 60 por defecto). Sin dependencias, sin servidor y sin paso de npm. La interfaz y el código están en español.

## Comandos

```
python3 src/build.py                          # concatena app_template.html + core.js + charts.js + ui.js + guia.js + ejemplo.b64 → index.html (raíz)
python3 src/ejemplo.py                        # regenera src/ejemplo.b64 (consolidado ficticio de la guía; requiere openpyxl)
node src/smoke.mjs [ruta/al/consolidado.xlsx] # prueba de humo; por defecto ../Consolidado por periodo  602.xlsx (o $CONSOLIDADO)
python3 -m http.server 8000                   # servir la raíz para verla en el navegador
```

- `index.html` es lo que publica GitHub Pages: después de cambiar algo en `src/`, hay que volver a ejecutar el build y hacer commit del resultado.
- `build.py` reemplaza los marcadores `/*__CORE__*/`, `/*__CHARTS__*/` y `/*__UI__*/` de la plantilla y quita la línea `module.exports` de `core.js`.
- No hay framework de pruebas ni linter. `smoke.mjs` ejecuta el JS del `index.html` compilado en un DOM simulado e imprime resultados (KPIs, fichas, gráficos, vista previa) para revisarlos a ojo. Falla si `ui.js` usa un `#id` que no existe en el HTML. También verifica los espacios reservados que se ven antes de cargar. Los gráficos se dibujan sin depender de eventos, así que la prueba puede verificar el SVG generado.
- El consolidado real contiene datos de menores: nunca lo copies, lo versiones ni pegues su contenido.

## Arquitectura

- **`src/core.js`**: motor puro, sin DOM.
  - `unzip` lee el directorio central del ZIP a mano y descomprime con `DecompressionStream('deflate-raw')`.
  - `sharedStrings` y `sheetGrid` leen el XML con expresiones regulares y lo convierten en una matriz `grid[fila][col]`.
  - `readWorkbook` devuelve `[{name, grid}]`.
  - `estructura(grid)` detecta el diseño de la hoja con heurísticas, sin posiciones fijas:
    - la fila de pesos es la primera de las 8 primeras cuyos números están todos en (0,1] y alguno vale exactamente 1;
    - la fila de asignaturas está justo arriba y la de campos dos filas arriba;
    - las columnas de área son «NOTA DEL ÁREA» o tienen peso 1 sin nombre de asignatura;
    - los estudiantes van debajo de la columna «nombre» hasta una fila de totales o promedios.
  - `REGLAS_PESO` y `pesosCorregidos` contienen la corrección oficial de pesos.
  - `analizar(sheets, opts)`:
    - descarta las hojas sin estructura o sin notas digitadas;
    - toma los pesos de la primera hoja válida, con clave `"<campo>||<asignatura>"` en `pesosPorClave`. `opts.pesos` (las ediciones del usuario) tiene prioridad sobre esos pesos;
    - calcula los resultados por periodo, estudiante, asignatura y campo, y los avisos de calidad.
  - Las funciones `csv*` exportan CSV con `;` y BOM UTF-8 para que Excel los abra bien.
- **Diferencia entre «pendiente» y «no registra nota»** (son dos casos distintos, no los mezcles):
  - Si una asignatura no tiene ninguna nota distinta de 0 en una hoja, está *pendiente de digitar* y queda fuera.
  - Un 0 suelto en una columna que sí tiene notas es *no registra nota*. Por defecto cuenta como pérdida y queda marcado para validarlo con el docente.
  - `opts.sinRegistroCuenta === false` saca esas notas del promedio y reparte su peso entre las demás asignaturas.
- **`src/ui.js`**: tablero de una sola página, sin pestañas.
  - `init()` llama a `pintarVacio()`, que llena cada sección con espacios reservados (esqueletos y gráficos fantasma) hasta que se carga un archivo;
  - el saludo usa la constante `USUARIA`; el archivo se puede soltar en cualquier parte de la página;
  - guarda el estado global (`SHEETS`, `RES`, `OPTS = {umbral, sinRegistroCuenta, pesos}`);
  - `cargar(file)` analiza el archivo nuevo y solo reemplaza a `SHEETS`/`RES` si el análisis sale bien; después `pintar()` llama a todas las funciones `pintar*`, que escriben `innerHTML` (escapado con `esc`);
  - `periodoActivo` es el único selector de periodo y lo comparten todas las secciones. Arranca en el último periodo completo. Los periodos en digitación quedan fuera del gráfico de líneas y de la ficha, salvo el que esté elegido;
  - todos los controles vuelven a ejecutar `recalcular()`;
  - las descargas usan `claude.use('downloads')` si existe y, si no, un enlace con Blob.
- **`src/charts.js`**: gráficos sin librerías (`chartLineas`, `chartBarras`, `chartCalor`, `htmlComposicion`). Reciben datos ya calculados y callbacks `tip`/`onSelect`/`onPick`. Enganchan los eventos al contenedor y solo tocan el DOM cuando ocurre un evento. Los colores salen de variables CSS (`--neg`, `--s1`…`--s8`).
- **Celular (≤ 620 px)**: la lista de estudiantes muestra solo áreas y un «Ver ficha ›»; la ficha se abre como hoja inferior (`hojaFicha`/`esMovil` en `ui.js`, con `#velo`); las barras pasan a formato apilado (`apilado` en `chartBarras`); Guía y Ajustes son íconos. Todo objetivo táctil mide ≥ 40 px.
- **`src/guia.js`**: guía de bienvenida. La primera vez (marca `notas.guiaVista` en `localStorage`) pregunta si se quiere un recorrido; luego resalta cada sección con `#guiaFoco` y la explica en `#guiaPop`. El paso 1 ofrece descargar o cargar el consolidado de ejemplo. Si cambian las secciones de la página, hay que actualizar `PASOS`.
- **Consolidado de ejemplo**: `src/ejemplo.py` genera un .xlsx **ficticio** (nombres inventados, notas al azar con semilla fija) con el formato exacto de la plantilla del colegio, y lo guarda en base64 en `src/ejemplo.b64`, que se incrusta en `index.html`. Nunca uses el consolidado real como ejemplo: la página es pública. `smoke.mjs` carga el ejemplo y falla si no lee 30 estudiantes y 18 asignaturas.
- **`src/app_template.html`**: marcado y CSS. La usuaria es la coordinadora del colegio y pidió una estética minimalista: fondo blanco, solo modo claro, negro con rojo únicamente para las pérdidas, tipografía Inter, separadores finos en lugar de cajas o sombras. El orden de la página va de lo más importante a lo menos: resumen, quiénes van perdiendo, dónde se pierde más, evolución y ficha, descargas, y todo lo demás plegado en «Más detalles». `smoke.mjs` lee los ids y los `data-export` directamente del HTML, así que renombrarlos rompe la prueba de humo.
- `smoke.mjs` ejecuta el `<script>` del HTML compilado dentro de `new Function`. Por eso core y ui comparten un único ámbito global, y `smoke.mjs` necesita que `init`, `cargar`, `descargar`, `RES`, `pintarEstudiantes` y `pintarPesos` sigan existiendo con esos nombres.

## Privacidad

Los consolidados contienen nombres y notas de menores de edad. `.gitignore` bloquea `*.xlsx`, `*.xls`, `*.csv` y `datos/`. Nunca hagas commit de datos de estudiantes ni de exportaciones.
