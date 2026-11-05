using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using static CierrePxC.Core.Reglas;
using Color = DocumentFormat.OpenXml.Spreadsheet.Color;
using Font = DocumentFormat.OpenXml.Spreadsheet.Font;

namespace CierrePxC.Core;

public sealed record Periodo(int Mes, int Anio); // Mes: 0 = enero

public static class EscritorExcel
{
    private const string Azul = "0D2350", Suave = "DBE8F7", BordeColor = "9FB3D1";

    /* ================= Consolidado (hoja BASE) — escritura en flujo, rápida para ~70.000 filas ================= */
    public static byte[] LibroConsolidado(Consolidado c)
    {
        using var ms = new MemoryStream();
        using (var doc = SpreadsheetDocument.Create(ms, SpreadsheetDocumentType.Workbook))
        {
            var wbp = doc.AddWorkbookPart();
            var est = wbp.AddNewPart<WorkbookStylesPart>();
            est.Stylesheet = Estilos();
            est.Stylesheet.Save();
            var wsp = wbp.AddNewPart<WorksheetPart>();
            var ncol = c.Encabezado.Count;
            var esMonto = new bool[ncol]; foreach (var k in ColumnasMonto) esMonto[k] = true;
            var esFecha = new bool[ncol]; foreach (var k in ColumnasFecha) esFecha[k] = true;
            var ultima = c.Filas.Count + 2;
            var refFiltro = $"A1:{Letra(ncol - 1)}{c.Filas.Count + 1}";

            using (var w = OpenXmlWriter.Create(wsp))
            {
                w.WriteStartElement(new Worksheet());
                w.WriteStartElement(new SheetViews());
                w.WriteStartElement(new SheetView { WorkbookViewId = 0 });
                w.WriteElement(new Pane { VerticalSplit = 1, TopLeftCell = "A2", ActivePane = PaneValues.BottomLeft, State = PaneStateValues.Frozen });
                w.WriteEndElement(); w.WriteEndElement();
                w.WriteStartElement(new Columns());
                for (var i = 0; i < ncol; i++)
                {
                    double ancho = i == 3 ? 38 : i == 2 ? 26 : Math.Min(Math.Max(c.Encabezado[i].Length + 2, 11), 28);
                    w.WriteElement(new Column { Min = (uint)i + 1, Max = (uint)i + 1, Width = ancho, CustomWidth = true });
                }
                w.WriteEndElement();
                w.WriteStartElement(new SheetData());
                uint r = 1;
                FilaTexto(w, r++, c.Encabezado, 1);
                foreach (var f in c.Filas)
                {
                    w.WriteStartElement(new Row { RowIndex = r++ });
                    for (var j = 0; j < ncol; j++)
                    {
                        var v = f[j];
                        if (v is null) { w.WriteElement(new Cell()); continue; }
                        if (v is double d) CeldaNumero(w, d, esMonto[j] ? 2u : esFecha[j] ? 3u : 0u);
                        else CeldaTexto(w, Convert.ToString(v, CultureInfo.InvariantCulture)!, 0);
                    }
                    w.WriteEndElement();
                }
                // Fila TOTAL
                w.WriteStartElement(new Row { RowIndex = r });
                for (var j = 0; j < ncol; j++)
                {
                    if (j == 0) CeldaTexto(w, "TOTAL", 4);
                    else if (esMonto[j]) CeldaNumero(w, c.Filas.Sum(x => Num(x[j])), 5);
                    else w.WriteElement(new Cell { StyleIndex = 4 });
                }
                w.WriteEndElement();
                w.WriteEndElement(); // SheetData
                w.WriteElement(new AutoFilter { Reference = refFiltro });
                w.WriteEndElement(); // Worksheet
            }
            wbp.Workbook = new Workbook(
                new Sheets(new Sheet { Id = wbp.GetIdOfPart(wsp), SheetId = 1, Name = "BASE" }),
                new DefinedNames(new DefinedName($"BASE!$A$1:${Letra(ncol - 1)}${c.Filas.Count + 1}") { Name = "_xlnm._FilterDatabase", LocalSheetId = 0, Hidden = true }));
            wbp.Workbook.Save();
        }
        return ms.ToArray();
    }

    private static void FilaTexto(OpenXmlWriter w, uint fila, IEnumerable<string> valores, uint estilo)
    {
        w.WriteStartElement(new Row { RowIndex = fila });
        foreach (var v in valores) CeldaTexto(w, v, estilo);
        w.WriteEndElement();
    }

    private static void CeldaNumero(OpenXmlWriter w, double v, uint estilo)
    {
        var c = new Cell { StyleIndex = estilo == 0 ? null : estilo };
        w.WriteStartElement(c);
        w.WriteElement(new CellValue(v.ToString("R", CultureInfo.InvariantCulture)));
        w.WriteEndElement();
    }

    private static void CeldaTexto(OpenXmlWriter w, string v, uint estilo)
    {
        w.WriteStartElement(new Cell { DataType = CellValues.InlineString, StyleIndex = estilo == 0 ? null : estilo });
        w.WriteStartElement(new InlineString());
        w.WriteElement(new Text(Limpiar(v)) { Space = SpaceProcessingModeValues.Preserve });
        w.WriteEndElement();
        w.WriteEndElement();
    }

    /// <summary>Quita caracteres de control que no son válidos en XML.</summary>
    private static string Limpiar(string s)
    {
        if (s.All(ch => ch >= 0x20 || ch == '\t' || ch == '\n' || ch == '\r')) return s;
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s) if (ch >= 0x20 || ch == '\t' || ch == '\n' || ch == '\r') sb.Append(ch);
        return sb.ToString();
    }

    public static string Letra(int col)
    {
        var s = ""; col++;
        while (col > 0) { var m = (col - 1) % 26; s = (char)('A' + m) + s; col = (col - 1) / 26; }
        return s;
    }

    private static Stylesheet Estilos()
    {
        Border BordeFino() => new(
            new LeftBorder(new Color { Rgb = "FF" + BordeColor }) { Style = BorderStyleValues.Thin },
            new RightBorder(new Color { Rgb = "FF" + BordeColor }) { Style = BorderStyleValues.Thin },
            new TopBorder(new Color { Rgb = "FF" + BordeColor }) { Style = BorderStyleValues.Thin },
            new BottomBorder(new Color { Rgb = "FF" + BordeColor }) { Style = BorderStyleValues.Thin },
            new DiagonalBorder());
        Fill Solido(string rgb) => new(new PatternFill(new ForegroundColor { Rgb = "FF" + rgb }) { PatternType = PatternValues.Solid });
        return new Stylesheet(
            new NumberingFormats(new NumberingFormat { NumberFormatId = 164, FormatCode = "dd/mm/yyyy" }) { Count = 1 },
            new Fonts(
                new Font(new FontSize { Val = 11 }, new FontName { Val = "Calibri" }),
                new Font(new Bold(), new FontSize { Val = 10 }, new Color { Rgb = "FFFFFFFF" }, new FontName { Val = "Calibri" }),
                new Font(new Bold(), new FontSize { Val = 10 }, new FontName { Val = "Calibri" })) { Count = 3 },
            new Fills(new Fill(new PatternFill { PatternType = PatternValues.None }), new Fill(new PatternFill { PatternType = PatternValues.Gray125 }), Solido(Azul), Solido(Suave)) { Count = 4 },
            new Borders(new Border(new LeftBorder(), new RightBorder(), new TopBorder(), new BottomBorder(), new DiagonalBorder()), BordeFino()) { Count = 2 },
            new CellStyleFormats(new CellFormat { NumberFormatId = 0, FontId = 0, FillId = 0, BorderId = 0 }) { Count = 1 },
            new CellFormats(
                new CellFormat { NumberFormatId = 0, FontId = 0, FillId = 0, BorderId = 0, FormatId = 0 },
                new CellFormat(new Alignment { Horizontal = HorizontalAlignmentValues.Center, Vertical = VerticalAlignmentValues.Center, WrapText = true })
                { FontId = 1, FillId = 2, BorderId = 1, FormatId = 0, ApplyFont = true, ApplyFill = true, ApplyBorder = true, ApplyAlignment = true },
                new CellFormat { NumberFormatId = 4, FontId = 0, FillId = 0, BorderId = 0, FormatId = 0, ApplyNumberFormat = true },
                new CellFormat { NumberFormatId = 164, FontId = 0, FillId = 0, BorderId = 0, FormatId = 0, ApplyNumberFormat = true },
                new CellFormat { NumberFormatId = 0, FontId = 2, FillId = 3, BorderId = 1, FormatId = 0, ApplyFont = true, ApplyFill = true, ApplyBorder = true },
                new CellFormat { NumberFormatId = 4, FontId = 2, FillId = 3, BorderId = 1, FormatId = 0, ApplyFont = true, ApplyFill = true, ApplyBorder = true, ApplyNumberFormat = true }) { Count = 6 },
            new CellStyles(new CellStyle { Name = "Normal", FormatId = 0, BuiltinId = 0 }) { Count = 1 });
    }

    /* ================= Estilos ClosedXML (libros pequeños) ================= */
    private static readonly XLColor CAzul = XLColor.FromHtml("#" + Azul), CSuave = XLColor.FromHtml("#" + Suave), CBorde = XLColor.FromHtml("#" + BordeColor);

    private static IXLStyle Borde(IXLStyle s) { s.Border.OutsideBorder = XLBorderStyleValues.Thin; s.Border.OutsideBorderColor = CBorde; return s; }
    private static void Encabezado(IXLRange r)
    {
        r.Style.Font.Bold = true; r.Style.Font.FontColor = XLColor.White; r.Style.Font.FontSize = 10; r.Style.Fill.BackgroundColor = CAzul;
        r.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center; r.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center; r.Style.Alignment.WrapText = true;
        r.Style.Border.OutsideBorder = XLBorderStyleValues.Thin; r.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
        r.Style.Border.OutsideBorderColor = CBorde; r.Style.Border.InsideBorderColor = CBorde;
    }
    private static void Numero(IXLCell c) { c.Style.NumberFormat.Format = "#,##0.00"; Borde(c.Style); c.Style.Font.FontSize = 10; }
    private static void Total(IXLCell c) { Numero(c); c.Style.Font.Bold = true; c.Style.Fill.BackgroundColor = CSuave; }

    private static byte[] Guardar(XLWorkbook wb)
    {
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    /* ================= Anexo E (formato APS) ================= */
    public static byte[] LibroAnexoE(IEnumerable<object?[]> filas, Periodo p, string razonSocial, double tc)
    {
        var ramos = Motor.AnexoPorRamo(filas);
        var ultimoDia = DateTime.DaysInMonth(p.Anio, p.Mes + 1);
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("ANEXO E APS");
        ws.Cell("P1").Value = "Anexo E"; ws.Cell("P1").Style.Font.Bold = true; ws.Cell("P1").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Cell("P2").Value = tc; ws.Cell("P10").Value = tc;
        ws.Cell("A3").Value = razonSocial; ws.Cell("A3").Style.Font.Bold = true; ws.Cell("A3").Style.Font.FontColor = CAzul;
        void Titulo(string celda, string rango, string texto, bool grande)
        {
            ws.Cell(celda).Value = texto; ws.Range(rango).Merge();
            ws.Cell(celda).Style.Font.Bold = true; ws.Cell(celda).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            if (grande) { ws.Cell(celda).Style.Font.FontSize = 12; ws.Cell(celda).Style.Font.FontColor = CAzul; }
        }
        Titulo("A5", "A5:P5", "REPORTE DE PRIMAS POR COBRAR Y RESERVA PARA PRIMAS POR COBRAR", true);
        Titulo("A6", "A6:P6", "PÓLIZAS CON VIGENCIA DE UN AÑO Y SUPERIOR A UN AÑO", true);
        Titulo("A7", "A7:P7", $"Al {ultimoDia} de {Meses[p.Mes]} de {p.Anio}", false);
        Titulo("A8", "A8:P8", "(Cifras expresadas en bolivianos)", false);
        ws.Cell("A11").Value = "Ramos"; ws.Cell("B11").Value = "Primas por Cobrar"; ws.Cell("H11").Value = "Total Primas por Cobrar";
        ws.Cell("I11").Value = "Deducción Impuestos y Aportes"; ws.Cell("J11").Value = "Primas por Cobrar Neto de Impuestos";
        ws.Cell("K11").Value = "Reserva  para  Primas por Cobrar "; ws.Cell("P11").Value = " Total Reserva   Primas por Cobrar ";
        string[] t1 = { "Sin Mora", "1 a 15 días", "16 a 45 días", "46 a 60 días", "61 a 90 días", "Mayor a 90 días" };
        for (var i = 0; i < t1.Length; i++) ws.Cell(12, 2 + i).Value = t1[i];
        for (var i = 1; i < t1.Length; i++) ws.Cell(12, 10 + i).Value = t1[i];
        object[] numeracion = { 1, 2, 3, 4, 5, 6, 7, "8=2+3+5+6+7", 9, "10=9-8", 11, 12, 13, 14, 15, "16=11+12+13+14+15" };
        for (var i = 0; i < numeracion.Length; i++)
        {
            var c = ws.Cell(14, 1 + i);
            if (numeracion[i] is int n) c.Value = n; else c.Value = (string)numeracion[i];
            c.Style.Font.FontSize = 9; c.Style.Font.FontColor = XLColor.FromHtml("#5B7194"); c.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center; Borde(c.Style);
        }
        foreach (var m in new[] { "A11:A13", "B11:G11", "H11:H13", "I11:I13", "J11:J13", "K11:O11", "P11:P13", "B12:B13", "C12:C13", "D12:D13", "E12:E13", "F12:F13", "G12:G13", "K12:K13", "L12:L13", "M12:M13", "N12:N13", "O12:O13" })
            ws.Range(m).Merge();
        Encabezado(ws.Range("A11:P13"));
        var fila = 16;
        foreach (var (ramo, v) in ramos)
        {
            ws.Cell(fila, 1).Value = ramo; ws.Cell(fila, 1).Style.Font.Bold = true; Borde(ws.Cell(fila, 1).Style);
            for (var i = 0; i < v.Length; i++) { ws.Cell(fila, 2 + i).Value = v[i]; Numero(ws.Cell(fila, 2 + i)); }
            fila++;
        }
        ws.Cell(fila, 1).Value = "TOTAL"; Total(ws.Cell(fila, 1));
        for (var c = 2; c <= 16; c++) { var l = Letra(c - 1); ws.Cell(fila, c).FormulaA1 = $"SUM({l}16:{l}{fila - 1})"; Total(ws.Cell(fila, c)); }
        ws.Column(1).Width = 14; for (var c = 2; c <= 16; c++) ws.Column(c).Width = 16;
        ws.Row(12).Height = 30;
        return Guardar(wb);
    }

    /* ================= Conciliación de Primas por Cobrar (hoja PrimaXcobrar) ================= */
    public static byte[] LibroConciliacion(Motor.Conciliacion conc, Periodo p, IReadOnlyDictionary<string, double?>? contable)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("PrimaXcobrar");
        var cols = Motor.ColumnasConciliacion;
        ws.Cell("A2").Value = "Prima X Cobrar"; ws.Cell("B2").Value = $"Cierre {Meses[p.Mes]} {p.Anio}";
        for (var i = 0; i < cols.Length; i++) ws.Cell(2, 3 + i).Value = cols[i];
        ws.Cell("K2").Value = "TOTALES";
        Encabezado(ws.Range("A2:K2"));
        var etiquetas = new Dictionary<int, string>
        {
            [3] = "Saldo Inicial", [4] = "Producción", [5] = "Anulaciones", [6] = "Cobranza", [7] = "Ajustes por T/C", [8] = "Prima por cobrar",
            [9] = "Saldo Final (Contable)", [10] = "Saldo Técnico (Sistemas-Planillas de Control)",
        };
        foreach (var (r, t) in etiquetas) { ws.Cell(r, 2).Value = t; ws.Cell(r, 2).Style.Font.Bold = true; Borde(ws.Cell(r, 2).Style); }
        for (var r = 3; r <= 8; r++)
        {
            for (var i = 0; i < 8; i++) { ws.Cell(r, 3 + i).Value = 0; Numero(ws.Cell(r, 3 + i)); }
            ws.Cell(r, 11).FormulaA1 = $"SUM(C{r}:I{r})"; Numero(ws.Cell(r, 11));
        }
        for (var i = 0; i < 8; i++)
        {
            var l = Letra(2 + i);
            var c9 = ws.Cell(9, 3 + i);
            if (contable != null && contable.TryGetValue(cols[i], out var v) && v is double d) c9.Value = d;
            Numero(c9); c9.Style.Fill.BackgroundColor = XLColor.FromHtml("#FFF4E5");
            ws.Cell(10, 3 + i).FormulaA1 = $"SUM({l}11:{l}17)"; Total(ws.Cell(10, 3 + i));
        }
        ws.Cell("K9").FormulaA1 = "SUM(C9:I9)"; Total(ws.Cell("K9"));
        ws.Cell("K10").FormulaA1 = "SUM(K11:K17)"; Total(ws.Cell("K10"));
        for (var k = 0; k < Motor.FilasConciliacion.Length; k++)
        {
            var f = Motor.FilasConciliacion[k]; var r = 11 + k;
            ws.Cell(r, 2).Value = f; Borde(ws.Cell(r, 2).Style);
            for (var i = 0; i < cols.Length; i++) { ws.Cell(r, 3 + i).Value = conc.Resumen[f][cols[i]]; Numero(ws.Cell(r, 3 + i)); }
            ws.Cell(r, 11).FormulaA1 = $"SUM(C{r}:J{r})"; Numero(ws.Cell(r, 11));
        }
        ws.Cell("B18").Value = "Diferencias"; ws.Cell("B18").Style.Font.Bold = true; Borde(ws.Cell("B18").Style);
        ws.Cell("B19").Value = "Estado"; ws.Cell("B19").Style.Font.Bold = true; Borde(ws.Cell("B19").Style);
        for (var i = 0; i < 9; i++)
        {
            var l = Letra(2 + i);
            var c = ws.Cell(18, 3 + i); c.FormulaA1 = $"{l}9-{l}10"; Numero(c); c.Style.Font.Bold = true; c.Style.Font.FontColor = XLColor.FromHtml("#B42318");
            if (i < 8) { var e = ws.Cell(19, 3 + i); e.FormulaA1 = $"IF(ISBLANK({l}9),\"Pendiente\",IF(ABS({l}18)<=1,\"Ok\",\"Revisar\"))"; Borde(e.Style); }
        }
        // Detalle por fuente, ramo y regional
        ws.Cell("B21").Value = "DETALLE SALDO TÉCNICO POR FUENTE, RAMO Y REGIONAL"; ws.Cell("B21").Style.Font.Bold = true; ws.Cell("B21").Style.Font.FontColor = CAzul;
        ws.Cell("B22").Value = "Fuente / Ramo";
        for (var i = 0; i < Motor.Regionales.Length; i++) ws.Cell(22, 3 + i).Value = Motor.Regionales[i];
        ws.Cell("L22").Value = "Totales";
        Encabezado(ws.Range("B22:L22"));
        var fila = 23;
        foreach (var (clave, d) in conc.Detalle)
        {
            var partes = clave.Split('|');
            ws.Cell(fila, 1).Value = partes[0]; ws.Cell(fila, 2).Value = partes[1]; Borde(ws.Cell(fila, 1).Style); Borde(ws.Cell(fila, 2).Style);
            for (var i = 0; i < Motor.Regionales.Length; i++) { ws.Cell(fila, 3 + i).Value = d[Motor.Regionales[i]]; Numero(ws.Cell(fila, 3 + i)); }
            ws.Cell(fila, 12).FormulaA1 = $"SUM(C{fila}:K{fila})"; Total(ws.Cell(fila, 12));
            fila++;
        }
        ws.Column(1).Width = 26; ws.Column(2).Width = 44; for (var c = 3; c <= 12; c++) ws.Column(c).Width = 17;

        // Masivos por sponsor (equivale a la tabla dinámica de la hoja "masivo")
        var ws2 = wb.AddWorksheet("Masivos por Sponsor");
        ws2.Cell(1, 1).Value = "Sponsor / Ramo contable";
        for (var i = 0; i < Motor.Regionales.Length; i++) ws2.Cell(1, 2 + i).Value = Motor.Regionales[i];
        ws2.Cell(1, 11).Value = "Total general";
        Encabezado(ws2.Range(1, 1, 1, 11));
        var r2 = 2;
        foreach (var (sp, ramosSp) in conc.Sponsors)
        {
            ws2.Cell(r2, 1).Value = sp;
            double tot = 0;
            for (var i = 0; i < Motor.Regionales.Length; i++)
            {
                var v = ramosSp.Sum(x => x.PorRegional[Motor.Regionales[i]]); tot += v;
                ws2.Cell(r2, 2 + i).Value = v; Total(ws2.Cell(r2, 2 + i));
            }
            ws2.Cell(r2, 11).Value = tot; Total(ws2.Cell(r2, 11));
            r2++;
            foreach (var (rc, d) in ramosSp)
            {
                ws2.Cell(r2, 1).Value = "   " + rc;
                for (var i = 0; i < Motor.Regionales.Length; i++) { ws2.Cell(r2, 2 + i).Value = d[Motor.Regionales[i]]; Numero(ws2.Cell(r2, 2 + i)); }
                ws2.Cell(r2, 11).Value = d.Values.Sum(); Numero(ws2.Cell(r2, 11));
                r2++;
            }
        }
        ws2.Column(1).Width = 58; for (var c = 2; c <= 11; c++) ws2.Column(c).Width = 15;
        return Guardar(wb);
    }
}
