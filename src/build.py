"""Arma index.html (raíz del repo) a partir de app_template.html + core.js + charts.js + ui.js + guia.js + ejemplo.b64.

Se puede ejecutar desde cualquier carpeta:  python3 src/build.py
"""
import re
from pathlib import Path

SRC = Path(__file__).resolve().parent
SALIDA = SRC.parent / 'index.html'

leer = lambda nombre: (SRC / nombre).read_text(encoding='utf-8')

tpl = leer('app_template.html')
# core.js exporta para Node; en el navegador esa línea sobra
core = re.sub(r"^if \(typeof module !== 'undefined'\) module\.exports = .*$", '', leer('core.js'), flags=re.M)

# el consolidado de ejemplo (ficticio) va incrustado en base64; se regenera con src/ejemplo.py
ejemplo = leer('ejemplo.b64').strip()
partes = {'/*__CORE__*/': core, '/*__CHARTS__*/': leer('charts.js'), '/*__UI__*/': leer('ui.js'),
          '/*__GUIA__*/': leer('guia.js'), '/*__EJEMPLO__*/': ejemplo}
for marca, codigo in partes.items():
    if tpl.count(marca) != 1:
        raise SystemExit(f'app_template.html debe tener exactamente un {marca}')
    tpl = tpl.replace(marca, codigo)

SALIDA.write_text(tpl, encoding='utf-8')
print(f'OK → {SALIDA} ({len(tpl.encode("utf-8")) // 1024} KB)')
