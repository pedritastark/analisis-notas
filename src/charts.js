/* ============================================================================
   Gráficos sin librerías: SVG y tablas HTML. Cada función recibe un contenedor
   y datos ya calculados por analizar(). Los colores salen de variables CSS, así
   que respetan el modo claro y el oscuro. Los eventos se enganchan al contenedor
   y solo tocan el DOM cuando ocurren (la prueba de humo no los dispara).
   ==========================================================================*/

const anchoDe = el => Math.max(320, Math.round((el && el.clientWidth) || 760));
const coma = v => String(v).replace('.', ',');
const recortar = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);
/** «CAMPO CIENCIA Y TECNOLOGÍA» → «Ciencia y Tecnología»: sin el prefijo y sin gritar en mayúsculas. */
const MENORES = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'los', 'el', 'en', 'para']);
const tipoTitulo = s => (s === s.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(s)
  ? s.toLowerCase().split(' ').map((w, i) => (i && MENORES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
  : s);
const nombreCorto = s => tipoTitulo(String(s).replace(/^(campo|área|area)\s+(de\s+|del\s+)?/i, ''));

/* ---------- tooltip compartido ---------- */

function tipMostrar(html, x, y) {
  const t = $('#tip');
  t.innerHTML = html;
  t.hidden = false;
  const r = t.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = x + 14, top = y + 14;
  if (left + r.width > vw - 8) left = x - r.width - 14;
  if (top + r.height > vh - 8) top = y - r.height - 14;
  t.style.left = Math.max(8, left) + 'px';
  t.style.top = Math.max(8, top) + 'px';
}
function tipOcultar() { const t = $('#tip'); if (t) t.hidden = true; }

/* ---------- líneas: evolución de cada estudiante ---------- */

/**
 * @param {Object} o
 *   periodos: nombres de periodo (eje X)
 *   series:   [{nombre, valores:[nota|null por periodo], riesgo, sel}]
 *   umbral, periodoSel (índice resaltado), tip(k, j) → html, onSelect(k, j)
 */
function chartLineas(cont, o) {
  const { periodos, series, umbral, periodoSel } = o;
  const W = anchoDe(cont), angosto = W < 560;
  const H = Math.round(Math.min(400, Math.max(270, W * 0.46)));
  const m = { l: 38, r: angosto ? 16 : 150, t: 16, b: 34 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b, n = periodos.length;
  const vals = series.flatMap(s => s.valores).filter(v => v !== null);
  if (!vals.length) { cont.innerHTML = '<p class="mut">No hay notas para graficar.</p>'; return; }

  const lo = Math.max(0, Math.floor((Math.min(umbral, ...vals) - 5) / 10) * 10);
  const hi = Math.max(umbral + 10, Math.ceil(Math.max(...vals) / 10) * 10);
  const y = v => m.t + ph - ((v - lo) / (hi - lo)) * ph;
  const xBase = j => m.l + (n === 1 ? pw / 2 : (j * pw) / (n - 1));
  // con un solo periodo los puntos se reparten en franja para que no se tapen
  const x = (j, k) => xBase(j) + (n === 1 ? ((((k * 37) % 41) - 20) / 20) * Math.min(pw * 0.38, 160) : 0);

  let fondo = '';
  if (n > 1 && periodoSel != null) {
    const bw = Math.min(56, pw / (n - 1) / 2);
    fondo += `<rect class="perSel" x="${(xBase(periodoSel) - bw / 2).toFixed(1)}" y="${m.t}" width="${bw.toFixed(1)}" height="${ph}" rx="4"/>`;
  }
  for (let v = lo; v <= hi; v += 10)
    fondo += `<line class="grid" x1="${m.l}" x2="${m.l + pw}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
             `<text class="ax" x="${m.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`;
  periodos.forEach((p, j) => {
    const anchor = n > 1 && j === 0 ? 'start' : n > 1 && j === n - 1 ? 'end' : 'middle';
    fondo += `<text class="ax${j === periodoSel ? ' axSel' : ''}" x="${xBase(j).toFixed(1)}" y="${H - 10}" text-anchor="${anchor}">${esc(recortar(p, 18))}</text>`;
  });
  fondo += `<line class="umbral" x1="${m.l}" x2="${m.l + pw}" y1="${y(umbral).toFixed(1)}" y2="${y(umbral).toFixed(1)}"/>` +
           `<text class="ax umbralT" x="${m.l + 6}" y="${(y(umbral) - 6).toFixed(1)}">mínimo ${coma(umbral)}</text>`;

  const rango = s => (s.sel ? 2 : s.riesgo ? 1 : 0);
  const orden = series.map((s, k) => k).sort((a, b) => rango(series[a]) - rango(series[b]));
  const pts = [];
  let lineas = '', puntos = '', etiquetas = '';
  for (const k of orden) {
    const s = series[k], cls = s.sel ? 'sel' : s.riesgo ? 'risk' : 'ok';
    let d = '', pen = false, ultimo = null;
    s.valores.forEach((v, j) => {
      if (v === null) { pen = false; return; }
      const px = x(j, k), py = y(v);
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
      pen = true;
      ultimo = { px, py };
      pts.push({ px, py, k, j });
      puntos += `<circle class="pt ${cls}" data-k="${k}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${s.sel ? 5.5 : 4}"/>`;
    });
    if (n > 1) lineas += `<path class="ln ${cls}" data-k="${k}" d="${d}"/>`;
    if (s.sel && ultimo && !angosto)
      etiquetas += `<text class="lblSel" x="${(ultimo.px + 10).toFixed(1)}" y="${(ultimo.py + 4).toFixed(1)}">${esc(recortar(s.nombre, 22))}</text>`;
  }

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Nota de cada estudiante por periodo; la línea punteada marca el mínimo para aprobar">
    ${fondo}${lineas}${puntos}${etiquetas}</svg>`;

  const cercano = e => {
    const svg = cont.firstElementChild;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) * W) / r.width, sy = ((e.clientY - r.top) * H) / r.height;
    let best = null, bd = Infinity;
    for (const p of pts) {
      const dd = (p.px - sx) ** 2 + (p.py - sy) ** 2;
      if (dd < bd) { bd = dd; best = p; }
    }
    return best && bd < 36 * 36 ? best : null;
  };
  const limpiar = () => {
    cont.classList.remove('hovering');
    cont.querySelectorAll('.hov').forEach(el => el.classList.remove('hov'));
    tipOcultar();
  };
  cont.onpointermove = e => {
    const p = cercano(e);
    if (!p) { limpiar(); return; }
    cont.querySelectorAll('.hov').forEach(el => el.classList.remove('hov'));
    cont.classList.add('hovering');
    cont.querySelectorAll(`[data-k="${p.k}"]`).forEach(el => el.classList.add('hov'));
    tipMostrar(o.tip(p.k, p.j), e.clientX, e.clientY);
  };
  cont.onpointerleave = limpiar;
  cont.onclick = e => { const p = cercano(e); if (p) { limpiar(); o.onSelect(p.k, p.j); } };
}

/* ---------- barras: % que pierde cada asignatura ---------- */

/**
 * grupos: [{campo, items:[{nombre, pct, pierden, pendiente}]}]
 * tip(i) → html, onPick(i); i es el índice plano del item.
 */
function chartBarras(cont, o) {
  const W = anchoDe(cont);
  // en pantallas angostas el nombre va arriba y la barra ocupa todo el ancho debajo
  const apilado = W < 520;
  const lab = apilado ? 0 : Math.round(Math.min(280, W * 0.38)), valW = apilado ? 64 : 74;
  const bw = Math.max(60, W - lab - valW - 12);
  const RH = apilado ? 46 : 28, GH = 32, chars = apilado ? 60 : Math.floor(lab / 7.2);
  const yBar = apilado ? 24 : 8, yTxt = apilado ? 34 : 18;
  let yy = 0, i = 0, body = '';
  for (const gr of o.grupos) {
    body += `<text class="grpT" x="0" y="${yy + 21}">${esc(nombreCorto(gr.campo).toUpperCase())}</text>`;
    yy += GH;
    for (const it of gr.items) {
      const lbl = apilado
        ? `<text class="blbl" x="0" y="${yy + 16}">${esc(recortar(it.nombre, chars))}</text>`
        : `<text class="blbl" x="${lab - 10}" y="${yy + 18}" text-anchor="end">${esc(recortar(it.nombre, chars))}</text>`;
      if (it.pendiente) {
        body += `<g>${lbl}<text class="ax" x="${lab}" y="${yy + yTxt}">sin digitar</text></g>`;
      } else {
        const w = it.pct > 0 ? Math.max(4, (it.pct / 100) * bw) : 0;
        body += `<g class="bar" data-i="${i}" tabindex="0" role="button"
          aria-label="${esc(it.nombre)}: ${f1(it.pct)} % pierde, ${it.pierden} estudiantes. Enter para ver quiénes.">
          <rect class="hit" x="0" y="${yy + 1}" width="${W}" height="${RH - 2}" rx="3"/>${lbl}
          <rect class="track" x="${lab}" y="${yy + yBar}" width="${bw}" height="12" rx="4"/>
          ${w ? `<rect class="fill" x="${lab}" y="${yy + yBar}" width="${w.toFixed(1)}" height="12" rx="4"/>` : ''}
          <text class="val" x="${(lab + w + 8).toFixed(1)}" y="${yy + yTxt}">${f1(it.pct)} %</text></g>`;
      }
      yy += RH;
      i++;
    }
  }
  cont.innerHTML = `<svg viewBox="0 0 ${W} ${yy + 6}" role="list" aria-label="Porcentaje de estudiantes que pierde cada asignatura">${body}</svg>`;

  const barDe = e => e.target && e.target.closest ? e.target.closest('.bar') : null;
  cont.onpointermove = e => { const b = barDe(e); if (b) tipMostrar(o.tip(+b.dataset.i), e.clientX, e.clientY); else tipOcultar(); };
  cont.onpointerleave = tipOcultar;
  cont.onclick = e => { const b = barDe(e); if (b) { tipOcultar(); o.onPick(+b.dataset.i); } };
  cont.onkeydown = e => { const b = barDe(e); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); o.onPick(+b.dataset.i); } };
}

/* ---------- mapa de calor: estudiantes × áreas ---------- */

/** Intensidad según cuánto le falta a la nota para llegar al mínimo (una sola tinta, claro → intenso). */
const claseDeficit = (v, u) => (v === null ? 'r0 na' : v >= u ? 'r0' : u - v < 5 ? 'r1' : u - v < 10 ? 'r2' : u - v < 20 ? 'r3' : 'r4');

/**
 * areas: nombres de columna; filas: [{nombre, promedio, perdidas, celdas:[{v, porValidar, provisional}]}]
 * sel: nombre resaltado; tip(i, c) → html; onPick(i)
 */
function chartCalor(cont, o) {
  const { areas, filas, umbral } = o;
  cont.innerHTML = `<table class="calor">
    <caption>Nota de cada área en el periodo. Solo se colorean las notas bajo ${coma(umbral)}: cuanto más intenso, más lejos del mínimo.</caption>
    <thead><tr><th class="lbl">Estudiante</th>${areas.map(a => `<th title="${esc(a)}">${esc(recortar(nombreCorto(a), 16))}</th>`).join('')}
      <th>Prom.</th><th>Áreas<br>perdidas</th></tr></thead>
    <tbody>${filas.map((f, i) => `<tr class="hrow${f.nombre === o.sel ? ' sel' : ''}" data-n="${i}" tabindex="0">
      <th scope="row">${esc(f.nombre)}</th>
      ${f.celdas.map((c, j) => `<td class="num heat ${claseDeficit(c.v, umbral)}${c.porValidar ? ' pv' : ''}" data-c="${j}">${f1(c.v)}${c.provisional ? '*' : ''}</td>`).join('')}
      <td class="num ${claseNota(f.promedio, umbral)}">${f1(f.promedio)}</td>
      <td class="num ${f.perdidas ? 'neg' : 'mut'}">${f.perdidas}</td></tr>`).join('')}</tbody></table>`;

  const celda = e => (e.target && e.target.closest ? e.target.closest('td[data-c]') : null);
  const fila = e => (e.target && e.target.closest ? e.target.closest('tr[data-n]') : null);
  cont.onpointermove = e => {
    const c = celda(e), r = fila(e);
    if (c && r) tipMostrar(o.tip(+r.dataset.n, +c.dataset.c), e.clientX, e.clientY); else tipOcultar();
  };
  cont.onpointerleave = tipOcultar;
  cont.onclick = e => { const r = fila(e); if (r) { tipOcultar(); o.onPick(+r.dataset.n); } };
  cont.onkeydown = e => { const r = fila(e); if (r && e.key === 'Enter') o.onPick(+r.dataset.n); };
}

/* ---------- composición de cada área ---------- */

/** Barra apilada con el peso de cada asignatura y su lista con porcentajes. */
function htmlComposicion(campos, pesosPorClave, cambios) {
  return campos.map(k => {
    const items = k.asigs.map((a, i) => {
      const peso = pesosPorClave[k.nombre + '||' + a] ?? 0;
      const cambio = cambios.find(c => c.campo === k.nombre && c.asignatura === a);
      return { a, peso, cambio, color: `var(--s${(i % 8) + 1})` };
    });
    const suma = items.reduce((s, x) => s + x.peso, 0);
    const pc = v => Math.round(v * 100) + ' %';
    return `<div class="comp">
      <div class="compCab"><b>${esc(nombreCorto(k.nombre))}</b>
        <span class="${Math.abs(suma - 1) < 0.005 ? 'mut' : 'neg'}">${items.length} asignatura${items.length > 1 ? 's' : ''} · suma ${pc(suma)}</span></div>
      <div class="stack" role="img" aria-label="${esc(items.map(x => x.a + ' ' + pc(x.peso)).join(', '))}">
        ${items.map(x => `<span style="flex:${Math.max(x.peso, 0.001)};background:${x.color}" title="${esc(x.a)} · ${pc(x.peso)}"></span>`).join('')}
      </div>
      ${items.map(x => `<div class="compFila${x.cambio ? ' fix' : ''}"><i class="sw" style="background:${x.color}"></i>
        <span>${esc(x.a)}</span><span class="pc">${pc(x.peso)}</span>
        ${x.cambio ? `<span class="antes">corregido: el archivo traía ${pc(x.cambio.de)}</span>` : ''}</div>`).join('')}
      ${Math.abs(suma - 1) >= 0.005 ? `<p class="neg" style="font-size:.8rem;margin:.4em 0 0">Los pesos no suman 100 %: se aplican en proporción entre sí, revisá que sea lo que querés.</p>` : ''}
    </div>`;
  }).join('');
}
