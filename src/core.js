/* ============================================================================
   Motor de análisis de consolidados de notas.
   Sin dependencias: descomprime el .xlsx con DecompressionStream, parsea el XML
   con expresiones regulares y calcula áreas, pérdidas y controles de calidad.
   ==========================================================================*/

/* ---------- ZIP ---------- */

async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  // End of central directory
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no parece un .xlsx válido (no se encontró el índice del ZIP).');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
    // cabecera local: los tamaños de nombre/extra pueden diferir de los del índice
    const lnLen = dv.getUint16(lho + 26, true), leLen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnLen + leLen;
    files[name] = { method, bytes: u8.subarray(start, start + csize) };
    off += 46 + nameLen + extraLen + cmtLen;
  }
  const out = {};
  for (const [name, f] of Object.entries(files)) {
    if (!/\.(xml|rels)$/i.test(name)) continue;
    if (f.method === 0) { out[name] = new TextDecoder().decode(f.bytes); continue; }
    if (f.method !== 8) continue;
    if (typeof DecompressionStream !== 'function')
      throw new Error('Este navegador no puede descomprimir el archivo. Usá Chrome, Edge o Safari actualizados.');
    const stream = new Blob([f.bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    out[name] = new TextDecoder().decode(await new Response(stream).arrayBuffer());
  }
  return out;
}

/* ---------- XML ---------- */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function dec(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10)) : ENT[e]);
}
function colToIdx(ref) {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function sharedStrings(xml) {
  if (!xml) return [];
  return (xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map(si => {
    const noPh = si.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
    return (noPh.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [])
      .map(t => dec(t.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, ''))).join('');
  });
}

/** Devuelve la hoja como matriz de celdas (string | number | null). */
function sheetGrid(xml, sst) {
  const grid = [];
  const rows = xml.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) || [];
  for (const row of rows) {
    const rn = +(/\br="(\d+)"/.exec(row) || [0, 0])[1];
    const cells = [];
    const re = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = re.exec(row))) {
      const attrs = m[1], body = m[2] || '';
      const ref = (/\br="([A-Z]+)\d+"/.exec(attrs) || [])[1];
      if (!ref) continue;
      const type = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || 'n';
      let val = null;
      if (type === 'inlineStr') {
        val = (body.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [])
          .map(t => dec(t.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, ''))).join('') || null;
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        if (v) {
          const raw = dec(v[1]);
          if (type === 's') val = sst[+raw] ?? null;
          else if (type === 'str' || type === 'e') val = raw;
          else if (type === 'b') val = raw === '1' ? 1 : 0;
          else val = raw === '' ? null : Number(raw);
        }
      }
      cells[colToIdx(ref)] = val === '' ? null : val;
    }
    grid[rn - 1] = cells;
  }
  return grid;
}

async function readWorkbook(buf) {
  const z = await unzip(buf);
  const sst = sharedStrings(z['xl/sharedStrings.xml']);
  const rels = {};
  for (const m of (z['xl/_rels/workbook.xml.rels'] || '').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (/Id="([^"]+)"/.exec(m[0]) || [])[1];
    let tgt = (/Target="([^"]+)"/.exec(m[0]) || [])[1];
    if (id && tgt) rels[id] = 'xl/' + tgt.replace(/^\.?\//, '').replace(/^xl\//, '');
  }
  const sheets = [];
  for (const m of (z['xl/workbook.xml'] || '').matchAll(/<sheet\b[^>]*>/g)) {
    const name = dec((/name="([^"]*)"/.exec(m[0]) || [])[1] || '');
    const rid = (/r:id="([^"]+)"/.exec(m[0]) || [])[1];
    const path = rels[rid];
    if (path && z[path]) sheets.push({ name, grid: sheetGrid(z[path], sst) });
  }
  if (!sheets.length) throw new Error('No se encontraron hojas con datos en el archivo.');
  return sheets;
}

/* ---------- estructura de la hoja ---------- */

const norm = s => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
const isNum = v => typeof v === 'number' && isFinite(v);

/** Pesos oficiales del campo de ciencias (la data cruda llega intercambiada). */
const REGLAS_PESO = [
  { campo: /ciencia/, asignatura: /^ciencias/, peso: 0.50 },
  { campo: /ciencia/, asignatura: /(prefisica|prequimica|pre fisica|pre quimica)/, peso: 0.17 },
  { campo: /ciencia/, asignatura: /tecnolog/, peso: 0.33 },
];

/**
 * Lee la estructura: fila de campos, fila de asignaturas, fila de pesos,
 * columnas de área y filas de estudiantes. No asume posiciones fijas.
 */
/** Ubica la fila de pesos: la primera fila donde todos los números son ≤1 y hay al menos un 1 exacto. */
function filaDePesos(grid) {
  for (let r = 0; r < Math.min(8, grid.length); r++) {
    const nums = (grid[r] || []).filter(isNum);
    if (nums.length >= 4 && nums.every(v => v > 0 && v <= 1) && nums.some(v => Math.abs(v - 1) < 1e-9)) return r;
  }
  return 2;
}

function estructura(grid) {
  const filaPeso = filaDePesos(grid), filaAsig = filaPeso - 1, filaCampo = Math.max(0, filaPeso - 2);
  if (filaAsig < 0) return { campos: [], asigs: [], estudiantes: [], colNombre: 1 };
  const campos = [], asigs = [];
  let campoActual = '';
  const ancho = Math.max(...grid.slice(0, 4).map(r => (r ? r.length : 0)), 0);

  for (let c = 0; c < ancho; c++) {
    const h1 = clean(grid[filaCampo]?.[c]);
    const h2 = clean(grid[filaAsig]?.[c]);
    const peso = grid[filaPeso]?.[c];
    if (h1 && !/notal? del area/i.test(norm(h1)) && !/^n.?$/i.test(h1) && !/nombre/i.test(h1) && !/areas perdidas/i.test(norm(h1)))
      campoActual = h1;
    const esArea = /notal? del area/.test(norm(h1)) || (!h2 && isNum(peso) && Math.abs(peso - 1) < 1e-9 && campoActual);
    if (esArea && campoActual) {
      campos.push({ nombre: campoActual, col: c, asigs: [] });
    } else if (h2 && isNum(peso) && campoActual) {
      asigs.push({ nombre: h2, campo: campoActual, col: c, pesoOrig: peso });
    }
  }
  for (const a of asigs) {
    const campo = campos.find(k => k.nombre === a.campo && k.col > a.col);
    if (campo) campo.asigs.push(a);
  }
  const conAsigs = campos.filter(k => k.asigs.length);

  // estudiantes: filas con nombre en la columna de "NOMBRE DE ESTUDIANTE"
  let colNombre = 1;
  for (let c = 0; c < ancho; c++) if (/nombre/.test(norm(grid[filaCampo]?.[c]))) { colNombre = c; break; }
  const estudiantes = [];
  for (let r = filaPeso + 1; r < grid.length; r++) {
    const nom = clean(grid[r]?.[colNombre]);
    if (!nom) continue;
    if (/reprueban|no aprobacion|promedio|total/.test(norm(nom))) break;
    estudiantes.push({ nombre: nom, fila: r });
  }
  return { campos: conAsigs, asigs, estudiantes, colNombre };
}

/** Aplica las reglas de peso oficiales y reporta qué cambió. */
function pesosCorregidos(asigs) {
  const cambios = [];
  const pesos = {};
  for (const a of asigs) {
    const regla = REGLAS_PESO.find(r => r.campo.test(norm(a.campo)) && r.asignatura.test(norm(a.nombre)));
    const nuevo = regla ? regla.peso : a.pesoOrig;
    pesos[a.col] = nuevo;
    if (regla && Math.abs(nuevo - a.pesoOrig) > 1e-9)
      cambios.push({ campo: a.campo, asignatura: a.nombre, de: a.pesoOrig, a: nuevo });
  }
  return { pesos, cambios };
}

/* ---------- análisis ---------- */

/**
 * @param {Array} sheets  hojas del libro
 * @param {Object} opts   {umbral, ceroSinNota, pesos: {clave->peso}}
 */
function analizar(sheets, opts = {}) {
  const umbral = opts.umbral ?? 60;
  // Una nota en 0 dentro de una columna que sí tiene notas se llama "no registra nota":
  // cuenta como pérdida (por defecto) pero queda marcada para validar con el docente.
  const contarSinRegistro = opts.sinRegistroCuenta !== false;
  const periodos = [], vacias = [];
  let estructuraRef = null, cambiosPeso = [], pesosPorClave = null;

  for (const sh of sheets) {
    const est = estructura(sh.grid);
    if (!est.campos.length || !est.estudiantes.length) { vacias.push({ hoja: sh.name, motivo: 'sin estructura reconocible' }); continue; }
    // Una asignatura está "pendiente de digitar" si NINGÚN estudiante tiene nota distinta de 0.
    // Un 0 suelto dentro de una columna con notas sí es una calificación real.
    const pendientes = new Set();
    for (const a of est.asigs) {
      const hayNota = est.estudiantes.some(e => { const v = sh.grid[e.fila]?.[a.col]; return isNum(v) && v !== 0; });
      if (!hayNota) pendientes.add(a.col);
    }
    if (pendientes.size === est.asigs.length) {
      vacias.push({ hoja: sh.name, motivo: 'ninguna asignatura tiene notas digitadas' });
      continue;
    }
    if (!estructuraRef) estructuraRef = est;
    periodos.push({ hoja: sh.name, grid: sh.grid, est, pendientes });
  }
  if (!periodos.length) throw new Error('Ninguna hoja del archivo tiene notas cargadas.');

  // pesos: los del usuario mandan; si no, las reglas oficiales sobre la primera hoja con datos
  const base = pesosCorregidos(periodos[0].est.asigs);
  cambiosPeso = base.cambios;
  pesosPorClave = {};
  for (const a of periodos[0].est.asigs) {
    const k = a.campo + '||' + a.nombre;
    pesosPorClave[k] = opts.pesos && k in opts.pesos ? opts.pesos[k] : base.pesos[a.col];
  }

  const salida = { periodos: [], estudiantes: [], asignaturas: [], campos: [], cambiosPeso, vacias, umbral, pesosPorClave, avisos: [] };
  const nombresEst = [];
  salida.campos = periodos[0].est.campos.map(k => ({ nombre: k.nombre, asigs: k.asigs.map(a => a.nombre) }));

  for (const p of periodos) {
    const { grid, est, pendientes } = p;
    const per = { hoja: p.hoja, filas: [], asig: [], campo: [], ceros: 0, duplicadas: [], sumaPesos: [],
                  pendientes: est.asigs.filter(a => pendientes.has(a.col)).map(a => ({ nombre: a.nombre, campo: a.campo })),
                  totalAsigs: est.asigs.length, digitadas: est.asigs.length - pendientes.size,
                  sinRegistro: 0 };

    // control: pesos que no suman 1 por campo
    for (const k of est.campos) {
      const s = k.asigs.reduce((t, a) => t + (pesosPorClave[a.campo + '||' + a.nombre] ?? a.pesoOrig), 0);
      if (Math.abs(s - 1) > 0.005) per.sumaPesos.push({ campo: k.nombre, suma: s });
    }
    // control: columnas de asignatura que traen la misma nota (copias de columna)
    const cols = est.asigs.map(a => ({ a, v: est.estudiantes.map(e => grid[e.fila]?.[a.col]) }));
    const total = est.estudiantes.length;
    const casiIgual = (A, B) => total > 3 && A.filter((v, n) => isNum(v) && v === B[n]).length >= total - 1;
    const usados = new Set();
    for (let i = 0; i < cols.length; i++) {
      if (usados.has(i)) continue;
      const grupo = [i];
      for (let j = i + 1; j < cols.length; j++)
        if (!usados.has(j) && casiIgual(cols[i].v, cols[j].v)) { grupo.push(j); usados.add(j); }
      if (grupo.length > 1) {
        usados.add(i);
        const iguales = Math.min(...grupo.slice(1).map(j => cols[i].v.filter((v, n) => isNum(v) && v === cols[j].v[n]).length));
        per.duplicadas.push({ asignaturas: grupo.map(j => cols[j].a.nombre), campos: [...new Set(grupo.map(j => cols[j].a.campo))], iguales, total });
      }
    }

    for (const e of est.estudiantes) {
      const fila = { nombre: e.nombre, campos: [], asigsPerdidas: [], camposPerdidos: [], sinRegistro: [] };
      for (const k of est.campos) {
        let acc = 0, pesoUtil = 0, pesoTotal = 0, accReg = 0, pesoReg = 0;
        const detalle = [];
        for (const a of k.asigs) {
          const w = pesosPorClave[a.campo + '||' + a.nombre] ?? a.pesoOrig;
          const v = grid[e.fila]?.[a.col];
          const nota = isNum(v) ? v : null;
          const pendiente = pendientes.has(a.col);
          const sinRegistro = !pendiente && nota === 0;
          const omitida = pendiente || nota === null || (sinRegistro && !contarSinRegistro);
          pesoTotal += w;
          if (sinRegistro) { per.ceros++; per.sinRegistro++; }
          if (!omitida) { acc += nota * w; pesoUtil += w; }
          if (!omitida && !sinRegistro) { accReg += nota * w; pesoReg += w; }
          const estado = pendiente ? 'pendiente' : nota === null ? 'sinCelda'
            : sinRegistro ? 'sinRegistro' : nota < umbral ? 'pierde' : 'aprueba';
          detalle.push({ asignatura: a.nombre, campo: k.nombre, nota, peso: w, omitida, pendiente, sinRegistro, estado,
                         pierde: estado === 'pierde' });
          if (estado === 'pierde') fila.asigsPerdidas.push({ asignatura: a.nombre, campo: k.nombre, nota });
          if (estado === 'sinRegistro') fila.sinRegistro.push({ asignatura: a.nombre, campo: k.nombre });
        }
        const area = pesoUtil > 0 ? acc / pesoUtil : null;
        const areaReg = pesoReg > 0 ? accReg / pesoReg : null;   // solo con lo efectivamente registrado
        const soporte = pesoTotal > 0 ? pesoUtil / pesoTotal : 0;
        const provisional = area !== null && soporte < 0.999;
        const pierde = area !== null && area < umbral;
        // ¿el área se cae solo por las notas sin registrar, o ya se cae con lo registrado?
        const porValidar = pierde && (areaReg === null || areaReg >= umbral);
        const areaArchivo = isNum(grid[e.fila]?.[k.col]) ? grid[e.fila][k.col] : null;
        fila.campos.push({ campo: k.nombre, area, areaReg, areaArchivo, detalle, soporte, provisional,
                           sinDatos: area === null, pierde, porValidar });
        if (pierde) fila.camposPerdidos.push({ campo: k.nombre, nota: area, provisional, porValidar, notaReg: areaReg });
      }
      const areas = fila.campos.map(c => c.area).filter(v => v !== null);
      fila.promedio = areas.length ? areas.reduce((s, v) => s + v, 0) / areas.length : null;
      per.filas.push(fila);
    }

    const n = per.filas.length;
    per.promedio = prom(per.filas.map(f => f.promedio));
    per.pctAreas = pct(per.filas.flatMap(f => f.campos.map(c => c.pierde)));
    per.sinPerder = per.filas.filter(f => f.camposPerdidos.length === 0).length;
    per.conSinRegistro = per.filas.filter(f => f.sinRegistro.length).length;
    per.areasPorValidar = per.filas.reduce((s, f) => s + f.camposPerdidos.filter(c => c.porValidar).length, 0);
    per.tresOMas = per.filas.filter(f => f.camposPerdidos.length >= 3).length;
    per.total = n;
    per.campo = est.campos.map(k => {
      const vals = per.filas.map(f => f.campos.find(c => c.campo === k.nombre)).filter(Boolean);
      return { nombre: k.nombre, promedio: prom(vals.map(v => v.area)), pct: pct(vals.map(v => v.pierde)) };
    });
    per.asig = est.asigs.map(a => {
      const vals = per.filas.flatMap(f => f.campos.flatMap(c => c.detalle.filter(d => d.asignatura === a.nombre && d.campo === a.campo)));
      return {
        nombre: a.nombre, campo: a.campo, pendiente: pendientes.has(a.col),
        peso: pesosPorClave[a.campo + '||' + a.nombre] ?? a.pesoOrig,
        promedio: prom(vals.filter(v => !v.omitida).map(v => v.nota)),
        pct: pct(vals.filter(v => !v.omitida).map(v => v.pierde)),
        pierden: vals.filter(v => v.pierde).length, ceros: vals.filter(v => v.nota === 0).length,
      };
    });
    salida.periodos.push(per);
  }

  // consolidado por estudiante: unión de nombres de todos los periodos, en orden de aparición
  for (const p of salida.periodos) for (const f of p.filas) if (!nombresEst.includes(f.nombre)) nombresEst.push(f.nombre);
  salida.estudiantes = nombresEst.map(nom => {
    const porPeriodo = salida.periodos.map(p => p.filas.find(f => f.nombre === nom) || null);
    const proms = porPeriodo.map(f => (f ? f.promedio : null));
    const validos = proms.filter(v => v !== null);
    const primero = validos[0] ?? null, ultimo = validos[validos.length - 1] ?? null;
    return {
      nombre: nom, porPeriodo, promedios: proms,
      global: validos.length ? validos.reduce((s, v) => s + v, 0) / validos.length : null,
      delta: primero !== null && ultimo !== null ? ultimo - primero : null,
      perdidasPorPeriodo: porPeriodo.map(f => (f ? f.camposPerdidos.length : null)),
      totalAsigsPerdidas: porPeriodo.reduce((s, f) => s + (f ? f.asigsPerdidas.length : 0), 0),
    };
  }).sort((a, b) => (b.global ?? -1) - (a.global ?? -1));

  return salida;
}

const prom = arr => { const v = arr.filter(x => x !== null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const pct = arr => (arr.length ? (arr.filter(Boolean).length / arr.length) * 100 : 0);

/* ---------- exportación ---------- */

const csvCell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = rows => '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
const n1 = v => (v === null || v === undefined ? '' : v.toFixed(1).replace('.', ','));

function csvPerdidas(res) {
  const rows = [['Estudiante', 'Periodo', 'Estado del periodo', 'Promedio del periodo', 'Áreas perdidas',
    'Cuáles áreas', 'De esas, por validar', 'Asignaturas perdidas', 'Cuáles asignaturas (nota)',
    'Asignaturas sin nota registrada', 'Áreas sin datos']];
  for (const p of res.periodos) {
    const estado = p.pendientes.length ? `en digitación (${p.digitadas} de ${p.totalAsigs} asignaturas)` : 'completo';
    for (const f of p.filas) {
      const sinDatos = f.campos.filter(c => c.sinDatos).map(c => c.campo);
      rows.push([f.nombre, p.hoja, estado, n1(f.promedio), f.camposPerdidos.length,
        f.camposPerdidos.map(c => `${c.campo} (${n1(c.nota)}${c.porValidar ? ', POR VALIDAR' : ''}${c.provisional ? ', provisional' : ''})`).join(' · '),
        f.camposPerdidos.filter(c => c.porValidar).map(c => c.campo).join(' · '),
        f.asigsPerdidas.length, f.asigsPerdidas.map(a => `${a.asignatura} (${n1(a.nota)})`).join(' · '),
        f.sinRegistro.map(a => a.asignatura).join(' · '),
        sinDatos.join(' · ')]);
    }
  }
  return csv(rows);
}
function csvDetalle(res) {
  const rows = [['Estudiante', 'Periodo', 'Campo', 'Asignatura', 'Nota', 'Peso aplicado', 'Estado', 'Nota del área (recalculada)']];
  for (const p of res.periodos) for (const f of p.filas) for (const c of f.campos) for (const d of c.detalle) {
    rows.push([f.nombre, p.hoja, c.campo, d.asignatura, d.nota === null ? '' : n1(d.nota),
      String(d.peso).replace('.', ','), d.omitida ? 'sin nota' : (d.pierde ? 'PIERDE' : 'aprueba'), n1(c.area)]);
  }
  return csv(rows);
}
function csvResumen(res) {
  const rows = [['Nivel', 'Nombre', 'Campo', ...res.periodos.flatMap(p => [`${p.hoja} · promedio`, `${p.hoja} · % pierde`])]];
  for (const k of res.campos)
    rows.push(['Área', k.nombre, '', ...res.periodos.flatMap(p => { const x = p.campo.find(c => c.nombre === k.nombre); return [n1(x?.promedio ?? null), n1(x?.pct ?? null)]; })]);
  for (const k of res.campos) for (const a of k.asigs)
    rows.push(['Asignatura', a, k.nombre, ...res.periodos.flatMap(p => { const x = p.asig.find(s => s.nombre === a && s.campo === k.nombre); return [n1(x?.promedio ?? null), n1(x?.pct ?? null)]; })]);
  return csv(rows);
}
function csvConsolidado(res) {
  const rows = [['#', 'Estudiante', ...res.periodos.flatMap(p => [`${p.hoja} · promedio`, `${p.hoja} · áreas perdidas`]), 'Promedio global', 'Variación primer→último']];
  res.estudiantes.forEach((e, i) => rows.push([i + 1, e.nombre,
    ...e.porPeriodo.flatMap((f, j) => [n1(e.promedios[j]), f ? f.camposPerdidos.length : '']),
    n1(e.global), n1(e.delta)]));
  return csv(rows);
}

if (typeof module !== 'undefined') module.exports = { readWorkbook, analizar, estructura, csvPerdidas, csvDetalle, csvResumen, csvConsolidado, pesosCorregidos };
