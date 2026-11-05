import { Analisis, MESES, Periodo } from '../servicios/api.service';

/* ---------- Formatos ---------- */
export const fmt = (n: number | null | undefined, d = 2) => (n ?? 0).toLocaleString('es-BO', { minimumFractionDigits: d, maximumFractionDigits: d });
export const MMn = (n: number) => (n / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const MM = (n: number) => MMn(n) + ' MM Bs.';
export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
export const ent = (n: number) => n.toLocaleString('en-US');
export const bs = (n: number) => (Math.abs(n) >= 1e5 ? MM(n) : 'Bs ' + fmt(n));
export const TRAMOS = ['1 a 15 días', '16 a 45 días', '46 a 60 días', '61 a 90 días', 'Mayor a 90 días'];

/** Nombre corto de un contratante para gráficos y tablas. */
export function corto(s: string, n = 16) {
  const t = String(s).toUpperCase()
    .replace(/COOPERATIVA DE AHORRO Y CR[EÉ]DITO( ABIERTA)?/g, 'COOP.').replace(/SOCIEDAD AN[OÓ]NIMA/g, 'S.A.')
    .replace(/BANCO NACIONAL DE BOLIVIA/g, 'BNB').replace(/BANCO /g, 'BCO. ').replace(/ASOCIACI[OÓ]N /g, 'ASOC. ')
    .replace(/MINISTERIO DE /g, 'MIN. ').replace(/[“”"]/g, '').trim();
  return t.length > n ? t.slice(0, n - 1).trim() + '…' : t;
}

/** Lectura ejecutiva y recomendaciones: plantillas que se completan con los números del cierre. */
export function textos(A: Analisis) {
  const T = A.T, R = A.regionales, ramos = [...A.ramos].sort((a, b) => b.mora - a.mora);
  const r0 = R[0], rm = ramos[0];
  const regMora = [...R].sort((a, b) => b.mora - a.mora);
  const top3 = A.topMora.slice(0, 3);
  const m3 = top3.reduce((s, c) => s + c.mora, 0), res3 = top3.reduce((s, c) => s + c.res, 0);
  const m90 = T.m[4], r90 = T.r[4];
  const lectura = [
    `Cartera consolidada: ${MM(T.pxc)} por cobrar, ${MM(T.mora)} en mora y ${MM(T.res)} en reserva.`,
    `${r0.nombre} concentra ${pct(r0.pxc, T.pxc)} de la cartera, ${pct(r0.mora, T.mora)} de la mora y ${pct(r0.res, T.res)} de la reserva.`,
    `El ramo ${rm.nombre} reúne ${pct(rm.mora, T.mora)} de la mora total y ${pct(rm.res, T.res)} de la reserva.`,
    `La mora mayor a 90 días asciende a ${MM(m90)} (${pct(m90, T.mora)} de la mora), con cobertura de ${pct(r90, m90)}.`,
    `Se consolidaron ${ent(A.registros)} registros en ${ent(A.nPolizas)} pólizas por número + contratante, sin alterar los importes totales.`,
  ];
  const recs = [
    `Priorizar ${top3.map((c) => corto(c.nombre, 22)).join(', ')}: concentran ${MM(m3)} de mora (${pct(m3, T.mora)}) y ${MM(res3)} de reserva (${pct(res3, T.res)}).`,
    `Definir plan de acción para el ramo ${rm.nombre}: mora de ${MM(rm.mora)}, equivalente al ${pct(rm.mora, rm.pxc)} de su cartera.`,
    `Focalizar ${regMora[0].nombre} y ${regMora[1].nombre}, que explican ${pct(regMora[0].mora + regMora[1].mora, T.mora)} de la mora total.`,
    `Revisar jurídica y contablemente la cartera mayor a 90 días; alcanza ${MM(m90)} y absorbe ${pct(r90, T.res)} de la reserva.`,
    `Regularizar las cuentas con hasta ${ent(A.maxMora.dias)} días de mora y definir recupero, castigo o conciliación documental con responsables y fechas.`,
    `Monitorear semanalmente el Top 10 de clientes y separar la gestión preventiva de la cartera sin mora de la gestión intensiva vencida.`,
  ];
  return { lectura, recs };
}

export async function logoDataUrl(): Promise<string> {
  const blob = await (await fetch('logo.png')).blob();
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
}

/* ---------- PDF de una hoja (captura del dashboard) ---------- */
export async function generarPdf(elemento: HTMLElement, nombre: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const canvas = await html2canvas(elemento, { scale: 2, backgroundColor: '#F2F8FE', logging: false, windowWidth: 2120 });
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const W = 297, H = 210, m = 5;
  const k = Math.min((W - 2 * m) / canvas.width, (H - 2 * m) / canvas.height);
  const w = canvas.width * k, h = canvas.height * k;
  pdf.setFillColor(242, 248, 254); pdf.rect(0, 0, W, H, 'F');
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
  pdf.save(nombre);
}

/* ---------- PowerPoint con gráficos editables ---------- */
export async function generarPptx(A: Analisis, P: Periodo, empresa: { nombre: string; codigo: string }) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const LOGO = await logoDataUrl();
  const T = A.T, tx = textos(A), mx = A.maxMora;
  const mesTxt = `${MESES[P.mes]} ${P.anio}`;
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `Informe Ejecutivo Gerencial – Primas por Cobrar y Reservas ${mesTxt}`;
  const NAVY = '0D2350', BLUE = '1565D8', OR = 'F36A10', MUT = '5B7194', SOFT = 'F2F8FE', FONT = 'Montserrat';
  const header = (s: any, titulo: string, etiqueta?: string) => {
    s.background = { color: 'FFFFFF' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: NAVY } });
    s.addText(titulo, { x: 0.45, y: 0.12, w: 10.5, h: 0.45, fontFace: FONT, fontSize: 20, bold: true, color: 'FFFFFF' });
    s.addText(`${empresa.nombre} · Cierre ${mesTxt} · Cifras en MM Bs.`, { x: 0.45, y: 0.52, w: 10.5, h: 0.3, fontFace: FONT, fontSize: 10.5, color: 'C9D8F0' });
    s.addShape(pptx.ShapeType.roundRect, { x: 11.05, y: 0.16, w: 1.95, h: 0.58, fill: { color: 'FFFFFF' }, rectRadius: 0.08 });
    s.addImage({ data: LOGO, x: 11.15, y: 0.21, w: 1.75, h: 0.49 });
    if (etiqueta) {
      s.addShape(pptx.ShapeType.rect, { x: 0.45, y: 1.12, w: 0.35, h: 0.05, fill: { color: OR } });
      s.addText(etiqueta.toUpperCase(), { x: 0.88, y: 1.0, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: OR, charSpacing: 3 });
    }
    s.addText(`Cierre de Reservas y Primas por Cobrar · Área Cobranzas · ${empresa.nombre}`, { x: 0.45, y: 7.1, w: 8, h: 0.25, fontFace: FONT, fontSize: 8, color: MUT });
  };
  type Fila = (string | number)[] & { tot?: boolean };
  const tabla = (s: any, head: string[], rows: Fila[], opt: { x: number; y: number; w: number; colW: number[]; numFrom: number; fs?: number; rowH?: number }) => {
    const H = head.map((t, i) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i ? 'right' : 'left' } }));
    const B = rows.map((r, k) => r.map((t, i) => ({ text: String(t), options: { align: i && opt.numFrom <= i ? 'right' : 'left', fill: { color: r.tot ? 'DBE8F7' : k % 2 ? 'FAFCFF' : 'FFFFFF' }, bold: !!r.tot } })));
    s.addTable([H, ...B], { x: opt.x, y: opt.y, w: opt.w, colW: opt.colW, fontFace: FONT, fontSize: opt.fs || 10, color: NAVY, border: { type: 'solid', pt: 0.5, color: 'DBE8F7' }, rowH: opt.rowH || 0.3, autoPage: false });
  };
  const tot = (arr: Fila) => { arr.tot = true; return arr; };
  const m2 = (v: number) => (v / 1e6).toFixed(2);

  // 1. Portada
  let s: any = pptx.addSlide();
  s.background = { color: NAVY };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.6, w: 13.33, h: 1.9, fill: { color: '0B4FC0', transparency: 30 } });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.7, y: 0.6, w: 3.0, h: 0.95, fill: { color: 'FFFFFF' }, rectRadius: 0.1 });
  s.addImage({ data: LOGO, x: 0.85, y: 0.7, w: 2.7, h: 0.76 });
  s.addShape(pptx.ShapeType.rect, { x: 0.7, y: 2.45, w: 0.5, h: 0.06, fill: { color: OR } });
  s.addText('ÁREA COBRANZAS', { x: 1.3, y: 2.3, w: 6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: 'FFA23F', charSpacing: 4 });
  s.addText([{ text: 'Informe Ejecutivo Gerencial\n', options: { color: 'FFFFFF' } }, { text: 'Primas por Cobrar y Reservas', options: { color: '4AA0F7' } }],
    { x: 0.7, y: 2.75, w: 11.5, h: 1.6, fontFace: FONT, fontSize: 38, bold: true, valign: 'top' });
  s.addText(`${empresa.nombre} · Cierre ${mesTxt} · Moneda Nacional (MM Bs.)`, { x: 0.7, y: 4.5, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 15, color: 'C9D8F0' });

  // 2. Indicadores + lectura
  s = pptx.addSlide(); header(s, 'Indicadores clave', 'Resumen ejecutivo');
  const kp: [string, string, string, string][] = [
    ['PRIMAS POR COBRAR', MM(T.pxc), `${ent(A.nPolizas)} pólizas | ${ent(A.nClientes)} clientes`, BLUE],
    ['MORA TOTAL', MM(T.mora), `Mora vs PxC: ${pct(T.mora, T.pxc)}`, OR],
    ['RESERVA TOTAL', MM(T.res), `Cobertura de mora: ${pct(T.res, T.mora)}`, BLUE],
    ['MAYOR MORA', `${ent(mx.dias)} días`, corto(mx.contratante, 28), OR],
    ['MORA > 90 DÍAS', MM(T.m[4]), `${pct(T.m[4], T.mora)} del total mora`, OR],
    ['DEUDA NETA DE IMPUESTOS', MM(T.neto), `Impuestos y aportes: ${MM(T.imp)}`, BLUE],
    ['TOP 10 RESERVA', pct(A.paretoRes.share, 1), 'Concentración de reserva', BLUE],
  ];
  kp.forEach((k, i) => {
    const x = 0.45 + (i % 4) * 3.12, y = 1.45 + Math.floor(i / 4) * 1.45;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 2.95, h: 1.28, fill: { color: SOFT }, line: { color: 'DBE8F7' } });
    s.addShape(pptx.ShapeType.rect, { x, y, w: 2.95, h: 0.07, fill: { color: k[3] } });
    s.addText(k[0], { x: x + 0.15, y: y + 0.15, w: 2.7, h: 0.25, fontFace: FONT, fontSize: 8.5, bold: true, color: MUT });
    s.addText(k[1], { x: x + 0.15, y: y + 0.42, w: 2.7, h: 0.45, fontFace: FONT, fontSize: 19, bold: true, color: NAVY });
    s.addText(k[2], { x: x + 0.15, y: y + 0.9, w: 2.7, h: 0.28, fontFace: FONT, fontSize: 8.5, color: MUT });
  });
  s.addText('LECTURA EJECUTIVA', { x: 0.45, y: 4.5, w: 6, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: NAVY });
  s.addText(tx.lectura.map((t) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: true } })), { x: 0.45, y: 4.85, w: 12.4, h: 2.15, fontFace: FONT, fontSize: 11, color: NAVY, valign: 'top', paraSpaceAfter: 5 });

  // 3. Regional + ramo
  s = pptx.addSlide(); header(s, 'Cartera por regional y por ramo', 'Todas las regionales');
  const filas5 = (arr: { nombre: string; pxc: number; mora: number; res: number }[]): Fila[] => arr.map((r) => [r.nombre, m2(r.pxc), m2(r.mora), m2(r.res), pct(r.mora, r.pxc)]);
  const totF = tot(['TOTAL', m2(T.pxc), m2(T.mora), m2(T.res), pct(T.mora, T.pxc)]);
  tabla(s, ['Regional', 'PxC', 'Mora', 'Reserva', '% Mora'], [...filas5(A.regionales), totF], { x: 0.45, y: 1.45, w: 6.1, colW: [1.9, 1.1, 1.1, 1.1, 0.9], numFrom: 1, rowH: 0.42 });
  tabla(s, ['Ramo', 'PxC', 'Mora', 'Reserva', '% Mora'], [...filas5(A.ramos), totF], { x: 6.8, y: 1.45, w: 6.1, colW: [1.9, 1.1, 1.1, 1.1, 0.9], numFrom: 1, rowH: 0.42 });
  s.addText('Cifras en MM Bs.', { x: 0.45, y: 6.75, w: 4, h: 0.25, fontFace: FONT, fontSize: 8, italic: true, color: MUT });

  // 4-6. Paretos
  const paretoSlide = (p: Analisis['paretoPxc'], titulo: string, etiqueta: string) => {
    const sl: any = pptx.addSlide(); header(sl, titulo, etiqueta);
    const labels = p.top.map((c) => corto(c.nombre, 18));
    sl.addChart([
      { type: pptx.ChartType.bar, data: [{ name: 'MM Bs.', labels, values: p.top.map((c) => +(c.valor / 1e6).toFixed(2)) }], options: { chartColors: [NAVY], barGapWidthPct: 60, showValue: true, dataLabelFontSize: 9, dataLabelColor: NAVY, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.00' } },
      { type: pptx.ChartType.line, data: [{ name: '% acumulado', labels, values: p.top.map((c) => +(c.acum * 100).toFixed(1)) }], options: { chartColors: [OR], lineSize: 2, lineDataSymbolSize: 7, secondaryValAxis: true, secondaryCatAxis: true } },
    ] as any, { x: 0.45, y: 1.4, w: 12.4, h: 5.3, fontFace: FONT, catAxisLabelFontSize: 9, catAxisLabelRotate: -35, valAxisLabelFontSize: 9, showLegend: true, legendPos: 't', legendFontSize: 10,
      valAxes: [{ showValAxisTitle: true, valAxisTitle: 'MM Bs.', valAxisTitleFontSize: 9 }, { showValAxisTitle: true, valAxisTitle: '% acumulado', valAxisTitleFontSize: 9, valAxisMaxVal: 100, valAxisMinVal: 0 }],
      catAxes: [{ catAxisTitle: '' }, { catAxisHidden: true }] } as any);
    sl.addText(`Top 10 = ${(p.share * 100).toFixed(1)}% del total`, { x: 9.2, y: 1.0, w: 3.7, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: OR, align: 'right' });
  };
  paretoSlide(A.paretoPxc, 'Pareto de clientes – Primas por cobrar', 'Concentración de cartera');
  paretoSlide(A.paretoRes, 'Pareto de clientes – Reserva', 'Concentración de reserva');
  paretoSlide(A.paretoMora, 'Pareto de clientes – Mora', 'Concentración de mora');

  // 7. Top 6 + cuenta mayor mora
  s = pptx.addSlide(); header(s, 'Mora y reserva por contratante y regional', 'Top 6');
  tabla(s, ['Contratante', 'Regional', 'PxC', 'Mora', 'Días máx.'], A.topMora.map((c) => [corto(c.nombre, 38), c.regional, m2(c.pxc), m2(c.mora), ent(c.dias)]),
    { x: 0.45, y: 1.45, w: 8.2, colW: [3.6, 1.4, 1.1, 1.1, 1.0], numFrom: 2, fs: 9.5, rowH: 0.36 });
  tabla(s, ['Contratante', 'Regional', 'Reserva', 'Mora', 'Cobertura'], A.topRes.map((c) => [corto(c.nombre, 38), c.regional, m2(c.res), m2(c.mora), pct(c.res, c.mora)]),
    { x: 0.45, y: 4.3, w: 8.2, colW: [3.6, 1.4, 1.1, 1.1, 1.0], numFrom: 2, fs: 9.5, rowH: 0.36 });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.95, y: 1.45, w: 3.95, h: 5.3, fill: { color: 'FFF6EE' }, line: { color: OR, width: 2 }, rectRadius: 0.1 });
  s.addText('CUENTA CON MAYOR DÍAS DE MORA', { x: 9.1, y: 1.6, w: 3.65, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: NAVY, align: 'center' });
  s.addText(`${ent(mx.dias)} días`, { x: 9.1, y: 2.0, w: 3.65, h: 0.7, fontFace: FONT, fontSize: 32, bold: true, color: OR, align: 'center' });
  s.addText([
    { text: 'Cliente: ', options: { bold: true } }, { text: mx.contratante, options: { breakLine: true } },
    { text: 'Póliza: ', options: { bold: true } }, { text: mx.poliza, options: { breakLine: true } },
    { text: 'Regional / Ramo: ', options: { bold: true } }, { text: `${mx.regional} / ${mx.ramo}`, options: { breakLine: true } },
    { text: 'Mora / Reserva: ', options: { bold: true } }, { text: `${bs(mx.mora)} / ${bs(mx.res)}` },
  ], { x: 9.15, y: 2.85, w: 3.6, h: 3.6, fontFace: FONT, fontSize: 11, color: NAVY, valign: 'top', paraSpaceAfter: 8 });

  // 8. Tramos
  s = pptx.addSlide(); header(s, 'Mora y reserva por antigüedad', 'Tramos de mora');
  s.addChart(pptx.ChartType.bar, [
    { name: 'Mora', labels: TRAMOS, values: T.m.map((v) => +(v / 1e6).toFixed(2)) },
    { name: 'Reserva', labels: TRAMOS, values: T.r.map((v) => +(v / 1e6).toFixed(2)) }],
    { x: 0.45, y: 1.4, w: 7.2, h: 5.3, chartColors: [NAVY, OR], barGapWidthPct: 50, showValue: true, dataLabelFontSize: 9, dataLabelFormatCode: '0.00', showLegend: true, legendPos: 't', fontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, showValAxisTitle: true, valAxisTitle: 'MM Bs.' } as any);
  tabla(s, ['Tramo', 'Mora', '% Part.', 'Reserva', 'Cobertura'], [...TRAMOS.map((t, i): Fila => [t, m2(T.m[i]), pct(T.m[i], T.mora), m2(T.r[i]), pct(T.r[i], T.m[i])]), tot(['Total Mora', m2(T.mora), '100.0%', m2(T.res), pct(T.res, T.mora)])],
    { x: 7.9, y: 1.6, w: 5.0, colW: [1.5, 0.9, 0.85, 0.9, 0.85], numFrom: 1, fs: 9.5, rowH: 0.42 });
  s.addText(`Sin mora: ${MM(T.sin)}.`, { x: 7.9, y: 4.9, w: 5, h: 0.3, fontFace: FONT, fontSize: 9, italic: true, color: MUT });

  // 9. Conclusiones
  s = pptx.addSlide(); header(s, 'Conclusiones y recomendaciones gerenciales', 'Plan de acción');
  s.addText(tx.recs.map((t) => ({ text: t, options: { bullet: { type: 'number' }, breakLine: true } })), { x: 0.6, y: 1.5, w: 12.1, h: 5.4, fontFace: FONT, fontSize: 14, color: NAVY, valign: 'top', paraSpaceAfter: 12 });

  await pptx.writeFile({ fileName: `Informe Ejecutivo Gerencial Primas y Reservas ${empresa.codigo} ${mesTxt}.pptx` });
}
