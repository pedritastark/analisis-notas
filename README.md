# Análisis del consolidado de notas

Herramienta web para leer el consolidado de notas por periodo (Excel), corregir la
ponderación del campo de Ciencia y Tecnología y obtener, estudiante por estudiante,
las áreas y asignaturas que va perdiendo.

**Usar la herramienta:** https://pedritastark.github.io/analisis-notas/

## Cómo se usa

1. Abrir la página y elegir el archivo `.xlsx` del consolidado del curso.
2. La página muestra el resumen del curso, la lista de lo que pierde cada estudiante
   y los promedios por asignatura.
3. Descargar las listas en CSV (se abren en Excel) o imprimir directamente.

No hay que instalar nada ni crear cuenta. **El archivo nunca sale del computador:**
se lee y se procesa dentro del navegador, sin enviar nada a ningún servidor.

## Qué hace con las notas

- Lee todas las hojas del libro y descarta las plantillas que están sin diligenciar.
- Corrige la ponderación del campo de Ciencia y Tecnología, que en los archivos de
  origen viene intercambiada:

  | Asignatura              | En el archivo | Corregido |
  |-------------------------|---------------|-----------|
  | Ciencias                | 0,50          | 0,50      |
  | PreFísica / PreQuímica  | 0,33          | **0,17**  |
  | Tecnología              | 0,17          | **0,33**  |

- Recalcula la nota de cada área como suma ponderada de sus asignaturas.
- Marca como perdida toda nota por debajo de 60 (el mínimo es configurable).

La estructura no está fijada a un curso: la página localiza sola la fila de pesos,
los campos, las asignaturas y los estudiantes, así que funciona con cualquier
consolidado que use esta plantilla.

## Opciones

- **Nota mínima para aprobar** — 60 por defecto.
- **Tratar los 0 como «sin nota»** — excluye esas asignaturas del promedio y reparte
  su peso entre las demás, en vez de contarlas como calificación cero.
- **Pesos** — cualquier ponderación se puede ajustar a mano y todo se recalcula al instante.

## Archivos que exporta

| Archivo | Contenido |
|---|---|
| Áreas y asignaturas perdidas | Una fila por estudiante y periodo, con qué pierde y con qué nota |
| Consolidado por estudiante | Promedio y número de áreas perdidas por periodo, promedio global y variación |
| Resumen por área y asignatura | Promedio y porcentaje de pérdida de cada una, en todos los periodos |
| Detalle nota por nota | Formato largo, para tablas dinámicas |

CSV separado por punto y coma, con BOM UTF-8: Excel los abre con doble clic
respetando tildes y columnas.

## Desarrollo

`index.html` es un archivo autocontenido, sin dependencias: se genera a partir de
las fuentes en `src/`.

```
python3 src/build.py     # arma index.html desde app_template.html + core.js + ui.js
node src/smoke.mjs       # prueba el flujo completo contra un consolidado real
```

- `src/core.js` — descompresión del .xlsx, lectura del XML, análisis y exportación.
  No usa librerías: descomprime con `DecompressionStream` y parsea el XML con
  expresiones regulares.
- `src/ui.js` — interfaz y eventos.
- `src/app_template.html` — marcado y estilos.

La prueba de humo espera un consolidado real, que por contener datos de estudiantes
no está en el repositorio; hay que apuntarla a un archivo local.

## Privacidad

Este repositorio contiene únicamente código. Los consolidados llevan nombres y notas
de menores de edad y no deben subirse acá: `.gitignore` bloquea `*.xlsx` y `*.csv`
para evitar que se cuelen por accidente.
