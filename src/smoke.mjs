import { readFileSync } from 'fs';
const html = readFileSync('app.html','utf8');
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
globalThis.window = { claude: undefined };
Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});

globalThis.Blob = (await import('buffer')).Blob;

const scope = new Function(js + '\n; return {init, cargar, descargar, get RES(){return RES}, pintarEstudiantes, pintarPesos};')();
scope.init();
doc._ready && doc._ready();

// panel de paneles: verificar que cada data-tab tenga su panel
for (const m of html.matchAll(/data-tab="([^"]+)"/g))
  if (!ids.has('panel-'+m[1])) throw new Error('Falta el panel: panel-'+m[1]);

const buf = readFileSync('/Users/sebastianpedraza/Analisis-notas/Consolidado por periodo  602.xlsx');
const file = { name:'Consolidado por periodo  602.xlsx', arrayBuffer: async()=>buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength) };
await scope.cargar(file);

const msg = store.get('msg');
if (msg && msg.className.includes('err')) throw new Error('La app reportó error: '+msg.textContent);
console.log('subtitulo:', store.get('subtitulo').textContent);
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
