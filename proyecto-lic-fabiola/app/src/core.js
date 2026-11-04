/* =====================================================================
   Motor de cálculo — Unificación Bases de Reservas y Primas por Cobrar
   Nacional Seguros Vida y Salud (NSVS) · Área Cobranzas
   Funciona igual en el navegador (window.Core) y en Node (pruebas).
   ===================================================================== */
(function (root) {
  "use strict";
  const X = () => root.XLSX || (typeof XLSX !== "undefined" ? XLSX : null);

  /* ---------------- Configuración de la empresa ---------------- */
  const TIPO_CAMBIO_PREPAGA = 6.86;

  // Columnas finales (columna B de HOMOLOGACION COLUMNAS, tal como salen en el reporte APS)
  const FINAL_COLS = [
    "Ramo", "Regional", "Póliza", "Contratante", "Fecha Emisión", "Inicio Vigencia", "Final Vigencia",
    "Prima Total", "Prima Total Cobrada al corte", "Prima Total Por Cobrar", "Sin Mora", "1 a 15 días",
    "16 a 45 días", "46 a 60 días", "61 a 90 días", "más de 90 días", "Total Mora",
    "Prima Total Por Cobrar (2)", "Impuestos (y aportes)", "DeudaNeta de Impuesto",
    "Tipo Plan Pago Anexo / Prima", "Anexo Número", "Dias Mora", "1 a 15 días2", "16 a 45 días ",
    "46 a 60 días2", "61 a 90 días2", "mas de 90 días", "Reserva", "Canal", "Moneda Póliza",
    "Tipo de Cambio", "Sistema", "Fecha Próximo Vencimiento Cuota", "Fecha Último Pago",
    "Fecha Vencimiento", "Monto Próximo Cuota", "Intermediario", "Teléfono/Celular", "Tipo Póliza",
    "Ejecutivo Asignado", "Línea de Negocio", "Sponsor", "TIPO_DE_FACTURAS_PARA_COLECTIVOS",
    "TIPO_DE_DISTRIBUCION", "PRODUCTO", "FECHA_PAGO_PRORROG", "FORMA_PAGO", "Fila",
    "Fecha_Anulacion", "Nro Renovacion", "Estado", "Estado_calc", "UltimaFechaPago", "Origen",
    "Ramo Contable (OT) (grupo)", "RAMO_APS",
  ];
  const C = Object.fromEntries(FINAL_COLS.map((c, i) => [c, i]));
  const IDX = {
    ramo: 0, regional: 1, poliza: 2, contratante: 3, fEmision: 4, fInicio: 5, fFinal: 6,
    primaTotal: 7, cobrada: 8, pxc: 9, sinMora: 10, m1: 11, m2: 12, m3: 13, m4: 14, m5: 15, totalMora: 16,
    pxc2: 17, impuestos: 18, neto: 19, anexo: 21, diasMora: 22, r1: 23, r2: 24, r3: 25, r4: 26, r5: 27,
    reserva: 28, tc: 31, sistema: 32, sponsor: 42, ramoContable: 55,
  };
  // Columnas que se convierten a número
  const NUM_COLS = new Set([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 31, C["Nro Renovacion"]]);
  // Columnas de importes (las que se multiplican por el T/C en PREPAGA y se totalizan)
  const MONTO_COLS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 24, 25, 26, 27, 28];
  const FECHA_COLS = new Set([4, 5, 6]);

  // Nombres de origen por sistema (columnas D..H de HOMOLOGACION COLUMNAS), alineados con FINAL_COLS
  const N = null;
  const BASE29 = ["Ramo", "Regional", "\nPóliza", "\nContratante", "Fecha Emisión", "Inicio Vigencia", "Final Vigencia",
    "Prima Total", "Prima Total Cobrada  al corte", "Prima Total Por Cobrar", "Sin Mora", "1 a 15 días", "16 a 45 días",
    "46 a 60 días", "61 a 90 días", "más de 90 días", "Total Mora", "Prima Total Por Cobrar", "Impuestos (y aportes)",
    "DeudaNeta  de Impuesto", "Tipo Plan Pago Anexo / Prima", "Anexo\nNúmero", "Dias Mora", "1 a 15 días", "16 a 45 días",
    "46 a 60 días", "61 a 90 días", "mas de 90 días", "Reserva"];
  const fill = (arr) => arr.concat(Array(FINAL_COLS.length - arr.length).fill(N));
  const HOMOLOGACION = {
    MASIVOS: fill(["Ramo", "Departamento", "Nro Poliza", "Nombre Contratante", "FechaEmision", "Inicio Vigencia", "Termino Vigencia",
      "Prom. Prima Total", "PrimaTotalCobrada", "PrimaTotalxCobrar", "SinMora", "1 a 15 dias", "16 a 45 dias", "46 a 60 dias",
      "61 a 90 dias", "Mas de 90 dias", "TotalMora", "PrimaTotalxCobrar1", "Impuestos", "DeudaNetaImpuestos", "Frecuencia Cobro",
      N, "Máx. NroDiasCalc", "1 a 15 dias.", "16 a 45 dias.", "46 a 60 dias.", "61 a 90 dias.", "Mas de 90 dias.", "TotalReserva",
      "Canal.", "MonedaPoliza", "TipoCambio JULIO 2026", N, "FechaProximaCuota", N, N, N, N, N, N, N, "Linea de Negocio", "Sponsor",
      N, N, "Producto", N, N, "Fila", "Fecha_Anulacion ", "Nro Renovacion", "Estado", "Estado_calc", "UltimaFechaPago", "Origen",
      "Ramo Contable (OT) (grupo)", N]),
    "ELIFE II": fill(["Ramo", "Regional", "\nPóliza", "\nContratante", "Fecha Emisión", "Inicio Vigencia", "Final Vigencia",
      "Prima\nTotal", "Prima\nTotal\nCobrada", "Prima Total Por Cobrar", "Sin Mora", "1 a 15 días", "16 a 45 días", "46 a 60 días",
      "61 a 90 días", "más de 90 días", "Total Mora", "Prima Total Por Cobrar", "Impuestos (y aportes)", "DeudaNeta  de Impuesto",
      "Tipo\nPoliza", "Anexo\nNumero", "Dias Mora", "1 a 15 días", "16 a 45 días", "46 a 60 días", "61 a 90 días", "mas de 90 días",
      "\nReserva", "Tipo Intermediario", "Moneda\nOrigen", "Tipo De Cambio", N, "Fecha Próximo Vencimiento Cuota",
      "Fecha Último Pago", "Fecha Vencimiento", "Monto Próximo Cuota", "Intermediario", "Teléfono/Celular", "Tipo Póliza",
      "Ejecutivo Asignado", "Línea de Negocio", "Sponsor"]),
    SALUD: fill(BASE29.concat(["Canal", "Moneda Póliza", "Tipo de Cambio"])),
    INMOTION: fill(["RAMO", "REGIONAL", "POLIZA", "CONTRATANTE", "FECHA_EMISION", "INICIO_VIGENCIA", "FINAL_VIGENCIA", "PRIMA_TOTAL",
      "PRIMA_TOT_COBRADA", "PRIMA_TOT_POR_COBRAR", "SIN_MORA", "MORA_1_15", "MORA_16_45", "MORA_46_60", "MORA_61_90", "MORA_MAYOR_90",
      "TOTAL_MORA", "PRIMA_TOT_POR_COBRAR", "IMPUESTOS", "DEUDA_NETA", N, "ANEXO", "DIAS_MORA", "RESERVA_1_15", "RESERVA_16_45",
      "RESERVA_46_60", "RESERVA_61_90", "RESERVA_90_DIAS", "TOT_RESERVA_POR_COBRAR", "CANAL", "MONEDA_DE_LA_POLIZA", "TIPO_CAMBIO", N,
      "PROX_VENCIMIENTO", "ULTIMA_FECHA_PAGO", "FECHA_VENCIMIENTO", "MTO_PROXIMA_CUOTA", "INTERMEDIARIO", N, N, N, "LINEA_NEGOCIO",
      "SPONSOR", "TIPO_DE_FACTURAS_PARA_COLECTIVOS", "TIPO_DE_DISTRIBUCION", "PRODUCTO", "FECHA_PAGO_PRORROG", "FORMA_PAGO",
      N, N, N, N, N, N, N, N, "RAMO_APS"]),
    PREPAGA: fill(BASE29.concat([N, N, "Tipo de Cambio"])),
  };

  // Orden y descripción de los sistemas (el orden es el del reporte consolidado)
  const SISTEMAS = [
    { id: "MASIVOS", titulo: "Masivos (BI)", archivo: "PxC … cierre Masivos NSVS" },
    { id: "ELIFE II", titulo: "ELIFE II", archivo: "ELIFE II CIERRE …" },
    { id: "SALUD", titulo: "ESALUD", archivo: "ESALUD CIERRE …" },
    { id: "INMOTION", titulo: "INMOTION", archivo: "INMOTION MN CIERRE …" },
    { id: "PREPAGA", titulo: "PREPAGA (USD → Bs × 6.86)", archivo: "PREPAGA ME REPORTE … (descarga en dólares)" },
  ];

  // Criterios 3 y 5 del prompt: homologación de descripciones de Ramo
  const RAMO_MAP = {
    "accidentes personales": "AP", "ap": "AP",
    "salud y/o enfermedad": "Salud", "salud": "Salud",
    "vida masivo": "VI", "vi": "VI",
    "dolares": "Dólares Americanos", "dolares americanos": "Dólares Americanos",
  };

  /* ---------------- Utilidades ---------------- */
  const sinAcentos = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const norm = (s) => sinAcentos(s ?? "").toLowerCase().replace(/[\s_]+/g, " ").trim();
  const loose = (s) => norm(s).replace(/[^a-z0-9]/g, "");
  const vacio = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

  function toNum(v) {
    if (typeof v === "number") return v;
    if (vacio(v)) return null;
    const s = String(v).trim().replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function readWorkbook(data) {
    return X().read(data, { type: "array", cellDates: false, dense: true });
  }
  function sheetRows(ws) {
    return X().utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  }

  /* ---------------- Paso 1: leer y homologar cada sistema ---------------- */
  function findHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const n = (rows[i] || []).map(norm);
      if (n.includes("ramo") && (n.includes("regional") || n.includes("departamento"))) return i;
    }
    return -1;
  }

  function mapColumns(sistema, header) {
    const hom = HOMOLOGACION[sistema];
    const entries = hom.map((src, fi) => ({ fi, src, n: src ? norm(src) : null, l: src ? loose(src) : null, used: false })).filter((e) => e.src);
    const colMap = new Array(header.length).fill(null); // índice destino por columna de origen
    // 1) coincidencia exacta normalizada, respetando el orden (columnas con nombre repetido)
    header.forEach((h, j) => {
      if (vacio(h)) return;
      const e = entries.find((e) => !e.used && e.n === norm(h));
      if (e) { e.used = true; colMap[j] = e.fi; }
    });
    // 2) coincidencia flexible (ignora signos y puntos; o misma primera palabra larga, ej. "TipoCambio …")
    header.forEach((h, j) => {
      if (vacio(h) || colMap[j] !== null) return;
      const l = loose(h), w = norm(h).split(" ")[0];
      const e = entries.find((e) => !e.used && (e.l === l || (w.length >= 8 && e.n.split(" ")[0] === w)));
      if (e) { e.used = true; colMap[j] = e.fi; }
    });
    const faltantes = entries.filter((e) => !e.used && [0, 2, 3, 9].includes(e.fi)).map((e) => FINAL_COLS[e.fi]);
    return { colMap, faltantes };
  }

  function homologarRamo(v) {
    if (vacio(v)) return v;
    return RAMO_MAP[norm(v)] ?? v;
  }

  /**
   * Lee el libro de un sistema y devuelve filas homologadas.
   * @returns {{rows:any[][], extras:string[], extraVals:any[][], aviso:string[]}}
   */
  function procesarSistema(sistema, wb) {
    const avisos = [];
    // PREPAGA: se usa la hoja descargada del sistema (en dólares). Si hay varias, la primera con encabezado.
    let ws = null, rows = null, hr = -1;
    for (const name of wb.SheetNames) {
      const r = sheetRows(wb.Sheets[name]);
      const h = findHeaderRow(r);
      if (h >= 0) { ws = wb.Sheets[name]; rows = r; hr = h; break; }
    }
    if (!ws) throw new Error(`No se encontró la fila de encabezados (Ramo / Regional) en el archivo de ${sistema}.`);
    const header = rows[hr];
    const { colMap, faltantes } = mapColumns(sistema, header);
    if (faltantes.length) throw new Error(`En ${sistema} faltan columnas: ${faltantes.join(", ")}. ¿Es el archivo correcto?`);
    const extrasIdx = header.map((h, j) => (colMap[j] === null && !vacio(h) ? j : -1)).filter((j) => j >= 0);
    const extras = extrasIdx.map((j) => String(header[j]).trim());
    const polCol = colMap.indexOf(IDX.poliza);
    const out = [], extraVals = [];
    const factor = sistema === "PREPAGA" ? TIPO_CAMBIO_PREPAGA : 1;
    for (let i = hr + 1; i < rows.length; i++) {
      const src = rows[i];
      if (!src || vacio(src[polCol])) continue; // filas de totales, pies de página y vacías
      const r = new Array(FINAL_COLS.length).fill(null);
      for (let j = 0; j < header.length; j++) {
        const fi = colMap[j];
        if (fi === null) continue;
        let v = src[j];
        if (typeof v === "string" && v.trim() === "") v = null;
        if (NUM_COLS.has(fi)) v = toNum(v);
        r[fi] = v;
      }
      r[IDX.ramo] = sistema === "PREPAGA" ? "PREPAGA" : homologarRamo(r[IDX.ramo]); // Criterio 4 (Prepaga)
      if (factor !== 1) for (const k of MONTO_COLS) if (typeof r[k] === "number") r[k] = r[k] * factor;
      r[IDX.sistema] = sistema; // Criterio 2
      out.push(r);
      extraVals.push(extrasIdx.map((j) => (vacio(src[j]) ? null : src[j])));
    }
    if (!out.length) avisos.push(`El archivo de ${sistema} no tiene filas con número de póliza.`);
    return { rows: out, extras, extraVals, avisos };
  }

  /** Une todos los sistemas: columnas homogéneas + columnas no homologadas al final (Criterio 1) */
  function consolidar(resultados) {
    const extraCols = [];
    for (const s of SISTEMAS) {
      const r = resultados[s.id]; if (!r) continue;
      for (const e of r.extras) if (!extraCols.includes(e)) extraCols.push(e);
    }
    const header = FINAL_COLS.concat(extraCols);
    const rows = [];
    const resumen = [];
    for (const s of SISTEMAS) {
      const r = resultados[s.id]; if (!r) continue;
      const pos = r.extras.map((e) => FINAL_COLS.length + extraCols.indexOf(e));
      r.rows.forEach((row, i) => {
        const full = row.concat(new Array(extraCols.length).fill(null));
        r.extraVals[i].forEach((v, k) => (full[pos[k]] = v));
        rows.push(full);
      });
      resumen.push({ sistema: s.id, filas: r.rows.length, ...sumar(r.rows) });
    }
    return { header, rows, resumen, totales: sumar(rows) };
  }

  function sumar(rows) {
    const t = {};
    const keys = { primaTotal: 7, pxc: 9, sinMora: 10, totalMora: 16, impuestos: 18, neto: 19, reserva: 28 };
    for (const [k, i] of Object.entries(keys)) t[k] = rows.reduce((s, r) => s + (typeof r[i] === "number" ? r[i] : 0), 0);
    return t;
  }

  /* ---------------- Estilos de Excel ---------------- */
  const AZUL = "0D2350", AZUL2 = "1565D8", SUAVE = "DBE8F7", NARANJA = "F36A10";
  const borde = { top: { style: "thin", color: { rgb: "9FB3D1" } }, bottom: { style: "thin", color: { rgb: "9FB3D1" } }, left: { style: "thin", color: { rgb: "9FB3D1" } }, right: { style: "thin", color: { rgb: "9FB3D1" } } };
  const ST = {
    head: { font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: AZUL } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borde },
    total: { font: { bold: true, name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: SUAVE } }, border: borde, numFmt: "#,##0.00" },
    num: { numFmt: "#,##0.00", border: borde, font: { name: "Calibri", sz: 10 } },
    txt: { border: borde, font: { name: "Calibri", sz: 10 } },
    title: { font: { bold: true, sz: 12, color: { rgb: AZUL }, name: "Calibri" }, alignment: { horizontal: "center" } },
    sub: { font: { bold: true, sz: 10, name: "Calibri" }, alignment: { horizontal: "center" } },
    label: { font: { bold: true, name: "Calibri", sz: 10 }, border: borde },
    warn: { font: { bold: true, color: { rgb: "B42318" }, name: "Calibri", sz: 10 }, border: borde, numFmt: "#,##0.00" },
    ok: { font: { bold: true, color: { rgb: "12805C" }, name: "Calibri", sz: 10 }, border: borde, numFmt: "#,##0.00" },
  };
  const A1 = (r, c) => X().utils.encode_cell({ r, c });

  /** Libro "BASE" (reporte consolidado) */
  function libroConsolidado(cons) {
    // Hoja en modo "denso" (arreglo de filas): mucho más rápida para ~70.000 filas
    const ncol = cons.header.length;
    const ws = [];
    ws.push(cons.header.map((h) => ({ t: "s", v: h, s: ST.head })));
    const esMonto = new Array(ncol).fill(false); MONTO_COLS.forEach((k) => (esMonto[k] = true));
    const esFecha = new Array(ncol).fill(false); FECHA_COLS.forEach((k) => (esFecha[k] = true));
    for (const r of cons.rows) {
      const row = new Array(ncol);
      for (let c = 0; c < ncol; c++) {
        const v = r[c];
        if (v === null || v === undefined) continue;
        if (typeof v === "number") row[c] = esMonto[c] ? { t: "n", v, z: "#,##0.00" } : esFecha[c] ? { t: "n", v, z: "dd/mm/yyyy" } : { t: "n", v };
        else row[c] = { t: "s", v: String(v) };
      }
      ws.push(row);
    }
    const tot = new Array(ncol);
    tot[0] = { t: "s", v: "TOTAL", s: ST.total };
    for (const k of MONTO_COLS) tot[k] = { t: "n", v: cons.rows.reduce((s, r) => s + (typeof r[k] === "number" ? r[k] : 0), 0), s: ST.total, z: "#,##0.00" };
    ws.push(tot);
    const last = ws.length - 1;
    ws["!ref"] = X().utils.encode_range({ s: { r: 0, c: 0 }, e: { r: last, c: ncol - 1 } });
    ws["!cols"] = cons.header.map((h, i) => ({ wch: i === 3 ? 38 : i === 2 ? 26 : Math.min(Math.max(String(h).length + 2, 11), 28) }));
    ws["!autofilter"] = { ref: X().utils.encode_range({ s: { r: 0, c: 0 }, e: { r: last - 1, c: ncol - 1 } }) };
    const wb = X().utils.book_new();
    X().utils.book_append_sheet(wb, ws, "BASE");
    return wb;
  }

  /* ---------------- Paso 3: leer el consolidado final (ajustado a mano) ---------------- */
  function leerConsolidadoFinal(wb) {
    const name = wb.SheetNames.find((n) => norm(n) === "base") || wb.SheetNames[0];
    const rows = sheetRows(wb.Sheets[name]);
    const hr = findHeaderRow(rows);
    if (hr < 0) throw new Error("No se encontró la hoja BASE con encabezados (Ramo, Regional…).");
    const header = rows[hr].map((h) => (h == null ? "" : String(h)));
    // mapear por nombre (tolerante) a FINAL_COLS
    const used = new Set();
    const map = FINAL_COLS.map((fc) => {
      let j = header.findIndex((h, k) => !used.has(k) && h === fc);
      if (j < 0) j = header.findIndex((h, k) => !used.has(k) && norm(h) === norm(fc));
      if (j >= 0) used.add(j);
      return j;
    });
    if (map[IDX.pxc] < 0 || map[IDX.ramo] < 0 || map[IDX.contratante] < 0) throw new Error("El archivo no parece ser el reporte consolidado (faltan columnas Ramo / Contratante / Prima Total Por Cobrar).");
    const calcReg = header.findIndex((h) => norm(h) === "calc. regional");
    const data = [];
    for (let i = hr + 1; i < rows.length; i++) {
      const s = rows[i]; if (!s) continue;
      const ramo = s[map[IDX.ramo]];
      if (vacio(ramo) || norm(ramo) === "total") continue;
      if (vacio(s[map[IDX.poliza]]) && vacio(s[map[IDX.contratante]])) continue;
      const r = map.map((j, fi) => {
        const v = j >= 0 ? s[j] : null;
        return NUM_COLS.has(fi) ? toNum(v) ?? 0 : v;
      });
      r.calcRegional = calcReg >= 0 ? s[calcReg] : null;
      data.push(r);
    }
    return data;
  }

  /* ---------------- Anexo E APS ---------------- */
  const ORDEN_RAMOS_APS = ["AP", "DH", "VG", "SEPELIO", "Salud", "VI", "PREPAGA"];
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  function anexoPorRamo(rows) {
    const agg = new Map();
    const campos = [IDX.sinMora, IDX.m1, IDX.m2, IDX.m3, IDX.m4, IDX.m5, IDX.pxc2, IDX.impuestos, IDX.neto, IDX.r1, IDX.r2, IDX.r3, IDX.r4, IDX.r5, IDX.reserva];
    for (const r of rows) {
      const k = String(r[IDX.ramo]);
      if (!agg.has(k)) agg.set(k, new Array(campos.length).fill(0));
      const a = agg.get(k);
      campos.forEach((c, i) => (a[i] += typeof r[c] === "number" ? r[c] : 0));
    }
    const orden = ORDEN_RAMOS_APS.filter((k) => agg.has(k)).concat([...agg.keys()].filter((k) => !ORDEN_RAMOS_APS.includes(k)));
    return orden.map((k) => ({ ramo: k, v: agg.get(k) }));
  }

  function libroAnexoE(rows, periodo, empresa) {
    const ramos = anexoPorRamo(rows);
    const ultimoDia = new Date(periodo.anio, periodo.mes + 1, 0).getDate();
    const aoa = [];
    const set = (r, c, v) => { aoa[r] = aoa[r] || []; aoa[r][c] = v; };
    set(0, 15, "Anexo E"); set(1, 15, TIPO_CAMBIO_PREPAGA);
    set(2, 0, empresa.razonSocial);
    set(4, 0, "REPORTE DE PRIMAS POR COBRAR Y RESERVA PARA PRIMAS POR COBRAR");
    set(5, 0, "PÓLIZAS CON VIGENCIA DE UN AÑO Y SUPERIOR A UN AÑO");
    set(6, 0, `Al ${ultimoDia} de ${MESES[periodo.mes]} de ${periodo.anio}`);
    set(7, 0, "(Cifras expresadas en bolivianos)");
    set(9, 15, TIPO_CAMBIO_PREPAGA);
    set(10, 0, "Ramos"); set(10, 1, "Primas por Cobrar"); set(10, 7, "Total Primas por Cobrar"); set(10, 8, "Deducción Impuestos y Aportes");
    set(10, 9, "Primas por Cobrar Neto de Impuestos"); set(10, 10, "Reserva  para  Primas por Cobrar "); set(10, 15, " Total Reserva   Primas por Cobrar ");
    ["Sin Mora", "1 a 15 días", "16 a 45 días", "46 a 60 días", "61 a 90 días", "Mayor a 90 días"].forEach((t, i) => set(11, 1 + i, t));
    ["1 a 15 días", "16 a 45 días", "46 a 60 días", "61 a 90 días", "Mayor a 90 días"].forEach((t, i) => set(11, 10 + i, t));
    [1, 2, 3, 4, 5, 6, 7, "8=2+3+5+6+7", 9, "10=9-8", 11, 12, 13, 14, 15, "16=11+12+13+14+15"].forEach((t, i) => set(13, i, t));
    let r = 15;
    for (const { ramo, v } of ramos) {
      set(r, 0, ramo);
      v.forEach((x, i) => set(r, 1 + i, x));
      r++;
    }
    const first = 16, lastRow = r; // filas Excel (1-based) first..lastRow
    set(r, 0, "TOTAL");
    for (let c = 1; c <= 15; c++) set(r, c, null);
    const ws = X().utils.aoa_to_sheet(aoa);
    for (let c = 1; c <= 15; c++) {
      const col = X().utils.encode_col(c);
      ws[A1(r, c)] = { t: "n", f: `SUM(${col}${first}:${col}${lastRow})`, v: ramos.reduce((s, x) => s + x.v[c - 1], 0), s: ST.total };
    }
    ws["!ref"] = X().utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 15 } });
    ws["!merges"] = [
      "A5:P5", "A6:P6", "A7:P7", "A8:P8", "A11:A13", "B11:G11", "H11:H13", "I11:I13", "J11:J13", "K11:O11", "P11:P13",
      "B12:B13", "C12:C13", "D12:D13", "E12:E13", "F12:F13", "G12:G13", "K12:K13", "L12:L13", "M12:M13", "N12:N13", "O12:O13",
    ].map((x) => X().utils.decode_range(x));
    // estilos
    const sty = (a, s) => { ws[a] = ws[a] || { t: "s", v: "" }; ws[a].s = s; };
    sty("A3", { font: { bold: true, sz: 11, name: "Calibri", color: { rgb: AZUL } } });
    ["A5", "A6"].forEach((a) => sty(a, ST.title));
    ["A7", "A8"].forEach((a) => sty(a, ST.sub));
    sty("P1", { font: { bold: true, name: "Calibri" }, alignment: { horizontal: "right" } });
    for (let rr = 10; rr <= 12; rr++) for (let c = 0; c <= 15; c++) sty(A1(rr, c), ST.head);
    for (let c = 0; c <= 15; c++) sty(A1(13, c), { ...ST.txt, alignment: { horizontal: "center" }, font: { sz: 9, name: "Calibri", color: { rgb: "5B7194" } } });
    for (let rr = 15; rr < r; rr++) { sty(A1(rr, 0), ST.label); for (let c = 1; c <= 15; c++) sty(A1(rr, c), ST.num); }
    sty(A1(r, 0), ST.total);
    ws["!cols"] = [{ wch: 14 }].concat(Array(15).fill({ wch: 16 }));
    ws["!rows"] = [];
    ws["!rows"][11] = { hpt: 30 };
    const wb = X().utils.book_new();
    X().utils.book_append_sheet(wb, ws, "ANEXO E APS");
    return wb;
  }

  /* ---------------- Paso 2: Conciliación de Primas por Cobrar ---------------- */
  const CONC_COLS = ["VIDA INDIVIDUAL CORTO PLAZO", "VG", "DEF", "SL", "DH", "AP", "SL-PRE", "INMOTION"];
  const CONC_FILAS = ["elife1; elife2; esalud", "Bec Seguro", "Bec Masivos", "BEC MANUAL", "BNB Senior - BNB Activa", "Banco Ganadero", "Masivos "];
  const REGS = ["SC", "LP", "CB", "SR", "BN", "TJ", "OR", "PT", "PN"];
  function regCode(v) {
    const n = norm(v);
    if (n.startsWith("santa")) return "SC";
    if (n.startsWith("la paz")) return "LP";
    if (n.startsWith("cocha")) return "CB";
    if (n.startsWith("chuqui") || n.startsWith("sucre")) return "SR";
    if (n.startsWith("beni")) return "BN";
    if (n.startsWith("tarija")) return "TJ";
    if (n.startsWith("oruro")) return "OR";
    if (n.startsWith("potos")) return "PT";
    if (n.startsWith("pando")) return "PN";
    return "SC";
  }
  function concColumna(r) {
    const s = r[IDX.sistema], ramo = norm(r[IDX.ramo]), rc = norm(r[IDX.ramoContable]);
    if (s === "PREPAGA") return "SL-PRE";
    if (s === "INMOTION") return "INMOTION";
    if (s === "SALUD") return "SL";
    if (s === "MASIVOS") {
      if (rc.startsWith("vida")) return "VIDA INDIVIDUAL CORTO PLAZO";
      if (rc.startsWith("defun") || rc.includes("sepelio")) return "DEF";
      if (rc.startsWith("accidentes")) return "AP";
      if (rc.startsWith("salud")) return "SL";
    }
    if (ramo === "vi") return "VIDA INDIVIDUAL CORTO PLAZO";
    if (ramo === "vg") return "VG";
    if (ramo === "sepelio") return "DEF";
    if (ramo === "dh") return "DH";
    if (ramo === "ap") return "AP";
    if (ramo === "salud") return "SL";
    return "VIDA INDIVIDUAL CORTO PLAZO";
  }
  function concFila(r, col) {
    if (r[IDX.sistema] !== "MASIVOS") return "elife1; elife2; esalud";
    const sp = norm(r[IDX.sponsor]);
    if (sp.includes("banco economico")) return "Bec Masivos";
    if (sp.includes("banco ganadero")) return "Banco Ganadero";
    if (sp.includes("banco nacional de bolivia") && col !== "VIDA INDIVIDUAL CORTO PLAZO") return "BNB Senior - BNB Activa";
    return "Masivos ";
  }

  function calcularConciliacion(rows) {
    const resumen = {}; CONC_FILAS.forEach((f) => (resumen[f] = Object.fromEntries(CONC_COLS.map((c) => [c, 0]))));
    const detalle = new Map(); // clave "fuente|ramo" -> {SC..PN}
    const sponsors = new Map(); // masivos: sponsor -> ramoContable -> reg
    for (const r of rows) {
      const v = typeof r[IDX.pxc] === "number" ? r[IDX.pxc] : 0;
      const col = concColumna(r), fila = concFila(r, col);
      resumen[fila][col] += v;
      const fuente = r[IDX.sistema] === "MASIVOS" ? `MASIVOS · ${fila.trim()}` : r[IDX.sistema];
      const reg = regCode(r[IDX.regional]);
      const k = `${fuente}|${col}`;
      if (!detalle.has(k)) detalle.set(k, Object.fromEntries(REGS.map((x) => [x, 0])));
      detalle.get(k)[reg] += v;
      if (r[IDX.sistema] === "MASIVOS") {
        const sp = String(r[IDX.sponsor] ?? "(sin sponsor)"), rc = String(r[IDX.ramoContable] ?? r[IDX.ramo]);
        if (!sponsors.has(sp)) sponsors.set(sp, new Map());
        const m = sponsors.get(sp);
        if (!m.has(rc)) m.set(rc, Object.fromEntries(REGS.map((x) => [x, 0])));
        m.get(rc)[reg] += v;
      }
    }
    const tecnico = Object.fromEntries(CONC_COLS.map((c) => [c, CONC_FILAS.reduce((s, f) => s + resumen[f][c], 0)]));
    return { resumen, tecnico, detalle, sponsors };
  }

  function libroConciliacion(conc, periodo, contable) {
    const ws = {};
    const put = (a, v, s) => { const c = typeof v === "number" ? { t: "n", v } : (v && v.f) ? { t: "n", f: v.f, v: v.v ?? 0 } : { t: "s", v: v ?? "" }; if (s) c.s = s; ws[a] = c; };
    const L = (i) => X().utils.encode_col(i);
    put("A2", "Prima X Cobrar", ST.head); put("B2", `Cierre ${MESES[periodo.mes]} ${periodo.anio}`, ST.head);
    CONC_COLS.forEach((c, i) => put(`${L(2 + i)}2`, c, ST.head)); put("K2", "TOTALES", ST.head);
    const labels = { 3: "Saldo Inicial", 4: "Producción", 5: "Anulaciones", 6: "Cobranza", 7: "Ajustes por T/C", 8: "Prima por cobrar", 9: "Saldo Final (Contable)", 10: "Saldo Técnico (Sistemas-Planillas de Control)" };
    for (const [r, t] of Object.entries(labels)) put(`B${r}`, t, ST.label);
    for (let r = 3; r <= 8; r++) { for (let i = 0; i < 8; i++) put(`${L(2 + i)}${r}`, 0, ST.num); put(`K${r}`, { f: `SUM(C${r}:I${r})` }, ST.num); }
    for (let i = 0; i < 8; i++) {
      const col = L(2 + i), v = contable ? contable[CONC_COLS[i]] : null;
      if (typeof v === "number") put(`${col}9`, v, { ...ST.num, fill: { fgColor: { rgb: "FFF4E5" } } });
      else ws[`${col}9`] = { t: "z", s: { ...ST.num, fill: { fgColor: { rgb: "FFF4E5" } } } };
      put(`${col}10`, { f: `SUM(${col}11:${col}17)`, v: conc.tecnico[CONC_COLS[i]] }, ST.total);
    }
    put("K9", { f: "SUM(C9:I9)" }, ST.total); put("K10", { f: "SUM(K11:K17)" }, ST.total);
    CONC_FILAS.forEach((f, k) => {
      const r = 11 + k; put(`B${r}`, f, ST.txt);
      CONC_COLS.forEach((c, i) => put(`${L(2 + i)}${r}`, conc.resumen[f][c], ST.num));
      put(`K${r}`, { f: `SUM(C${r}:J${r})` }, ST.num);
    });
    put("B18", "Diferencias", ST.label);
    for (let i = 0; i < 9; i++) { const col = L(2 + i); put(`${col}18`, { f: `${col}9-${col}10` }, ST.warn); }
    put("B19", "Estado", ST.label);
    for (let i = 0; i < 8; i++) { const col = L(2 + i); put(`${col}19`, { f: `IF(ISBLANK(${col}9),"Pendiente",IF(ABS(${col}18)<=1,"Ok","Revisar"))` }, ST.txt); ws[`${col}19`].t = "s"; ws[`${col}19`].v = ""; }
    // Detalle por regional
    let r = 22;
    put(`B${r - 1}`, "DETALLE SALDO TÉCNICO POR FUENTE, RAMO Y REGIONAL", { font: { bold: true, color: { rgb: AZUL }, name: "Calibri", sz: 11 } });
    put(`B${r}`, "Fuente / Ramo", ST.head); REGS.forEach((g, i) => put(`${L(2 + i)}${r}`, g, ST.head)); put(`L${r}`, "Totales", ST.head);
    r++;
    const keys = [...conc.detalle.keys()].sort();
    for (const k of keys) {
      const [fuente, col] = k.split("|"); const d = conc.detalle.get(k);
      put(`A${r}`, fuente, ST.txt); put(`B${r}`, col, ST.txt);
      REGS.forEach((g, i) => put(`${L(2 + i)}${r}`, d[g], ST.num));
      put(`L${r}`, { f: `SUM(C${r}:K${r})`, v: REGS.reduce((s, g) => s + d[g], 0) }, ST.total);
      r++;
    }
    ws["!ref"] = `A1:L${r}`;
    ws["!cols"] = [{ wch: 26 }, { wch: 44 }].concat(Array(10).fill({ wch: 17 }));
    const wb = X().utils.book_new();
    X().utils.book_append_sheet(wb, ws, "PrimaXcobrar");

    // Hoja de masivos por sponsor (equivale a la tabla dinámica de la hoja "masivo")
    const aoa = [["Sponsor / Ramo contable", ...REGS, "Total general"]];
    for (const [sp, m] of [...conc.sponsors.entries()].sort((a, b) => tot(b[1]) - tot(a[1]))) {
      const t = REGS.map((g) => [...m.values()].reduce((s, x) => s + x[g], 0));
      aoa.push([sp, ...t, t.reduce((a, b) => a + b, 0)]);
      for (const [rc, d] of m) aoa.push([`   ${rc}`, ...REGS.map((g) => d[g]), REGS.reduce((s, g) => s + d[g], 0)]);
    }
    const ws2 = X().utils.aoa_to_sheet(aoa);
    for (let c = 0; c < aoa[0].length; c++) ws2[A1(0, c)].s = ST.head;
    for (let rr = 1; rr < aoa.length; rr++) for (let c = 1; c < aoa[0].length; c++) { const a = A1(rr, c); ws2[a].s = String(aoa[rr][0]).startsWith("   ") ? ST.num : ST.total; }
    ws2["!cols"] = [{ wch: 58 }].concat(Array(10).fill({ wch: 15 }));
    X().utils.book_append_sheet(wb, ws2, "Masivos por Sponsor");
    return wb;
    function tot(m) { return [...m.values()].reduce((s, d) => s + REGS.reduce((a, g) => a + d[g], 0), 0); }
  }

  /** Lee la respuesta de Contabilidad: fila "Saldo Final (Contable)" de la hoja PrimaXcobrar */
  function leerRespuestaContabilidad(wb) {
    const name = wb.SheetNames.find((n) => norm(n) === "primaxcobrar");
    if (!name) throw new Error('No se encontró la hoja "PrimaXcobrar" en el archivo de Contabilidad.');
    const rows = sheetRows(wb.Sheets[name]);
    let hr = -1, fr = -1, tr = -1;
    rows.forEach((r, i) => {
      if (!r) return;
      const n = r.map(norm);
      if (hr < 0 && n.includes("vida individual corto plazo") && n.includes("dh")) hr = i;
      if (fr < 0 && n.some((x) => x.startsWith("saldo final (contable)"))) fr = i;
      if (tr < 0 && n.some((x) => x.startsWith("saldo tecnico"))) tr = i;
    });
    if (hr < 0 || fr < 0) throw new Error('No se encontró la fila "Saldo Final (Contable)" en la hoja PrimaXcobrar.');
    const colIdx = Object.fromEntries(CONC_COLS.map((c) => [c, rows[hr].findIndex((h) => norm(h) === norm(c))]));
    const contable = {}, tecnicoArchivo = {};
    let completos = 0;
    for (const c of CONC_COLS) {
      const j = colIdx[c];
      const v = j >= 0 ? toNum(rows[fr][j]) : null;
      contable[c] = v; if (v !== null) completos++;
      tecnicoArchivo[c] = j >= 0 && tr >= 0 ? toNum(rows[tr][j]) : null;
    }
    return { contable, tecnicoArchivo, completos };
  }

  /* ---------------- Dashboard ---------------- */
  const REG_NOMBRE = { SC: "Santa Cruz", LP: "La Paz", CB: "Cochabamba", SR: "Chuquisaca", BN: "Beni", TJ: "Tarija", OR: "Oruro", PT: "Potosí", PN: "Pando" };
  function analizar(rows) {
    // Consolidación de pólizas con mismo número y contratante (recalcula importes)
    const campos = { pt: IDX.primaTotal, cob: IDX.cobrada, pxc: IDX.pxc, sin: IDX.sinMora, m1: IDX.m1, m2: IDX.m2, m3: IDX.m3, m4: IDX.m4, m5: IDX.m5, mora: IDX.totalMora, imp: IDX.impuestos, neto: IDX.neto, r1: IDX.r1, r2: IDX.r2, r3: IDX.r3, r4: IDX.r4, r5: IDX.r5, res: IDX.reserva };
    const pol = new Map();
    for (const r of rows) {
      const k = `${r[IDX.poliza]}|${norm(r[IDX.contratante])}`;
      let p = pol.get(k);
      if (!p) {
        p = { poliza: String(r[IDX.poliza] ?? ""), contratante: String(r[IDX.contratante] ?? "").trim(), regional: REG_NOMBRE[regCode(r[IDX.regional])], ramo: String(r[IDX.ramo]), dias: 0 };
        for (const c in campos) p[c] = 0;
        pol.set(k, p);
      }
      for (const [c, i] of Object.entries(campos)) p[c] += typeof r[i] === "number" ? r[i] : 0;
      const d = typeof r[IDX.diasMora] === "number" ? r[IDX.diasMora] : 0;
      if (d > p.dias) p.dias = d;
    }
    const polizas = [...pol.values()];
    const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
    const agrupar = (keyFn) => {
      const m = new Map();
      for (const p of polizas) {
        const k = keyFn(p);
        if (!m.has(k)) m.set(k, { nombre: k, pxc: 0, mora: 0, res: 0, imp: 0, dias: 0, regional: p.regional, regs: new Map(), n: 0 });
        const g = m.get(k); g.pxc += p.pxc; g.mora += p.mora; g.res += p.res; g.n++;
        g.regs.set(p.regional, (g.regs.get(p.regional) || 0) + p.pxc);
        if (p.dias > g.dias) g.dias = p.dias;
      }
      for (const g of m.values()) g.regional = [...g.regs.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return [...m.values()];
    };
    const T = { pxc: sum(polizas, "pxc"), mora: sum(polizas, "mora"), res: sum(polizas, "res"), imp: sum(polizas, "imp"), neto: sum(polizas, "neto"), sin: sum(polizas, "sin"),
      m: ["m1", "m2", "m3", "m4", "m5"].map((k) => sum(polizas, k)), r: ["r1", "r2", "r3", "r4", "r5"].map((k) => sum(polizas, k)) };
    const regionales = Object.values(REG_NOMBRE).map((nombre) => {
      const ps = polizas.filter((p) => p.regional === nombre);
      return { nombre, pxc: sum(ps, "pxc"), mora: sum(ps, "mora"), res: sum(ps, "res") };
    }).sort((a, b) => b.pxc - a.pxc);
    const clientes = agrupar((p) => p.contratante);
    const ramos = agrupar((p) => p.ramo).sort((a, b) => b.pxc - a.pxc);
    const pareto = (k) => {
      const tot = sum(clientes, k) || 1;
      const top = [...clientes].sort((a, b) => b[k] - a[k]).slice(0, 10);
      let acc = 0;
      return { top: top.map((c) => ({ ...c, valor: c[k], acum: (acc += c[k]) / tot })), share: acc / tot };
    };
    const max = polizas.reduce((a, p) => (p.dias > a.dias ? p : a), { dias: -1 });
    const empatados = polizas.filter((p) => p.dias === max.dias && p.contratante === max.contratante).length;
    return {
      registros: rows.length, nPolizas: polizas.length, nClientes: clientes.length, T, regionales, ramos,
      paretoPxc: pareto("pxc"), paretoRes: pareto("res"), paretoMora: pareto("mora"),
      topMora: [...clientes].sort((a, b) => b.mora - a.mora).slice(0, 6),
      topRes: [...clientes].sort((a, b) => b.res - a.res).slice(0, 6),
      maxMora: max, maxMoraEmpates: empatados,
    };
  }

  root.Core = {
    TIPO_CAMBIO_PREPAGA, FINAL_COLS, IDX, SISTEMAS, MESES, REG_NOMBRE, CONC_COLS,
    readWorkbook, sheetRows, procesarSistema, consolidar, libroConsolidado, leerConsolidadoFinal,
    anexoPorRamo, libroAnexoE, calcularConciliacion, libroConciliacion, leerRespuestaContabilidad, analizar, norm,
  };
})(typeof window !== "undefined" ? window : globalThis);
