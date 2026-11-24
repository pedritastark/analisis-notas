// Uso: node src/smoke.mjs [ruta/al/consolidado.xlsx]   (antes: python3 src/build.py)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(AQUI, '../index.html'),'utf8');
const XLSX = process.argv[2] || process.env.CONSOLIDADO || resolve(AQUI, '../../Consolidado por periodo  602.xlsx');
const js = html.split('<script>')[1].split('</script>')[0];

// ids y clases que existen en el marcado
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const mk = name => ({ _n:name, innerHTML:'', textContent:'', hidden:false, className:'', value:'',
  files:[], classList:{add(){},remove(){},toggle(){}}, setAttribute(){}, addEventListener(){},
  closest(){return null}, click(){}, dataset:{} });
const store = new Map();
const get = sel => {
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    if (!ids.has(id)) throw new Error('SELECTOR INEXISTENTE EN EL HTML: '+sel);
    if (!store.has(id)) store.set(id, mk(id));
    return store.get(id);
  }
  return mk(sel);
};
const doc = {
  querySelector: get,
  querySelectorAll: sel => {
    if (sel === '.tabbar button') return [...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>{const e=mk(m[1]);e.dataset={tab:m[1]};return e;});
    if (sel === '.panel') return [...html.matchAll(/class="panel" id="([^"]+)"/g)].map(m=>mk(m[1]));
    if (sel === '[data-export]') return [...html.matchAll(/data-export="([^"]+)"/g)].map(m=>{const e=mk(m[1]);e.dataset={export:m[1]};return e;});
    return [];
  },
  addEventListener: (ev,fn)=>{ if(ev==='DOMContentLoaded') doc._ready=fn; },
};
globalThis.document = doc;
globalThis.window = { claude: undefined, addEventListener(){}, innerWidth: 1200, innerHeight: 800 };
Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});

globalThis.Blob = (await import('buffer')).Blob;

const scope = new Function(js + '\n; return {init, cargar, descargar, archivoEjemplo, get RES(){return RES}, get ARCHIVO(){return ARCHIVO}, pintarEstudiantes, pintarPesos};')();
scope.init();
doc._ready && doc._ready();

// antes de cargar: espacios reservados en todo el tablero
console.log('vacío → saludo:', store.get('saludo').textContent, '| kpis reservados:', (store.get('kpis').innerHTML.match(/v ph/g)||[]).length,
  '| líneas fantasma:', /class="ghost"/.test(store.get('chLineas').innerHTML), '| fichas esqueleto:', (store.get('contEst').innerHTML.match(/<article/g)||[]).length);

// panel de paneles: verificar que cada data-tab tenga su panel
for (const m of html.matchAll(/data-tab="([^"]+)"/g))
  if (!ids.has('panel-'+m[1])) throw new Error('Falta el panel: panel-'+m[1]);

const buf = readFileSync(XLSX);
const file = { name: XLSX.split('/').pop(), size: buf.length, arrayBuffer: async()=>buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength) };
await scope.cargar(file);

const msg = store.get('msg');
if (msg && msg.className.includes('err')) throw new Error('La app reportó error: '+msg.textContent);
console.log('subtitulo:', store.get('subtitulo').textContent);
console.log('bienvenida:', store.get('bienvenida').innerHTML.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim());
console.log('zona de carga:', store.get('cargaTit').textContent, '|', store.get('cargaSub').textContent);
console.log('kpis renderizados:', (store.get('kpis').innerHTML.match(/class="kpi"/g)||[]).length);
console.log('filas tabla áreas:', (store.get('tablaAreas').innerHTML.match(/<tr>/g)||[]).length);
console.log('fichas estudiante:', (store.get('contEst').innerHTML.match(/<article/g)||[]).length, '|', store.get('contadorEst').textContent);
console.log('chips de periodo:', (store.get('tabsPeriodo').innerHTML.match(/class="chip/g)||[]).length);
console.log('bloques revisión:', (store.get('revision').innerHTML.match(/class="rev"/g)||[]).length);
console.log('aviso pesos visible:', !store.get('avisoPesos').hidden);
console.log('inputs de peso:', (store.get('pesos').innerHTML.match(/<input/g)||[]).length,
            '| resaltados:', (store.get('pesos').innerHTML.match(/class="peso fix"/g)||[]).length);
const ficha = store.get('contEst').innerHTML;
console.log('\nPrimera ficha:\n', ficha.slice(0, 900).replace(/\s+/g,' '));
console.log('\n¿HTML sin marcadores rotos?', !/undefined|NaN|\[object/.test(ficha));

// --- opciones e interacciones ---
const el = id => store.get(id);
console.log('\n== Cambiar umbral a 70 ==');
el('umbral').onchange, el('umbral').oninput({ target: { value: '70' } });
console.log('  ', el('kpis').innerHTML.match(/<div class="v[^"]*">([^<]+)</g).join(' '));
el('umbral').oninput({ target: { value: '60' } });

console.log('== No contar las notas sin registrar ==');
el('sinRegistroCuenta').onchange({ target: { checked: true } });
const p1 = scope.RES.periodos[0];
console.log('   P1 promedio:', p1.promedio.toFixed(2), '| % áreas perdidas:', p1.pctAreas.toFixed(1), '| sin perder:', p1.sinPerder+'/'+p1.total);
el('sinRegistroCuenta').onchange({ target: { checked: false } });
console.log('   vuelve a:', scope.RES.periodos[0].promedio.toFixed(2));

console.log('== Editar un peso a mano (Tecnología 0,33 → 0,20) ==');
el('pesos').oninput({ target: { closest: () => ({ value: '0.20', dataset: { clave: 'CAMPO CIENCIA Y TECNOLOGÍA||Tecnología' } }) } });
const cyt = scope.RES.periodos[1].campo.find(c=>/CIENCIA/.test(c.nombre));
console.log('   CyT en P2 ahora:', cyt.promedio.toFixed(2), '| suma de pesos del campo:',
  scope.RES.campos.find(k=>/CIENCIA/.test(k.nombre)).asigs.reduce((s,a)=>s+scope.RES.pesosPorClave['CAMPO CIENCIA Y TECNOLOGÍA||'+a],0).toFixed(2));
console.log('   revisión avisa suma≠1:', /suman/.test(el('revision').innerHTML));

console.log('\n== Filtros ==');
el('soloPierden').onchange({ target: { checked: true } });
console.log('   solo quienes pierden:', el('contadorEst').textContent);
el('buscar').oninput({ target: { value: 'lopez' } });
console.log('   + búsqueda "lopez":', el('contadorEst').textContent);

// --- gráficos y archivo ---
const roto = s => /undefined|NaN|\[object/.test(s);
console.log('\n== Gráficos ==');
el('buscar').oninput({ target: { value: '' } });
const lineas = el('chLineas').innerHTML, barras = el('chBarras').innerHTML, calor = el('chCalor').innerHTML;
console.log('   líneas: svg', /<svg/.test(lineas), '| trazos', (lineas.match(/class="ln /g)||[]).length,
            '| puntos', (lineas.match(/class="pt /g)||[]).length, '| en riesgo', (lineas.match(/class="ln risk"/g)||[]).length);
console.log('   barras de asignatura:', (barras.match(/class="bar"/g)||[]).length);
console.log('   filas del mapa de calor:', (calor.match(/class="hrow/g)||[]).length);
console.log('   opciones de nota:', (el('vizMetrica').innerHTML.match(/<option/g)||[]).length);
console.log('   ¿gráficos sin marcadores rotos?', !roto(lineas + barras + calor + el('leyLineas').innerHTML));
el('vizMetrica').onchange({ target: { value: scope.RES.campos[0].nombre } });
console.log('   métrica por área →', (el('chLineas').innerHTML.match(/class="ln risk"/g)||[]).length, 'en riesgo');
el('vizMetrica').onchange({ target: { value: 'promedio' } });

console.log('== Archivo y ponderación ==');
const comp = el('composicion').innerHTML, prev = el('vistaPrevia').innerHTML;
console.log('   bloques de área:', (comp.match(/class="comp"/g)||[]).length, '| asignaturas corregidas:', (comp.match(/compFila fix/g)||[]).length);
console.log('   vista previa: filas', (prev.match(/<tr/g)||[]).length, '| fila de pesos marcada', /class="fPeso"/.test(prev));
console.log('   hojas:', (el('hojasPrev').innerHTML.match(/data-h=/g)||[]).length, '| info:', !roto(el('infoArchivo').innerHTML));
console.log('   ¿sin marcadores rotos?', !roto(comp + prev));

// --- guía y consolidado de ejemplo (ficticio, incrustado en index.html) ---
console.log('\n== Guía y ejemplo ==');
console.log('   pregunta de la guía visible al entrar:', store.get('guiaModal').hidden === false);
await scope.cargar(scope.archivoEjemplo());
const R = scope.RES;
const nAsig = R.campos.reduce((s, k) => s + k.asigs.length, 0);
console.log('   ejemplo cargado:', scope.ARCHIVO, '| estudiantes', R.estudiantes.length, '| asignaturas', nAsig,
            '| periodos', R.periodos.map(p => p.hoja + ' ' + p.digitadas + '/' + p.totalAsigs).join(', '), '| descartadas', R.vacias.length);
if (nAsig !== 18 || R.estudiantes.length !== 30) throw new Error('El ejemplo no se leyó completo (¿celdas vacías <c .../> mal parseadas?)');
