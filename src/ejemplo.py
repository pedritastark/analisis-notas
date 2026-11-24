"""Genera el consolidado de EJEMPLO que ofrece la guía de la página.

Todo es ficticio: nombres inventados y notas al azar (semilla fija, así que el
resultado es siempre el mismo). Copia el formato de la plantilla real del colegio
(fila de campos, fila de asignaturas, fila de pesos, estudiantes y pie de totales)
para que la página lo lea igual que un consolidado de verdad.

Uso:  python3 src/ejemplo.py      (requiere openpyxl solo para regenerarlo)
Salida: src/ejemplo.b64 — el .xlsx en base64, que build.py incrusta en index.html.
"""
import base64
import io
import random
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

SRC = Path(__file__).resolve().parent
CURSO = '901'

# (campo, [(asignatura, peso correcto)])  — misma estructura que la plantilla real
CAMPOS = [
    ('CAMPO MATEMÁTICO ', [('Emprendimiento', .16), ('Geometría', .16), ('Matemáticas', .68)]),
    ('CAMPO CIENCIA Y TECNOLOGÍA ', [('Ciencias', .5), ('PreFísica / PreQuimica', .17), ('Tecnología ', .33)]),
    ('CAMPO HISTÓRICO', [('Cátedra de Paz ', .16), ('Ética y Valores ', .17), ('Religión', .17), ('Sociales ', .5)]),
    ('CAMPO COMUNICATIVO ', [('Español', .5), ('Inglés ', .4), ('Proyecto read and write', .1)]),
    (' CAMPO ARTE Y EXPRESIÓN', [('Artes', .13), ('Educación Física', .29), ('Música', .29), ('Teatro', .29)]),
    ('CONVIVENCIA ', [('Convivencia', 1)]),
]
# En los archivos del colegio la ponderación de PreFísica y Tecnología viene intercambiada
# en casi todas las hojas: el ejemplo lo reproduce para que la página muestre la corrección.
INTERCAMBIADOS = {'PreFísica / PreQuimica': .33, 'Tecnología ': .17}

NOMBRES = ['VALENTINA', 'SANTIAGO', 'MARIANA', 'SAMUEL', 'ISABELLA', 'MATÍAS', 'SOFÍA', 'TOMÁS', 'LUCÍA', 'EMILIANO',
           'GABRIELA', 'NICOLÁS', 'SALOMÉ', 'JERÓNIMO', 'ANTONELLA', 'DAVID', 'MARTINA', 'JUAN PABLO', 'SARA', 'ANDRÉS',
           'LAURA', 'FELIPE', 'CAMILA', 'SEBASTIÁN', 'VALERIA', 'MIGUEL ÁNGEL', 'ALEJANDRA', 'DANIEL', 'PAULA', 'JULIÁN']
APELLIDOS = ['ARIAS', 'BETANCUR', 'CARDONA', 'DUQUE', 'ESCOBAR', 'FRANCO', 'GIRALDO', 'HENAO', 'IBARRA', 'JARAMILLO',
             'LONDOÑO', 'MEJÍA', 'NARANJO', 'OSORIO', 'PATIÑO', 'QUINTERO', 'RESTREPO', 'SALAZAR', 'TORO', 'URIBE',
             'VALENCIA', 'ZAPATA', 'AGUDELO', 'BEDOYA', 'CASTAÑO', 'MONTOYA', 'OCAMPO', 'RENDÓN', 'SIERRA', 'VÉLEZ']

# hojas: (nombre, pesos intercambiados, asignaturas digitadas: None = todas, set() = ninguna)
HOJAS = [
    (f'{CURSO} - P1', True, None),
    (f'{CURSO} - P2', False, None),
    (f'{CURSO} - P3', True, None),
    (f'{CURSO} - P4', True, {'Matemáticas', 'Español'}),   # en digitación
    (f'{CURSO} - P5', True, set()),                        # plantilla sin diligenciar
]
MINIMO = 60
N = 30


def main():
    rnd = random.Random(901)
    nombres = sorted({f'{a} {b} {n}' for a, b, n in
                      ((rnd.choice(APELLIDOS), rnd.choice(APELLIDOS), rnd.choice(NOMBRES)) for _ in range(200))})
    nombres = rnd.sample(nombres, N)
    nombres.sort()
    # cada estudiante tiene un nivel y una tendencia; cada asignatura, una dificultad
    nivel = {n: rnd.gauss(69, 11) for n in nombres}
    tendencia = {n: rnd.gauss(0, 4) for n in nombres}
    dificultad = {a: rnd.gauss(0, 6) for _, asigs in CAMPOS for a, _ in asigs}

    wb = Workbook()
    wb.remove(wb.active)
    negrita = Font(bold=True)
    gris = PatternFill('solid', fgColor='EDEDED')
    for i_hoja, (hoja, intercambiado, digitadas) in enumerate(HOJAS):
        ws = wb.create_sheet(hoja)
        # encabezados
        fila_campo, fila_asig, fila_peso = ['Nº', 'NOMBRE DE ESTUDIANTE'], [None, None], [None, None]
        cols = []  # (campo, asignatura | None para la nota del área, peso)
        for campo, asigs in CAMPOS:
            for j, (a, w) in enumerate(asigs):
                peso = INTERCAMBIADOS.get(a, w) if intercambiado else w
                fila_campo.append(campo if j == 0 else None)
                fila_asig.append(a)
                fila_peso.append(peso)
                cols.append((campo, a, peso))
            fila_campo.append('Notal del area')
            fila_asig.append(None)
            fila_peso.append(1)
            cols.append((campo, None, 1))
        fila_campo.append('# Areas perdidas')
        for r in (fila_campo, fila_asig, fila_peso):
            ws.append(r)

        perdidos_por_col = [0] * len(cols)
        for k, nom in enumerate(nombres, start=1):
            fila = [k, nom]
            acc, areas_perdidas = {}, 0
            for c, (campo, a, peso) in enumerate(cols):
                if a is None:
                    nota = round(acc.get(campo, 0), 1)
                    nota = int(nota) if nota == int(nota) else nota
                    fila.append(nota)
                    if nota < MINIMO:
                        areas_perdidas += 1
                        perdidos_por_col[c] += 1
                    continue
                if digitadas is not None and a.strip() not in {d.strip() for d in digitadas}:
                    nota = 0
                elif rnd.random() < 0.025:
                    nota = 0          # «no registra nota»: el docente dejó la casilla en 0
                else:
                    base = nivel[nom] + tendencia[nom] * i_hoja - dificultad[a] + rnd.gauss(0, 9)
                    nota = int(max(10, min(100, round(base / 5) * 5)))
                if nota < MINIMO:
                    perdidos_por_col[c] += 1
                acc[campo] = acc.get(campo, 0) + nota * peso
                fila.append(nota)
            fila.append(areas_perdidas)
            ws.append(fila)

        ws.append(['# de estudiantes que reprueban', None, *perdidos_por_col])
        ws.append(['Porcentaje de no aprobación', None, *[round(x / N, 2) for x in perdidos_por_col]])

        # un poco de formato para que se vea como el original al abrirlo en Excel
        for c in ws[1] + ws[2]:
            c.font = negrita
            c.alignment = Alignment(wrap_text=True, vertical='center')
        for c in ws[3]:
            c.fill = gris
        ws.column_dimensions['B'].width = 34

    buf = io.BytesIO()
    wb.save(buf)
    datos = buf.getvalue()
    (SRC / 'ejemplo.b64').write_text(base64.b64encode(datos).decode('ascii') + '\n', encoding='ascii')
    print(f'OK → src/ejemplo.b64 ({len(datos) // 1024} KB de .xlsx, {N} estudiantes ficticios, {len(HOJAS)} hojas)')


if __name__ == '__main__':
    main()
