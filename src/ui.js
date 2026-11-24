/* ============================================================================
   Interfaz: cargar archivo → recalcular pesos → mostrar y exportar el análisis.
   ==========================================================================*/

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => (v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(1).replace('.', ','));
const claseNota = (v, u) => (v === null ? '' : v < u ? 'neg' : v < u + 10 ? 'mid' : 'pos');

/** Lista de chips que se resume cuando son muchos. */
const chipsSinRegistro = (lista, total) => lista.length > 6
  ? `<span class="tag warn"><b>${lista.length}</b> de ${total} asignaturas sin nota registrada</span>`
  : lista.map(a => `<span class="tag warn">${esc(a.asignatura)}</span>`).join('');

let SHEETS = null, RES = null, ARCHIVO = '', TAMANO = null;
const OPTS = { umbral: 60, sinRegistroCuenta: true, pesos: {} };
let periodoActivo = 0, soloPierden = true, soloSinRegistro = false, busqueda = '';
// gráficos y vista previa
let vizMetrica = 'promedio', estSel = null, hojaPrev = 0, filtroAsig = null, verTodos = false;
const LISTA_CORTA = 8;

/** Nombre del saludo de la cabecera. */
const USUARIA = 'Liliana';

/* ---------- carga ---------- */

async function cargar(file) {
  estado('cargando');
  $('#cargaSub').textContent = `Leyendo ${file.name}…`;
  try {
    const sheets = await readWorkbook(await file.arrayBuffer());
    const res = analizar(sheets, { ...OPTS, pesos: {} });
    // solo si el archivo nuevo se pudo analizar reemplaza al anterior
    SHEETS = sheets; RES = res; OPTS.pesos = {};
    ARCHIVO = file.name;
    TAMANO = typeof file.size === 'number' ? file.size : null;
    estSel = null; filtroAsig = null; hojaPrev = 0;
    periodoActivo = ultimoCompleto();
    if (vizMetrica !== 'promedio' && !RES.campos.some(k => k.nombre === vizMetrica)) vizMetrica = 'promedio';
    estado('ok');
    pintar();
  } catch (err) {
    estado('error', mensajeAmable(err));
    console.error(err);
  }
}

function recalcular() {
  if (!SHEETS) return;
  try {
    RES = analizar(SHEETS, OPTS);
    if (periodoActivo >= RES.periodos.length) periodoActivo = ultimoCompleto();
    if (vizMetrica !== 'promedio' && !RES.campos.some(k => k.nombre === vizMetrica)) vizMetrica = 'promedio';
    if (estSel && !RES.estudiantes.some(e => e.nombre === estSel)) estSel = null;
    estado('ok');
    pintar();
  } catch (err) {
    estado('error', mensajeAmable(err));
    console.error(err);
  }
}

function mensajeAmable(err) {
  const t = (err && err.message) || '';
  if (/ZIP|xlsx válido/i.test(t))
    return 'Ese archivo no parece ser un Excel .xlsx. Si el consolidado está en formato antiguo (.xls), abrilo en Excel y guardalo como «Libro de Excel (.xlsx)».';
  if (/descomprimir|navegador/i.test(t))
    return 'Este navegador es muy antiguo para abrir el archivo. Probá con Google Chrome o Microsoft Edge actualizados.';
  if (/hoja/i.test(t))
    return t + ' Revisá que el archivo sea el consolidado por periodo, con la fila de pesos y los nombres de los estudiantes.';
  return t || 'No se pudo leer el archivo. Revisá que sea el consolidado por periodo en formato .xlsx.';
}

function estado(modo, msg) {
  $('#msg').hidden = !msg;
  $('#msg').textContent = msg || '';
  $('#msg').className = 'msg ' + (modo === 'error' ? 'err' : '');
  $('#drop').classList.toggle('cargando', modo === 'cargando');
  if (modo === 'error') pintarCarga();
}

/* ---------- pintado ---------- */

function pintar() {
  $('#subtitulo').textContent =
    `${RES.periodos.length} periodo${RES.periodos.length > 1 ? 's' : ''} con notas · ${RES.estudiantes.length} estudiantes · ${RES.campos.length} áreas`;
  pintarCarga();
  pintarSaludo();
  pintarAvisoPesos();
  pintarPesos();
  pintarTabsPeriodo();
  pintarResumen();
  pintarGraficos();
  pintarEstudiantes();
  pintarAsignaturas();
  pintarArchivo();
  pintarRevision();
  $$('[data-export]').forEach(b => { b.disabled = false; });
  guiaTrasCargar();
}

/* ---------- cabecera ---------- */

function pintarSaludo() {
  let fecha = '';
  try { fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { /* sin Intl */ }
  $('#fecha').textContent = fecha || 'Consolidado de notas por periodo';
  $('#saludo').textContent = `Hola, ${USUARIA}.`;
  if (!RES) {
    $('#bienvenida').innerHTML = 'Bienvenida de nuevo. Cargá el consolidado del curso y acá vas a ver quién va perdiendo y en qué.';
    return;
  }
  const p = RES.periodos[periodoActivo];
  const curso = (ARCHIVO.replace(/\.xlsx?$/i, '').match(/\d{3,4}/) || [])[0];
  const pierden = p.total - p.sinPerder;
  $('#bienvenida').innerHTML = `Bienvenida de nuevo. En <b>${esc(p.hoja)}</b>${curso ? ` del curso <b>${esc(curso)}</b>` : ''},
    ${pierden ? `<b>${pierden} de ${p.total}</b> estudiantes pierden al menos un área` : `ningún estudiante pierde áreas`}${
    p.tresOMas ? ` y <b>${p.tresOMas}</b> pierden tres o más` : ''}.`;
}

function pintarCarga() {
  const ok = !!RES;
  $('#drop').classList.toggle('listo', ok);
  $('#cargaTit').textContent = ok ? ARCHIVO : 'Ningún archivo cargado';
  $('#cargaSub').textContent = ok ? `${tamanoLegible(TAMANO)} · ${SHEETS.length} hojas · podés soltar otro archivo para reemplazarlo`
    : 'También podés arrastrar el .xlsx a cualquier parte de la página';
  $('#btnElegir').textContent = ok ? 'Cambiar archivo' : 'Cargar consolidado';
}

/* ---------- espacios reservados (antes de cargar) ---------- */

function pintarVacio() {
  pintarSaludo();
  pintarCarga();
  const kpi = k => `<div class="kpi"><div class="k">${k}</div><div class="v ph">—</div><div class="s"><span class="sk" style="width:70%;height:10px;margin-top:6px"></span></div></div>`;
  $('#kpis').innerHTML = ['Pierden al menos un área', 'Pierden 3 áreas o más', 'Promedio del curso', 'Notas sin registrar'].map(kpi).join('');
  $('#tabsPeriodo').innerHTML = ['P1', 'P2', 'P3'].map(x => `<span class="chip ph">${x}</span>`).join('');
  const filaSk = (n, w) => `<tr><th scope="row"><span class="sk" style="width:${w}px;height:10px"></span></th>${
    Array.from({ length: n }, () => '<td><span class="sk" style="width:38px;height:10px;margin-left:auto"></span></td>').join('')}</tr>`;
  $('#tablaAreas').innerHTML = `<table><caption>Nota de cada área por periodo · aparece al cargar el archivo.</caption><tbody>${
    [160, 120, 140, 110].map(w => filaSk(6, w)).join('')}</tbody></table>`;
  const msgG = t => `<div class="msgG"><span>${t}</span></div>`;
  $('#chLineas').innerHTML = `<div class="ghost"><svg viewBox="0 0 600 300" aria-hidden="true">
    ${[60, 120, 180, 240].map(y => `<line class="gl" style="stroke-width:1" x1="30" x2="590" y1="${y}" y2="${y}"/>`).join('')}
    <polyline class="gl" points="40,120 220,95 400,130 580,105"/><polyline class="gl" points="40,170 220,150 400,140 580,160"/>
    <polyline class="gl" points="40,210 220,230 400,200 580,215"/><polyline class="gl" points="40,80 220,110 400,90 580,75"/>
    </svg>${msgG('Las líneas de cada estudiante aparecen al cargar el archivo')}</div>`;
  $('#leyLineas').innerHTML = '';
  $('#chBarras').innerHTML = `<div class="ghost"><svg viewBox="0 0 600 300" aria-hidden="true">
    ${[70, 40, 85, 25, 55, 65, 30, 45].map((w, i) => `<rect class="g" x="150" y="${12 + i * 36}" width="${w * 4.2}" height="12" rx="4"/>
      <rect class="g" x="20" y="${12 + i * 36}" width="110" height="12" rx="4"/>`).join('')}</svg>${msgG('Porcentaje que pierde cada asignatura')}</div>`;
  $('#composicion').innerHTML = [0, 1, 2].map(() => `<div class="comp"><span class="sk" style="width:45%;height:12px"></span>
    <div class="stack"><span class="sk" style="flex:.5"></span><span class="sk" style="flex:.33"></span><span class="sk" style="flex:.17"></span></div>
    <span class="sk" style="width:80%;height:10px;margin:6px 0"></span><span class="sk" style="width:65%;height:10px"></span></div>`).join('');
  $('#chCalor').innerHTML = `<table><caption>Estudiantes × áreas · aparece al cargar el archivo.</caption><tbody>${
    [180, 150, 200, 140, 170].map(w => filaSk(7, w)).join('')}</tbody></table>`;
  $('#leyCalor').innerHTML = '';
  pintarDetalleEst();
  $('#contEst').innerHTML = [0, 1, 2].map(() => `<article class="est"><div class="estCab">
    <span class="sk" style="width:240px;height:14px"></span><span class="sk" style="width:120px;height:12px"></span></div>
    <div class="linea"><span class="sk" style="width:90px;height:20px"></span><span class="sk" style="width:130px;height:20px"></span></div></article>`).join('');
  $('#contadorEst').textContent = '';
  $('#tablaAsig').innerHTML = '<p class="mut" style="padding:12px 16px;margin:0">Aparece al cargar el archivo.</p>';
  const dato = k => `<div><div class="k">${k}</div><div class="v ph">—</div></div>`;
  $('#infoArchivo').innerHTML = ['Archivo', 'Tamaño', 'Hojas', 'Estudiantes', 'Áreas', 'Asignaturas'].map(dato).join('');
  $('#hojasPrev').innerHTML = '';
  $('#vistaPrevia').innerHTML = '<p class="mut" style="padding:12px 16px;margin:0">Aparece al cargar el archivo.</p>';
  $('#revision').innerHTML = '<p class="mut">Aparece al cargar el archivo.</p>';
}

/** Índice del último periodo sin asignaturas pendientes (o el último, si todos están en digitación). */
function ultimoCompleto() {
  const P = RES.periodos;
  for (let i = P.length - 1; i >= 0; i--) if (!P[i].pendientes.length) return i;
  return P.length - 1;
}

function pintarAvisoPesos() {
  const c = RES.cambiosPeso;
  const box = $('#avisoPesos');
  if (!c.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="h">Ponderación corregida al cargar</div>` +
    `<p>${c.map(x => `<strong>${esc(x.asignatura)}</strong> ${String(x.de).replace('.', ',')} → ${String(x.a).replace('.', ',')}`).join(' · ')}
     <span class="mut">(en ${esc(c[0].campo)}, en todas las hojas)</span></p>
    <p class="mut">Todas las notas de área de abajo están recalculadas con estos pesos, no con los del archivo.</p>`;
}

function pintarPesos() {
  const cont = $('#pesos');
  cont.innerHTML = RES.campos.map(k => {
    const suma = k.asigs.reduce((s, a) => s + (RES.pesosPorClave[k.nombre + '||' + a] ?? 0), 0);
    return `<div class="campo">
      <div class="campoTit">${esc(k.nombre)} <span class="${Math.abs(suma - 1) < 0.005 ? 'mut' : 'neg'}">suma ${suma.toFixed(2).replace('.', ',')}</span></div>
      ${k.asigs.map(a => {
        const clave = k.nombre + '||' + a, val = RES.pesosPorClave[clave] ?? 0;
        const corregida = RES.cambiosPeso.some(c => c.asignatura === a && c.campo === k.nombre);
        return `<label class="peso${corregida ? ' fix' : ''}"><span>${esc(a)}</span>
          <input type="number" step="0.01" min="0" max="1" value="${val}" data-clave="${esc(clave)}"></label>`;
      }).join('')}
    </div>`;
  }).join('');
  cont.oninput = e => {
    const inp = e.target.closest('input[data-clave]');
    if (!inp) return;
    const v = parseFloat(inp.value);
    if (!isFinite(v)) return;
    OPTS.pesos = { ...RES.pesosPorClave, [inp.dataset.clave]: v };
    recalcular();
  };
}

function pintarResumen() {
  const P = RES.periodos;
  const kpi = (k, v, s, warn) => `<div class="kpi"><div class="k">${k}</div><div class="v${warn ? ' warn' : ''}">${v}</div><div class="s">${s}</div></div>`;
  // los indicadores siguen al periodo elegido; la tendencia recorre los periodos completos
  const completos = P.filter(p => !p.pendientes.length);
  const base = completos.length ? completos : P;
  const ult = P[periodoActivo];
  const enDigitacion = P.filter(p => p.pendientes.length);
  // cuatro cifras: lo que una coordinadora necesita saber de un vistazo
  const pierden = ult.total - ult.sinPerder;
  const tendencia = f => base.length > 1 ? base.map(f).join(' → ') : '';
  $('#kpis').innerHTML =
    kpi('Pierden al menos un área', `${pierden}<span class="de"> de ${ult.total}</span>`,
      tendencia(p => p.total - p.sinPerder) || 'estudiantes', pierden > 0) +
    kpi('Pierden 3 áreas o más', `${ult.tresOMas}<span class="de"> de ${ult.total}</span>`,
      tendencia(p => p.tresOMas) || 'riesgo alto', ult.tresOMas > 0) +
    kpi('Promedio del curso', f1(ult.promedio), tendencia(p => f1(p.promedio)) || esc(ult.hoja)) +
    kpi('Notas sin registrar', `${ult.conSinRegistro}<span class="de"> estudiantes</span>`,
      ult.areasPorValidar ? `${ult.areasPorValidar} áreas se pierden solo por eso: validar con docentes` : 'con alguna casilla en 0');

  const banda = $('#avisoDigitacion');
  if (enDigitacion.length) {
    banda.hidden = false;
    banda.innerHTML = `<div class="h">Periodos en digitación</div><p>` +
      enDigitacion.map(p => `<strong>${esc(p.hoja)}</strong>: ${p.digitadas} de ${p.totalAsigs} asignaturas`).join(' · ') +
      `.</p><p class="mut">${ult.pendientes.length ? `Estás viendo ${esc(ult.hoja)}, que está incompleto: sus cifras son provisionales.`
        : `Estás viendo ${esc(ult.hoja)}. Los periodos incompletos se pueden elegir arriba; sus áreas salen como provisionales.`}</p>`;
  } else banda.hidden = true;

  const cab = P.map(p => `<th colspan="2">${esc(p.hoja)}${p.pendientes.length ? ` <span class="frac">${p.digitadas}/${p.totalAsigs}</span>` : ''}</th>`).join('');
  const sub = P.map(() => `<th>Prom.</th><th>% pierde</th>`).join('');
  $('#tablaAreas').innerHTML = `
    <table><caption>Nota del área recalculada con los pesos vigentes y porcentaje de estudiantes que la pierden.</caption>
    <thead><tr class="sup"><th class="spacer"></th>${cab}</tr><tr><th class="lbl">Área</th>${sub}</tr></thead>
    <tbody>${RES.campos.map(k => `<tr><th scope="row">${esc(k.nombre)}</th>${P.map(p => {
      const x = p.campo.find(c => c.nombre === k.nombre) || {};
      return `<td class="num ${claseNota(x.promedio, RES.umbral)}">${f1(x.promedio)}</td><td class="num heat ${heat(x.pct)}">${f1(x.pct)} %</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
}

const heat = v => (v === null || v === undefined ? 'r0' : v === 0 ? 'r0' : v < 15 ? 'r1' : v < 30 ? 'r2' : v < 50 ? 'r3' : 'r4');

function pintarTabsPeriodo() {
  $('#tabsPeriodo').innerHTML = RES.periodos.map((p, i) =>
    `<button class="chip${i === periodoActivo ? ' on' : ''}${p.pendientes.length ? ' parcial' : ''}" data-p="${i}">${esc(p.hoja)}${
      p.pendientes.length ? ` <span class="frac">${p.digitadas}/${p.totalAsigs}</span>` : ''}</button>`).join('');
  // en el celular los periodos se desplazan de costado: el elegido queda siempre a la vista
  const cont = $('#tabsPeriodo'), on = cont.querySelector && cont.querySelector('.chip.on');
  if (on && cont.scrollWidth > cont.clientWidth) cont.scrollLeft = on.offsetLeft - (cont.clientWidth - on.offsetWidth) / 2;
  $('#tabsPeriodo').onclick = e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    periodoActivo = +b.dataset.p;
    pintar();
  };
}

function pintarEstudiantes() {
  const p = RES.periodos[periodoActivo];
  let filas = p.filas;
  if (soloPierden) filas = filas.filter(f => f.camposPerdidos.length);
  if (soloSinRegistro) filas = filas.filter(f => f.sinRegistro.length);
  if (filtroAsig) filas = filas.filter(f => f.asigsPerdidas.some(a => a.asignatura === filtroAsig.asignatura && a.campo === filtroAsig.campo));
  if (busqueda) {
    const q = busqueda.toLowerCase();
    filas = filas.filter(f => f.nombre.toLowerCase().includes(q));
  }
  filas = [...filas].sort((a, b) => b.camposPerdidos.length - a.camposPerdidos.length || (a.promedio ?? 0) - (b.promedio ?? 0));

  // en el tablero la lista arranca corta; con búsqueda o filtro se muestra completa
  const corta = !verTodos && !busqueda && !filtroAsig && filas.length > LISTA_CORTA + 2;
  const visibles = corta ? filas.slice(0, LISTA_CORTA) : filas;
  $('#contEst').innerHTML = (filas.length ? visibles.map(f => `
    <article data-est="${esc(f.nombre)}" title="Ver la ficha de ${esc(f.nombre)}" class="est${f.camposPerdidos.length ? (f.camposPerdidos.every(c => c.porValidar) ? ' validar' : ' alerta')
        : (f.sinRegistro.length ? ' validar' : '')}">
      <div class="estCab">
        <h4>${esc(f.nombre)}</h4>
        <div class="estNums">
          <span class="mut">promedio</span> <b class="${claseNota(f.promedio, RES.umbral)}">${f1(f.promedio)}</b>
          <span class="sep"></span>
          <b class="${f.camposPerdidos.length ? 'neg' : 'pos'}">${f.camposPerdidos.length}</b> <span class="mut">de ${f.campos.length} áreas</span>
        </div>
      </div>
      ${f.campos.some(c => c.sinDatos) ? `<div class="linea"><span class="et">Sin notas todavía</span>
        <div class="chips">${f.campos.filter(c => c.sinDatos).map(c => `<span class="tag">${esc(nombreCorto(c.campo))}</span>`).join('')}</div></div>` : ''}
      ${f.camposPerdidos.length ? `
        <div class="linea"><span class="et">Áreas que pierde</span>
          <div class="chips">${f.camposPerdidos.map(c => `<span class="tag ${c.porValidar ? 'warn' : 'bad'}">${esc(nombreCorto(c.campo))} <b>${f1(c.nota)}</b>${
  c.porValidar ? ' <i>por validar</i>' : ''}${c.provisional ? ' <i>prov.</i>' : ''}</span>`).join('')}</div></div>
        ${f.sinRegistro.length ? `<div class="linea"><span class="et">No registra nota</span>
          <div class="chips">${chipsSinRegistro(f.sinRegistro, p.totalAsigs)}</div></div>` : ''}
        <div class="linea lAsig"><span class="et">Asignaturas que pierde</span>
          <div class="chips">${f.asigsPerdidas.map(a => `<span class="tag">${esc(a.asignatura)} <b>${f1(a.nota)}</b></span>`).join('') || '<span class="mut">ninguna: el área cae por el promedio ponderado, no por una asignatura suelta</span>'}</div></div>`
      : `${f.sinRegistro.length ? `<div class="linea"><span class="et">No registra nota</span>
          <div class="chips">${chipsSinRegistro(f.sinRegistro, p.totalAsigs)}</div></div>` : ''}
        <div class="linea ok">Aprueba las ${f.campos.length} áreas${f.asigsPerdidas.length ? ` · pero pierde ${f.asigsPerdidas.length} asignatura${f.asigsPerdidas.length > 1 ? 's' : ''}: ${f.asigsPerdidas.map(a => esc(a.asignatura) + ' (' + f1(a.nota) + ')').join(', ')}` : ''}</div>`}
      <div class="verFicha">${f.asigsPerdidas.length ? `${f.asigsPerdidas.length} asignatura${f.asigsPerdidas.length > 1 ? 's' : ''} perdida${f.asigsPerdidas.length > 1 ? 's' : ''} · ` : ''}Ver ficha ›</div>
    </article>`).join('') : `<p class="mut">Ningún estudiante coincide con el filtro.</p>`) +
    (corta ? `<button class="btn ghost verMas" data-vermas>Ver los ${filas.length - LISTA_CORTA} estudiantes restantes</button>`
      : verTodos && filas.length > LISTA_CORTA + 2 ? `<button class="btn ghost verMas" data-vermas>Mostrar solo los primeros ${LISTA_CORTA}</button>` : '');
  $('#contEst').onclick = e => {
    const art = e.target.closest('[data-est]');
    if (art) {
      estSel = art.dataset.est;
      pintarGraficos();
      // en el celular la ficha se abre como hoja desde abajo; en pantalla grande, junto al gráfico
      if (!esMovil()) $('#sec-graficos').scrollIntoView?.({ block: 'start' });
      return;
    }
    if (!e.target.closest('[data-vermas]')) return;
    verTodos = !verTodos;
    pintarEstudiantes();
    if (!verTodos) $('#sec-estudiantes').scrollIntoView?.({ block: 'start' });
  };

  $('#contadorEst').textContent = `${filas.length} de ${p.filas.length} estudiantes`;
  const fa = $('#filtroAsig');
  fa.hidden = !filtroAsig;
  fa.innerHTML = filtroAsig ? `<span class="tag bad">Pierden <b>${esc(filtroAsig.asignatura)}</b></span>
    <button class="btn ghost sm" data-quitar>Quitar filtro</button>` : '';
  fa.onclick = e => { if (e.target.closest('[data-quitar]')) { filtroAsig = null; pintarEstudiantes(); } };

  const av = $('#avisoPeriodo');
  if (p.pendientes.length) {
    av.hidden = false;
    av.innerHTML = `<div class="h">Periodo en digitación</div>
      <p>De ${p.totalAsigs} asignaturas hay <strong>${p.digitadas} digitadas</strong> y
      <strong>${p.pendientes.length} pendientes</strong>: ${p.pendientes.map(x => esc(x.nombre)).join(', ')}.</p>
      <p class="mut">Las asignaturas pendientes se excluyen del cálculo: no cuentan como perdidas. Un área marcada
      <span class="tag prov">provisional</span> se calculó solo con las asignaturas ya digitadas, así que puede cambiar.</p>`;
  } else av.hidden = true;
}

function pintarAsignaturas() {
  const P = RES.periodos;
  const cab = P.map(p => `<th colspan="2">${esc(p.hoja)}</th>`).join('');
  const sub = P.map(() => `<th>Prom.</th><th>% pierde</th>`).join('');
  const filas = [];
  for (const k of RES.campos) {
    filas.push(`<tr class="grp"><th colspan="${1 + P.length * 2}">${esc(k.nombre)}</th></tr>`);
    for (const a of k.asigs) {
      const peso = RES.pesosPorClave[k.nombre + '||' + a];
      filas.push(`<tr><th scope="row" class="sub">${esc(a)} <span class="mut">· peso ${String(peso).replace('.', ',')}</span></th>${
        P.map(p => {
          const x = p.asig.find(s => s.nombre === a && s.campo === k.nombre) || {};
          if (x.pendiente) return `<td class="num mut" colspan="2" style="text-align:center">sin digitar</td>`;
          return `<td class="num ${claseNota(x.promedio, RES.umbral)}">${f1(x.promedio)}</td><td class="num heat ${heat(x.pct)}">${f1(x.pct)} %</td>`;
        }).join('')}</tr>`);
    }
  }
  $('#tablaAsig').innerHTML = `<table><caption>Promedio de cada asignatura y porcentaje de estudiantes con nota bajo ${RES.umbral}.</caption>
    <thead><tr class="sup"><th class="spacer"></th>${cab}</tr><tr><th class="lbl">Asignatura</th>${sub}</tr></thead>
    <tbody>${filas.join('')}</tbody></table>`;
}

function pintarRevision() {
  const items = [];
  if (RES.vacias.length) items.push(['Hojas sin datos', RES.vacias.map(v => `<strong>${esc(v.hoja)}</strong> — ${esc(v.motivo)}`).join('<br>')]);
  if (RES.cambiosPeso.length) items.push(['Pesos corregidos',
    RES.cambiosPeso.map(c => `<strong>${esc(c.asignatura)}</strong> ${String(c.de).replace('.', ',')} → ${String(c.a).replace('.', ',')} <span class="mut">(${esc(c.campo)})</span>`).join('<br>')]);
  for (const p of RES.periodos) {
    const sub = [];
    if (p.pendientes.length) sub.push(`<strong>${p.pendientes.length}</strong> de ${p.totalAsigs} asignaturas sin digitar, excluidas del cálculo: ${p.pendientes.map(x => esc(x.nombre)).join(', ')}.`);
    if (p.sinRegistro) sub.push(`<strong>${p.sinRegistro}</strong> casillas en 0 dentro de columnas que sí tienen notas, en <strong>${p.conSinRegistro}</strong> estudiantes: se muestran como «no registra nota».` +
      (p.areasPorValidar ? ` <strong>${p.areasPorValidar}</strong> áreas se pierden únicamente por esas casillas — hay que validarlas con el docente antes de reportarlas.` : ''));
    p.duplicadas.forEach(d => sub.push(`Columnas con la misma nota: <strong>${d.asignaturas.map(esc).join(' = ')}</strong> en ${d.iguales} de ${d.total} estudiantes.`));
    p.sumaPesos.forEach(s => sub.push(`Los pesos de <strong>${esc(s.campo)}</strong> suman ${s.suma.toFixed(2).replace('.', ',')}, no 1,00.`));
    const desc = p.filas.filter(f => f.campos.some(c => c.areaArchivo !== null && c.area !== null && Math.abs(c.area - c.areaArchivo) > 0.15)).length;
    if (desc) sub.push(`<strong>${desc}</strong> estudiantes tienen al menos un área cuyo valor recalculado difiere del que trae el archivo <span class="mut">(esperado si se corrigieron pesos)</span>.`);
    if (sub.length) items.push([p.hoja, sub.join('<br>')]);
  }
  $('#nRevision').textContent = items.length ? `· ${items.length} punto${items.length > 1 ? 's' : ''} para revisar` : '· sin observaciones';
  $('#revision').innerHTML = items.length
    ? items.map(([t, c]) => `<div class="rev"><div class="revTit">${esc(t)}</div><div>${c}</div></div>`).join('')
    : '<p class="mut">Sin observaciones: no se detectaron hojas vacías, columnas repetidas ni pesos inconsistentes.</p>';
}

/* ---------- gráficos ---------- */

const valorEn = (fila, met) => !fila ? null
  : met === 'promedio' ? fila.promedio : (fila.campos.find(c => c.campo === met)?.area ?? null);
const pierdeEn = (fila, met) => !fila ? false
  : met === 'promedio' ? fila.camposPerdidos.length > 0 : !!fila.campos.find(c => c.campo === met)?.pierde;
const listaCorta = (arr, n = 5) => arr.slice(0, n).join(' · ') + (arr.length > n ? ` · y ${arr.length - n} más` : '');

function pintarGraficos() {
  const P = RES.periodos, p = P[periodoActivo], u = RES.umbral, vizPeriodo = periodoActivo;
  const sel = $('#vizMetrica');
  sel.innerHTML = `<option value="promedio">Promedio general</option>` +
    RES.campos.map(k => `<option value="${esc(k.nombre)}">${esc(nombreCorto(k.nombre))}</option>`).join('');
  sel.value = vizMetrica;

  // --- líneas ---
  const metLbl = vizMetrica === 'promedio' ? 'promedio' : nombreCorto(vizMetrica);
  // los periodos en digitación hunden todas las líneas: solo entran si se eligen
  const idx = P.map((x, i) => i).filter(i => !P[i].pendientes.length || i === vizPeriodo);
  const series = RES.estudiantes.map(e => ({
    nombre: e.nombre,
    valores: idx.map(i => valorEn(e.porPeriodo[i], vizMetrica)),
    riesgo: pierdeEn(e.porPeriodo[vizPeriodo], vizMetrica),
    sel: e.nombre === estSel,
  }));
  const ocultos = P.filter((x, i) => !idx.includes(i)).map(x => x.hoja);
  chartLineas($('#chLineas'), {
    periodos: idx.map(i => P[i].hoja + (P[i].pendientes.length ? ' (parcial)' : '')), series, umbral: u, periodoSel: idx.indexOf(vizPeriodo),
    tip: (k, jj) => {
      const j = idx[jj], e = RES.estudiantes[k], f = e.porPeriodo[j];
      const v = valorEn(f, vizMetrica);
      let h = `<b>${esc(e.nombre)}</b><div>${esc(P[j].hoja)} · ${esc(metLbl)} <strong class="${claseNota(v, u)}">${f1(v)}</strong></div>`;
      if (f && f.camposPerdidos.length)
        h += `<div class="neg">Áreas: ${esc(listaCorta(f.camposPerdidos.map(c => `${nombreCorto(c.campo)} ${f1(c.nota)}${c.porValidar ? ' (por validar)' : ''}`)))}</div>`;
      if (f && f.asigsPerdidas.length)
        h += `<div>Asignaturas: ${esc(listaCorta(f.asigsPerdidas.map(a => `${a.asignatura} ${f1(a.nota)}`)))}</div>`;
      if (f && !f.camposPerdidos.length && !f.asigsPerdidas.length) h += `<div class="pos">No pierde nada en este periodo</div>`;
      return h + `<div class="mut">Clic para abrir la ficha</div>`;
    },
    onSelect: (k, jj) => {
      estSel = RES.estudiantes[k].nombre;
      if (idx[jj] !== periodoActivo) { periodoActivo = idx[jj]; pintar(); } else pintarGraficos();
    },
  });
  const enRiesgo = series.filter(s => s.riesgo).length;
  $('#leyLineas').innerHTML =
    `<span><i style="background:var(--neg)"></i>Pierde ${vizMetrica === 'promedio' ? 'alguna área' : 'el área'} en ${esc(p.hoja)} (${enRiesgo})</span>` +
    `<span><i style="background:var(--muted)"></i>Aprueba (${series.length - enRiesgo})</span>` +
    (estSel ? `<span><i style="background:var(--accent)"></i>${esc(estSel)}</span>` : '') +
    `<span><i style="background:repeating-linear-gradient(90deg,var(--neg) 0 5px,transparent 5px 9px)"></i>Nota mínima (${f1(u)})</span>` +
    (ocultos.length ? `<span class="mut">Fuera del gráfico por estar en digitación: ${esc(ocultos.join(', '))} (elegilos arriba para verlos)</span>` : '');

  pintarDetalleEst();

  // --- barras ---
  $('#tituloBarras').textContent = `Dónde se pierde más en ${p.hoja}`;
  const plano = [];
  const grupos = RES.campos.map(k => ({
    campo: k.nombre,
    items: k.asigs.map(a => {
      const x = p.asig.find(s => s.nombre === a && s.campo === k.nombre) || {};
      const it = { nombre: a, campo: k.nombre, pct: x.pct ?? 0, pierden: x.pierden ?? 0, promedio: x.promedio ?? null, pendiente: !!x.pendiente, peso: x.peso };
      plano.push(it);
      return it;
    }),
  }));
  chartBarras($('#chBarras'), {
    grupos,
    tip: i => {
      const it = plano[i];
      return `<b>${esc(it.nombre)}</b><div class="mut">${esc(nombreCorto(it.campo))} · peso ${Math.round((it.peso ?? 0) * 100)} %</div>
        <div><strong>${f1(it.pct)} %</strong> pierde · ${it.pierden} estudiante${it.pierden === 1 ? '' : 's'}</div>
        <div>Promedio <strong class="${claseNota(it.promedio, u)}">${f1(it.promedio)}</strong></div>
        <div class="mut">Clic para ver quiénes la pierden</div>`;
    },
    onPick: i => {
      const it = plano[i];
      filtroAsig = { asignatura: it.nombre, campo: it.campo };
      pintarEstudiantes();
      $('#sec-estudiantes').scrollIntoView?.({ block: 'start' });
    },
  });

  // --- mapa de calor ---
  const filasCalor = [...p.filas]
    .sort((a, b) => b.camposPerdidos.length - a.camposPerdidos.length || (a.promedio ?? 0) - (b.promedio ?? 0))
    .map(f => ({
      nombre: f.nombre, promedio: f.promedio, perdidas: f.camposPerdidos.length, fila: f,
      celdas: RES.campos.map(k => {
        const c = f.campos.find(x => x.campo === k.nombre);
        return { v: c ? c.area : null, porValidar: !!(c && c.porValidar), provisional: !!(c && c.provisional), c };
      }),
    }));
  chartCalor($('#chCalor'), {
    areas: RES.campos.map(k => k.nombre), filas: filasCalor, umbral: u, sel: estSel,
    tip: (i, j) => {
      const r = filasCalor[i], c = r.celdas[j].c;
      if (!c) return `<b>${esc(r.nombre)}</b>`;
      const perd = c.detalle.filter(d => d.pierde).map(d => `${d.asignatura} ${f1(d.nota)}`);
      const sinReg = c.detalle.filter(d => d.sinRegistro).map(d => d.asignatura);
      return `<b>${esc(r.nombre)}</b><div>${esc(nombreCorto(c.campo))} <strong class="${claseNota(c.area, u)}">${f1(c.area)}</strong>${
        c.porValidar ? ' · <span class="mid">por validar</span>' : ''}${c.provisional ? ' · provisional' : ''}</div>` +
        (perd.length ? `<div class="neg">Pierde: ${esc(listaCorta(perd))}</div>` : '') +
        (sinReg.length ? `<div class="mid">Sin registrar: ${esc(listaCorta(sinReg))}</div>` : '');
    },
    onPick: i => { estSel = filasCalor[i].nombre; pintarGraficos(); },
  });
  $('#leyCalor').innerHTML = `<span><i class="sq"></i>Aprueba</span>` +
    [['r1', 'hasta 5 bajo el mínimo'], ['r2', '5 a 10'], ['r3', '10 a 20'], ['r4', 'más de 20']]
      .map(([c, t]) => `<span><i class="sq ${c}"></i>${t}</span>`).join('') +
    `<span><i class="sq" style="box-shadow:inset 0 0 0 2px var(--mid)"></i>Se pierde solo por notas sin registrar</span>` +
    `<span>* provisional (periodo en digitación)</span>`;
}

const esMovil = () => !!(window.matchMedia && window.matchMedia('(max-width: 620px)').matches);

/** En el celular la ficha es una hoja que sube desde abajo, con un velo detrás. */
function hojaFicha(abierta) {
  const box = $('#detalleEst');
  const movil = abierta && esMovil();
  box.classList.toggle('hoja', movil);
  $('#velo').hidden = !movil;
  if (document.body) document.body.style.overflow = movil ? 'hidden' : '';
  if (movil) box.scrollTop = 0;
}

function cerrarFicha() { estSel = null; hojaFicha(false); pintarGraficos(); }

function pintarDetalleEst() {
  const box = $('#detalleEst');
  const e = estSel ? RES.estudiantes.find(x => x.nombre === estSel) : null;
  box.classList.toggle('vacia', !e);
  hojaFicha(!!e);
  if (!e) {
    box.innerHTML = `<div class="vacioFicha"><div><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
      <b style="color:var(--ink2)">Ficha del estudiante</b><br>${RES ? 'Tocá un estudiante de la lista o un punto del gráfico para ver sus notas.'
        : 'Aparece al cargar el archivo y elegir un estudiante.'}</div></div>`;
    box.onclick = null;
    return;
  }
  const P = RES.periodos, u = RES.umbral;
  // mismos periodos que el gráfico de líneas: los completos más el elegido
  const idxF = P.map((x, i) => i).filter(i => !P[i].pendientes.length || i === periodoActivo);
  box.innerHTML = `<div class="cab"><div><div class="eyebrow">Ficha del estudiante</div><h3 style="font-size:1.15rem">${esc(e.nombre)}</h3></div>
      <div class="estNums"><span class="mut">promedio global</span> <b class="${claseNota(e.global, u)}">${f1(e.global)}</b>
      ${e.delta !== null && P.length > 1 ? `<span class="sep"></span><span class="mut">variación</span> <b class="${e.delta < 0 ? 'neg' : 'pos'}">${e.delta > 0 ? '+' : ''}${f1(e.delta)}</b>` : ''}
      <button class="btn ghost sm" data-cerrar style="margin-left:10px">Cerrar</button></div></div>
    <div class="tablewrap" style="box-shadow:none"><table>
      <thead><tr><th class="lbl">Área</th>${idxF.map(i => `<th>${esc(P[i].hoja)}</th>`).join('')}</tr></thead>
      <tbody>${RES.campos.map(k => `<tr><th scope="row">${esc(nombreCorto(k.nombre))}</th>${idxF.map(i => {
        const f = e.porPeriodo[i], c = f && f.campos.find(x => x.campo === k.nombre);
        return `<td class="num ${claseNota(c ? c.area : null, u)}">${f1(c ? c.area : null)}${c && c.porValidar ? '<span class="mid" title="Se pierde solo por notas sin registrar"> *</span>' : ''}</td>`;
      }).join('')}</tr>`).join('')}
      <tr><th scope="row">Promedio</th>${idxF.map(i => e.promedios[i]).map(v => `<td class="num ${claseNota(v, u)}"><b>${f1(v)}</b></td>`).join('')}</tr></tbody>
    </table></div>
    ${idxF.map(j => [e.porPeriodo[j], j]).map(([f, j]) => !f ? '' : `<div class="linea"><span class="et">${esc(P[j].hoja)}</span><div class="chips">${
      f.asigsPerdidas.length ? f.asigsPerdidas.map(a => `<span class="tag bad">${esc(a.asignatura)} <b>${f1(a.nota)}</b></span>`).join('')
        : '<span class="mut" style="font-size:.85rem">no pierde asignaturas</span>'}${
      f.sinRegistro.length ? `<span class="tag warn">${f.sinRegistro.length} sin registrar</span>` : ''}</div></div>`).join('')}
    ${e.porPeriodo.some(f => f && f.camposPerdidos.some(c => c.porValidar)) ? '<p class="mut" style="font-size:.78rem;margin:.6em 0 0">* el área se pierde solo por notas sin registrar: validar con el docente.</p>' : ''}`;
  box.onclick = ev => { if (ev.target.closest('[data-cerrar]')) cerrarFicha(); };
}

/* ---------- archivo y ponderación ---------- */

const letraCol = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const tamanoLegible = b => (b === null ? '—' : b < 1024 * 1024 ? Math.round(b / 1024) + ' KB' : (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB');

function pintarArchivo() {
  const usadas = RES.periodos.length, asigs = RES.campos.reduce((s, k) => s + k.asigs.length, 0);
  const dato = (k, v) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  $('#infoArchivo').innerHTML =
    dato('Archivo', esc(ARCHIVO)) + dato('Tamaño', tamanoLegible(TAMANO)) +
    dato('Hojas', `${usadas} con notas <span class="mut">de ${SHEETS.length}</span>`) +
    dato('Estudiantes', RES.estudiantes.length) + dato('Áreas', RES.campos.length) + dato('Asignaturas', asigs);

  $('#composicion').innerHTML = htmlComposicion(RES.campos, RES.pesosPorClave, RES.cambiosPeso);

  if (hojaPrev >= SHEETS.length) hojaPrev = 0;
  $('#hojasPrev').innerHTML = SHEETS.map((s, i) => {
    const vacia = RES.vacias.find(v => v.hoja === s.name);
    return `<button class="chip${i === hojaPrev ? ' on' : ''}${vacia ? ' desc' : ''}" data-h="${i}"
      title="${vacia ? 'Descartada: ' + esc(vacia.motivo) : 'Se usa en el análisis'}">${esc(s.name)}</button>`;
  }).join('');
  $('#hojasPrev').onclick = e => {
    const b = e.target.closest('[data-h]');
    if (b) { hojaPrev = +b.dataset.h; pintarArchivo(); }
  };
  pintarVistaPrevia();
}

function pintarVistaPrevia() {
  const sh = SHEETS[hojaPrev], grid = sh.grid;
  const est = estructura(grid);
  const vacia = RES.vacias.find(v => v.hoja === sh.name);
  const filaPeso = filaDePesos(grid);
  const MUESTRA = 8;
  const ultimaFila = est.estudiantes.length ? est.estudiantes[Math.min(MUESTRA, est.estudiantes.length) - 1].fila : Math.min(grid.length, 12) - 1;
  const ancho = Math.min(40, Math.max(0, ...grid.slice(0, ultimaFila + 1).map(r => (r ? r.length : 0))));
  const colsArea = new Set(est.campos.map(k => k.col));
  const celda = v => (v === null || v === undefined ? '' : typeof v === 'number'
    ? (Number.isInteger(v) ? String(v) : coma(+v.toFixed(2))) : esc(v));
  const filas = [];
  for (let r = 0; r <= ultimaFila; r++) {
    const fila = grid[r] || [];
    const cls = r === filaPeso ? 'fPeso' : r < filaPeso ? 'fCab' : '';
    filas.push(`<tr class="${cls}"><th class="rn">${r + 1}</th>${Array.from({ length: ancho }, (_, c) => {
      const v = fila[c];
      const cc = [typeof v === 'number' ? 'n' : '', colsArea.has(c) ? 'cArea' : '', c === est.colNombre && r > filaPeso ? 'cNom' : ''].filter(Boolean).join(' ');
      return `<td${cc ? ` class="${cc}"` : ''} title="${typeof v === 'string' ? esc(v) : ''}">${celda(v)}</td>`;
    }).join('')}</tr>`);
  }
  $('#vistaPrevia').innerHTML = `<table><caption>${esc(sh.name)} · ${vacia ? `descartada: ${esc(vacia.motivo)}` :
      `mostrando ${Math.min(MUESTRA, est.estudiantes.length)} de ${est.estudiantes.length} estudiantes`}</caption>
    <thead><tr><th class="rn"></th>${Array.from({ length: ancho }, (_, c) => `<th>${letraCol(c)}</th>`).join('')}</tr></thead>
    <tbody>${filas.join('')}</tbody></table>`;
}

/* ---------- descargas ---------- */

const EXPORTS = {
  perdidas: { f: csvPerdidas, nombre: 'areas-y-asignaturas-perdidas' },
  consolidado: { f: csvConsolidado, nombre: 'consolidado-por-estudiante' },
  resumen: { f: csvResumen, nombre: 'resumen-areas-y-asignaturas' },
  detalle: { f: csvDetalle, nombre: 'detalle-nota-por-nota' },
};

function nombreArchivo(base) {
  const curso = (ARCHIVO.replace(/\.xlsx?$/i, '').match(/\d{3,4}/) || [])[0];
  return base + (curso ? '-' + curso : '');
}

async function descargar(clave) {
  const { f, nombre } = EXPORTS[clave];
  const contenido = f(RES);
  const base = nombreArchivo(nombre);
  const dl = window.claude && typeof claude.use === 'function' ? await claude.use('downloads') : null;
  if (!dl) return descargarNavegador(base + '.csv', contenido);
  try {
    await dl.save({ filename: base + '.csv', data: contenido });
    aviso('Archivo guardado.');
  } catch (e) {
    if (e && e.code === 'extension_not_enabled') {
      try {
        await dl.save({ filename: base + '.txt', data: contenido });
        aviso('Guardado como .txt — en Excel: Datos › Obtener datos › Desde texto, separador punto y coma.');
      } catch (e2) { fallo(e2, contenido); }
    } else fallo(e, contenido);
  }
}

/** Descarga normal del navegador (GitHub Pages, Vercel, archivo local). */
function descargarNavegador(nombre, contenido) {
  try {
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    aviso('Descargado: ' + nombre);
  } catch (e) {
    copiar(contenido, 'No se pudo descargar; el contenido quedó copiado al portapapeles.');
  }
}

function fallo(e, contenido) {
  if (e && e.code === 'declined') return;
  if (e && e.code === 'rate_limited') return aviso('Esperá un momento antes de pedir otra descarga.');
  copiar(contenido, 'La descarga no está disponible acá; el contenido quedó copiado al portapapeles.');
}

async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); aviso(msg || 'Copiado al portapapeles.'); }
  catch { aviso('No se pudo copiar automáticamente.'); }
}

let avisoT;
function aviso(t) {
  const el = $('#toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(avisoT);
  avisoT = setTimeout(() => { el.hidden = true; }, 5200);
}

/* ---------- eventos ---------- */

function init() {
  const drop = $('#drop'), input = $('#file');
  $('#btnElegir').onclick = () => input.click();
  input.onchange = () => { if (input.files[0]) cargar(input.files[0]); input.value = ''; };

  // se puede soltar el archivo en cualquier parte de la página
  let arrastres = 0;
  const conArchivo = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragenter', e => { if (!conArchivo(e)) return; e.preventDefault(); arrastres++; $('#soltar').hidden = false; drop.classList.add('over'); });
  document.addEventListener('dragover', e => { if (conArchivo(e)) e.preventDefault(); });
  document.addEventListener('dragleave', () => { if (--arrastres <= 0) { arrastres = 0; $('#soltar').hidden = true; drop.classList.remove('over'); } });
  document.addEventListener('drop', e => {
    if (!conArchivo(e)) return;
    e.preventDefault();
    arrastres = 0; $('#soltar').hidden = true; drop.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) cargar(f);
  });

  $('#umbral').oninput = e => { const v = parseFloat(e.target.value); if (isFinite(v)) { OPTS.umbral = v; recalcular(); } };
  $('#sinRegistroCuenta').onchange = e => { OPTS.sinRegistroCuenta = !e.target.checked; recalcular(); };
  $('#soloPierden').onchange = e => { soloPierden = e.target.checked; if (RES) pintarEstudiantes(); };
  $('#soloSinRegistro').onchange = e => { soloSinRegistro = e.target.checked; if (RES) pintarEstudiantes(); };
  $('#buscar').oninput = e => { busqueda = e.target.value.trim(); if (RES) pintarEstudiantes(); };
  $('#vizMetrica').onchange = e => { vizMetrica = e.target.value || 'promedio'; if (RES) pintarGraficos(); };
  $('#toggleOpciones').onclick = () => {
    const d = $('#panelOpciones');
    d.hidden = !d.hidden;
    $('#toggleOpciones').setAttribute('aria-expanded', String(!d.hidden));
    $('#toggleOpciones').textContent = d.hidden ? 'Ajustes' : 'Cerrar ajustes';
  };
  $('#btnImprimir').onclick = () => {
    const app = $('#app');
    app.classList.add('imprimir-lista');
    try { window.print(); }
    catch { aviso('Tu navegador bloqueó la impresión acá. Descargá la lista en «Descargas» y abrila en Excel.'); }
    finally { app.classList.remove('imprimir-lista'); }
  };
  $$('[data-export]').forEach(b => b.onclick = () => RES && descargar(b.dataset.export));

  // los gráficos se dibujan al ancho de su contenedor: se rehacen al cambiar el tamaño de la ventana
  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => { if (RES) pintarGraficos(); }, 150);
  });

  $('#velo').onclick = cerrarFicha;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && estSel && esMovil()) cerrarFicha(); });
  window.addEventListener('scroll', () => tipOcultar(), { passive: true });

  pintarVacio();
  guiaInit();
}

document.addEventListener('DOMContentLoaded', init);
