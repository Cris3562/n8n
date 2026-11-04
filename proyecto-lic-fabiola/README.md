# Cierre de Reservas y Primas por Cobrar · Área Cobranzas

App web de un solo archivo para **Nacional Seguros Vida y Salud (NSVS)**. Reemplaza el proceso que se hacía con un prompt en ChatGPT.
**Patrimoniales y Fianzas** queda preparada en la pantalla para una segunda etapa.

Todo se procesa **en la computadora de quien la usa**: los Excel no se suben a ningún servidor.

## Cómo se usa

| Paso | Qué sube | Qué obtiene |
|---|---|---|
| **1. Consolidar** | Las 5 descargas de sistemas: MASIVOS (PxC), ELIFE II, ESALUD, INMOTION, PREPAGA (en USD) | `01. APS REPORTE DE PRIMAS POR COBRAR Y RESERVAS CIERRE NSVS <MES> <AÑO> MN.xlsx` (hoja BASE) |
| *(manual)* | — | Ajustes manuales (reclasificación de mora) en el Excel descargado |
| **2. Conciliación** | (usa el consolidado) y luego la respuesta de Contabilidad | Archivo para Contabilidad (hoja PrimaXcobrar) y conciliación con diferencias |
| **3. APS y Dashboard** | El consolidado **final ajustado** | `02. ANEXO En Formato APS …xlsx`, dashboard gerencial, **PDF de una hoja** (descarga directa) y **PowerPoint** |

## Reglas que aplica (prompt "NSVS – Consolidación de planillas" + HOMOLOGACION COLUMNAS)

- Consolida MASIVOS, ELIFE II, ESALUD, INMOTION y PREPAGA, en ese orden, con las columnas finales de la tabla de homologación (columna B). Las columnas sin homologar van al final.
- Agrega la columna **Sistema** (MASIVOS, ELIFE II, SALUD, INMOTION, PREPAGA).
- Homologa los ramos: ACCIDENTES PERSONALES → **AP**, Salud y/o Enfermedad → **Salud**, VIDA MASIVO → **VI**. En PREPAGA, Ramo = **PREPAGA**.
- En PREPAGA convierte los importes de USD a Bs con el **tipo de cambio que se indica en pantalla** (6,86 por defecto; el navegador recuerda el último valor). Los días de mora y el número de anexo no se tocan. El mismo T/C se usa en el Anexo E.
- Quita títulos, filas de totales y pies de página: solo quedan las filas con número de póliza. Convierte a número los importes que vienen como texto ("1,262.24").
- Anexo E = resumen por Ramo del consolidado final (AP, DH, VG, SEPELIO, Salud, VI, PREPAGA).
- Conciliación: el saldo técnico se arma por ramo contable (VI, VG, DEF, SL, DH, AP, SL-PRE, INMOTION) y por fuente: ELIFE/ESALUD, BEC Masivos, BNB Senior, Banco Ganadero y Masivos. Se compara con la fila "Saldo Final (Contable)" que devuelve Contabilidad.
- Dashboard: consolida las pólizas con el mismo número y contratante. Las cifras se muestran en MM Bs. e incluyen todas las regionales.

Verificado con el cierre de **septiembre 2026**: el consolidado, el Anexo E y el saldo técnico de la conciliación coinciden con los archivos entregados.

## Estructura

```
app/src/core.js         motor de cálculo (lectura, homologación, Anexo E, conciliación, análisis)
app/src/template.html   interfaz
app/vendor/             librerías incluidas (xlsx-js-style 1.2.0, Chart.js 4.4.1, PptxGenJS 3.12.0, jsPDF 2.5.1, html2canvas 1.4.1) y logo
app/build.py            arma todo en un solo HTML → app/dist/Cierre_Reservas_PxC.html
netlify/                carpeta lista para publicar (index.html)
```

Para regenerar: `python3 app/build.py`. El resultado es un único archivo `app/dist/Cierre_Reservas_PxC.html` que se usa de forma local.

> Nunca subir a este repositorio bases o reportes con datos reales.
