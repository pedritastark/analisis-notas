/* ============================================================================
   Guía de bienvenida: pregunta al entrar si se quiere un recorrido y, paso a
   paso, resalta cada parte de la página con un recuadro y una explicación.
   El primer paso ofrece un consolidado de EJEMPLO (estudiantes ficticios,
   generado por src/ejemplo.py) para practicar descargarlo y cargarlo.
   ==========================================================================*/

const GUIA_CLAVE = 'notas.guiaVista';
const EJEMPLO_NOMBRE = 'consolidado-ejemplo-901.xlsx';
const guia = { activa: false, paso: 0, raf: 0 };

const PASOS = [
  {
    sel: '#drop', titulo: 'Cargá el archivo',
    texto: () => RES
      ? (esEjemplo() ? '¡Listo! Ya podés ver la página con datos.' : 'Ya hay un archivo cargado.')
      : 'Descargá el ejemplo y cargalo acá con <b>Cargar consolidado</b>.',
    extra: () => RES ? '' :
      `<div class="guiaAcciones"><button class="btn sm" data-guia="descargar">Descargar ejemplo</button>
       <button class="link" data-guia="cargarYa">Cargarlo por mí</button></div>`,
  },
  { sel: '.barra', titulo: 'Periodo', texto: () => 'Elegí el periodo que querés ver.' },
  { sel: '#sec-resumen', titulo: 'Resumen', texto: () => 'Las cifras más importantes del periodo.' },
  { sel: '#sec-estudiantes', titulo: 'Quiénes pierden', texto: () => 'Cada estudiante y lo que pierde. <span class="neg">Rojo</span>: pierde. <span class="mid">Naranja</span>: nota sin registrar.' },
  { sel: '#sec-asignaturas', titulo: 'Dónde se pierde más', texto: () => 'Tocá una barra para ver quiénes pierden esa asignatura.' },
  { sel: '#sec-graficos', titulo: 'Evolución', texto: () => 'Cómo le va a cada estudiante en el tiempo. Tocá un punto para ver su ficha.' },
  { sel: '#sec-descargas', titulo: 'Descargas', texto: () => 'Listados para Excel. El primero sirve para las actas.' },
  { sel: '#sec-archivo', titulo: 'Más detalles', texto: () => 'Información extra. Se abre con el <b>+</b>.' },
  { sel: '#toggleOpciones', titulo: 'Ajustes', texto: () => 'Nota mínima y pesos de las asignaturas.' },
  { sel: '#btnGuia', titulo: '¡Listo!', texto: () => 'Ahora cargá tu archivo real. La guía queda en este botón.' },
];

/** El ejemplo se reconoce por el nombre aunque el navegador le agregue « (1)» al descargarlo de nuevo. */
const esEjemplo = () => /consolidado-ejemplo-901/i.test(ARCHIVO);

/* ---------- inicio ---------- */

function guiaVista() { try { return localStorage.getItem(GUIA_CLAVE) === '1'; } catch { return false; } }
function guiaMarcar() { try { localStorage.setItem(GUIA_CLAVE, '1'); } catch { /* sin almacenamiento */ } }

function guiaInit() {
  $('#btnGuia').onclick = () => guiaEmpezar();
  $('#guiaSi').onclick = () => { guiaMarcar(); $('#guiaModal').hidden = true; guiaEmpezar(); };
  $('#guiaNo').onclick = () => { guiaMarcar(); $('#guiaModal').hidden = true; aviso('Podés abrir la guía cuando quieras con el botón «Guía».'); };
  $('#guiaPop').onclick = e => {
    const b = e.target.closest('[data-guia]');
    if (!b) return;
    const a = b.dataset.guia;
    if (a === 'sig') guiaIr(guia.paso + 1);
    else if (a === 'ant') guiaIr(guia.paso - 1);
    else if (a === 'salir') guiaSalir();
    else if (a === 'descargar') descargarEjemplo();
    else if (a === 'cargarYa') cargar(archivoEjemplo());
  };
  if (!guiaVista()) $('#guiaModal').hidden = false;
}

function guiaEmpezar() {
  guia.activa = true;
  $('#guiaFoco').hidden = false;
  $('#guiaPop').hidden = false;
  document.addEventListener('keydown', guiaTeclas);
  window.addEventListener('scroll', guiaReubicar, { passive: true });
  window.addEventListener('resize', guiaReubicar);
  guiaIr(0);
}

function guiaSalir() {
  guia.activa = false;
  $('#guiaFoco').hidden = true;
  $('#guiaPop').hidden = true;
  document.removeEventListener('keydown', guiaTeclas);
  window.removeEventListener('scroll', guiaReubicar);
  window.removeEventListener('resize', guiaReubicar);
}

function guiaTeclas(e) {
  if (e.key === 'Escape') guiaSalir();
  else if (e.key === 'ArrowRight') guiaIr(guia.paso + 1);
  else if (e.key === 'ArrowLeft') guiaIr(guia.paso - 1);
}

/** Lo llama pintar(): si la guía espera en el paso de carga, avanza sola al cargar un archivo. */
function guiaTrasCargar() {
  if (guia.activa && guia.paso === 0) setTimeout(() => guiaIr(0), 50);
}

/* ---------- pasos ---------- */

function guiaIr(n) {
  if (n < 0) return;
  if (n >= PASOS.length) { guiaSalir(); return; }
  guia.paso = n;
  $('#toast').hidden = true;   // un aviso viejo no debe tapar los botones de la guía
  const paso = PASOS[n], el = $(paso.sel);
  const ultimo = n === PASOS.length - 1;
  $('#guiaPop').innerHTML = `
    <div class="guiaN">Paso ${n + 1} de ${PASOS.length}</div>
    <h3>${paso.titulo}</h3>
    <p>${paso.texto()}</p>
    ${paso.extra ? paso.extra() : ''}
    <div class="guiaNav">
      <button class="link" data-guia="salir">Salir de la guía</button>
      <span>${n ? '<button class="btn ghost sm" data-guia="ant">Anterior</button>' : ''}
        <button class="btn sm" data-guia="sig">${ultimo ? 'Terminar' : n === 0 && !RES ? 'Seguir sin cargar' : 'Siguiente'}</button></span>
    </div>`;
  // las secciones largas se muestran desde arriba; las cortas, centradas
  const alto = el.getBoundingClientRect().height;
  el.scrollIntoView({ block: alto > window.innerHeight * 0.6 ? 'start' : 'center', behavior: 'smooth' });
  guiaReubicar();
  setTimeout(guiaReubicar, 350);
  setTimeout(guiaReubicar, 700);
  const sig = $('#guiaPop').querySelector('[data-guia="sig"]');
  if (sig) sig.focus({ preventScroll: true });
}

function guiaReubicar() {
  if (!guia.activa) return;
  cancelAnimationFrame(guia.raf);
  guia.raf = requestAnimationFrame(() => {
    const el = $(PASOS[guia.paso].sel);
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const r = el.getBoundingClientRect();
    const pop = $('#guiaPop'), pr = pop.getBoundingClientRect();
    const pw = pr.width, ph = pr.height, gap = 14;
    // el recuadro se recorta a la parte visible del elemento; si es muy alto, se corta para
    // que la explicación quepa debajo sin taparlo
    const top = Math.max(m, r.top - m);
    let bottom = Math.min(vh - m, r.bottom + m);
    const tope = vh - ph - gap - m;
    if (bottom > tope && top + 120 < tope && !(top - gap - ph > m)) bottom = tope;
    const left = Math.max(m, r.left - m), right = Math.min(vw - m, r.right + m);
    const foco = $('#guiaFoco');
    Object.assign(foco.style, { top: top + 'px', left: left + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' });

    let y;
    if (bottom + gap + ph < vh - m) y = bottom + gap;            // debajo
    else if (top - gap - ph > m) y = top - gap - ph;              // encima
    else y = vh - ph - 16;                                        // sobre el elemento, abajo de la pantalla
    let x = Math.min(Math.max(m, left), vw - pw - m);
    if (vw < 620) x = (vw - pw) / 2;
    pop.style.top = Math.max(m, y) + 'px';
    pop.style.left = x + 'px';
  });
}

/* ---------- archivo de ejemplo ---------- */

function bytesEjemplo() {
  const bin = atob(EJEMPLO_XLSX.trim());
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function archivoEjemplo() {
  const u8 = bytesEjemplo();
  return { name: EJEMPLO_NOMBRE, size: u8.length, arrayBuffer: async () => u8.buffer.slice(0) };
}

function descargarEjemplo() {
  try {
    const url = URL.createObjectURL(new Blob([bytesEjemplo()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = EJEMPLO_NOMBRE;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    aviso(`Descargado. Ahora tocá «${RES ? 'Cambiar archivo' : 'Cargar consolidado'}» y elegilo.`);
  } catch {
    aviso('No se pudo descargar el ejemplo. Probá con «Cargarlo por mí».');
  }
}
