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

let SHEETS = null, RES = null, ARCHIVO = '';
const OPTS = { umbral: 60, sinRegistroCuenta: true, pesos: {} };
let periodoActivo = 0, soloPierden = false, soloSinRegistro = false, busqueda = '';

/* ---------- carga ---------- */

async function cargar(file) {
  ARCHIVO = file.name;
  estado('cargando', `Leyendo ${file.name}…`);
  try {
    const buf = await file.arrayBuffer();
    SHEETS = await readWorkbook(buf);
    OPTS.pesos = {};
    recalcular();
  } catch (err) {
    estado('error', mensajeAmable(err));
    console.error(err);
  }
}

function recalcular() {
  try {
    RES = analizar(SHEETS, OPTS);
    if (periodoActivo >= RES.periodos.length) periodoActivo = 0;
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
  $('#drop').hidden = modo === 'ok';
  $('#app').hidden = modo !== 'ok';
  $('#msg').hidden = !msg;
  $('#msg').textContent = msg || '';
  $('#msg').className = 'msg ' + (modo === 'error' ? 'err' : '');
}

/* ---------- pintado ---------- */

function pintar() {
  $('#nombreArchivo').textContent = ARCHIVO;
  $('#subtitulo').textContent =
    `${RES.periodos.length} periodo${RES.periodos.length > 1 ? 's' : ''} con notas · ${RES.periodos[0].total} estudiantes · ${RES.campos.length} áreas`;
  pintarAvisoPesos();
  pintarPesos();
  pintarResumen();
  pintarTabsPeriodo();
  pintarEstudiantes();
  pintarAsignaturas();
  pintarRevision();
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
  // el titular se lee del último periodo COMPLETO; los que están en digitación no encabezan
  const completos = P.filter(p => !p.pendientes.length);
  const base = completos.length ? completos : P;
  const ult = base[base.length - 1];
  const enDigitacion = P.filter(p => p.pendientes.length);
  $('#kpis').innerHTML =
    kpi('Promedio del curso', f1(ult.promedio), `en ${esc(ult.hoja)} · ${base.map(p => f1(p.promedio)).join(' → ')}`) +
    kpi('Áreas perdidas', f1(ult.pctAreas) + ' %', `de las áreas con nota · ${base.map(p => f1(p.pctAreas) + '%').join(' → ')}`, ult.pctAreas > 20) +
    kpi('Sin perder nada', `${ult.sinPerder}<span class="de"> / ${ult.total}</span>`, `estudiantes · ${base.map(p => p.sinPerder).join(' → ')}`) +
    kpi('Pierden 3 áreas o más', `${ult.tresOMas}<span class="de"> / ${ult.total}</span>`, `riesgo alto · ${base.map(p => p.tresOMas).join(' → ')}`, ult.tresOMas > 0) +
    kpi('No registran nota', `${ult.conSinRegistro}<span class="de"> / ${ult.total}</span>`,
      ult.areasPorValidar ? `${ult.areasPorValidar} áreas se pierden solo por eso — validar con los docentes`
                          : 'estudiantes con alguna casilla en 0');

  const banda = $('#avisoDigitacion');
  if (enDigitacion.length) {
    banda.hidden = false;
    banda.innerHTML = `<div class="h">Periodos en digitación</div><p>` +
      enDigitacion.map(p => `<strong>${esc(p.hoja)}</strong>: ${p.digitadas} de ${p.totalAsigs} asignaturas`).join(' · ') +
      `.</p><p class="mut">Las cifras de arriba corresponden a ${esc(ult.hoja)}, el último periodo completo.
       Los periodos incompletos se pueden consultar en «Qué pierde cada estudiante», con sus áreas marcadas como provisionales.</p>`;
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
  $('#tabsPeriodo').onclick = e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    periodoActivo = +b.dataset.p;
    pintarTabsPeriodo(); pintarEstudiantes();
  };
}

function pintarEstudiantes() {
  const p = RES.periodos[periodoActivo];
  let filas = p.filas;
  if (soloPierden) filas = filas.filter(f => f.camposPerdidos.length);
  if (soloSinRegistro) filas = filas.filter(f => f.sinRegistro.length);
  if (busqueda) {
    const q = busqueda.toLowerCase();
    filas = filas.filter(f => f.nombre.toLowerCase().includes(q));
  }
  filas = [...filas].sort((a, b) => b.camposPerdidos.length - a.camposPerdidos.length || (a.promedio ?? 0) - (b.promedio ?? 0));

  $('#contEst').innerHTML = filas.length ? filas.map(f => `
    <article class="est${f.camposPerdidos.length ? (f.camposPerdidos.every(c => c.porValidar) ? ' validar' : ' alerta')
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
        <div class="chips">${f.campos.filter(c => c.sinDatos).map(c => `<span class="tag">${esc(c.campo)}</span>`).join('')}</div></div>` : ''}
      ${f.camposPerdidos.length ? `
        <div class="linea"><span class="et">Áreas que pierde</span>
          <div class="chips">${f.camposPerdidos.map(c => `<span class="tag ${c.porValidar ? 'warn' : 'bad'}">${esc(c.campo)} <b>${f1(c.nota)}</b>${
  c.porValidar ? ' <i>por validar</i>' : ''}${c.provisional ? ' <i>prov.</i>' : ''}</span>`).join('')}</div></div>
        ${f.sinRegistro.length ? `<div class="linea"><span class="et">No registra nota</span>
          <div class="chips">${chipsSinRegistro(f.sinRegistro, p.totalAsigs)}</div></div>` : ''}
        <div class="linea"><span class="et">Asignaturas que pierde</span>
          <div class="chips">${f.asigsPerdidas.map(a => `<span class="tag">${esc(a.asignatura)} <b>${f1(a.nota)}</b></span>`).join('') || '<span class="mut">ninguna: el área cae por el promedio ponderado, no por una asignatura suelta</span>'}</div></div>`
      : `${f.sinRegistro.length ? `<div class="linea"><span class="et">No registra nota</span>
          <div class="chips">${chipsSinRegistro(f.sinRegistro, p.totalAsigs)}</div></div>` : ''}
        <div class="linea ok">Aprueba las ${f.campos.length} áreas${f.asigsPerdidas.length ? ` · pero pierde ${f.asigsPerdidas.length} asignatura${f.asigsPerdidas.length > 1 ? 's' : ''}: ${f.asigsPerdidas.map(a => esc(a.asignatura) + ' (' + f1(a.nota) + ')').join(', ')}` : ''}</div>`}
    </article>`).join('') : `<p class="mut">Ningún estudiante coincide con el filtro.</p>`;

  $('#contadorEst').textContent = `${filas.length} de ${p.filas.length} estudiantes`;

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
  $('#revision').innerHTML = items.length
    ? items.map(([t, c]) => `<div class="rev"><div class="revTit">${esc(t)}</div><div>${c}</div></div>`).join('')
    : '<p class="mut">Sin observaciones: no se detectaron hojas vacías, columnas repetidas ni pesos inconsistentes.</p>';
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
  if (!dl) return copiar(contenido, 'No se pudo abrir la descarga; el contenido quedó copiado al portapapeles.');
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
  $('#btnOtro').onclick = () => input.click();
  input.onchange = () => input.files[0] && cargar(input.files[0]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) cargar(f); });

  $('#umbral').oninput = e => { const v = parseFloat(e.target.value); if (isFinite(v)) { OPTS.umbral = v; recalcular(); } };
  $('#sinRegistroCuenta').onchange = e => { OPTS.sinRegistroCuenta = !e.target.checked; recalcular(); };
  $('#soloPierden').onchange = e => { soloPierden = e.target.checked; pintarEstudiantes(); };
  $('#soloSinRegistro').onchange = e => { soloSinRegistro = e.target.checked; pintarEstudiantes(); };
  $('#buscar').oninput = e => { busqueda = e.target.value.trim(); pintarEstudiantes(); };
  $('#toggleOpciones').onclick = () => {
    const d = $('#panelOpciones');
    d.hidden = !d.hidden;
    $('#toggleOpciones').setAttribute('aria-expanded', String(!d.hidden));
    $('#toggleOpciones').textContent = d.hidden ? 'Opciones avanzadas' : 'Ocultar opciones';
  };
  $('#btnImprimir').onclick = () => {
    try { window.print(); }
    catch { aviso('Tu navegador bloqueó la impresión acá. Descargá la lista en «Descargar e imprimir» y abrila en Excel.'); }
  };

  $$('.tabbar button').forEach(b => b.onclick = () => {
    $$('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
    $$('.panel').forEach(p => { p.hidden = p.id !== 'panel-' + b.dataset.tab; });
  });
  $$('[data-export]').forEach(b => b.onclick = () => descargar(b.dataset.export));
}

document.addEventListener('DOMContentLoaded', init);
