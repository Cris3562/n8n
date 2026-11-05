using System.Text.RegularExpressions;
using static CierrePxC.Core.Reglas;

namespace CierrePxC.Core;

public sealed class ErrorDeArchivo(string mensaje) : Exception(mensaje);

public sealed record FechaCorte(int Dia, int Mes, int Anio); // Mes: 0 = enero

public sealed class ResultadoSistema
{
    public required string Sistema { get; init; }
    public required List<object?[]> Filas { get; init; }
    public required List<string> Extras { get; init; }
    public required List<object?[]> ValoresExtra { get; init; }
    public List<string> Avisos { get; init; } = new();
    public FechaCorte? Corte { get; init; }
    public double TotalPxC => Filas.Sum(f => Num(f[PxC]));
}

public sealed record TotalesSistema(string Sistema, int Filas, double PrimaTotal, double PxC, double SinMora, double TotalMora, double Impuestos, double Neto, double Reserva);

public sealed class Consolidado
{
    public required List<string> Encabezado { get; init; }
    public required List<object?[]> Filas { get; init; }
    public required List<TotalesSistema> Resumen { get; init; }
    public required TotalesSistema Totales { get; init; }
}

public static class Motor
{
    private static readonly Regex RxCorte = new(@"fecha\s+de\s+corte\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /* ================= Paso 1: leer y homologar cada sistema ================= */
    public static int BuscarFilaEncabezado(List<object?[]> filas)
    {
        for (var i = 0; i < Math.Min(filas.Count, 15); i++)
        {
            var n = filas[i].Select(Norm).ToList();
            if (n.Contains("ramo") && (n.Contains("regional") || n.Contains("departamento"))) return i;
        }
        return -1;
    }

    private sealed class Entrada { public int Fi; public string N = ""; public string L = ""; public bool Usada; }

    public static (int?[] mapa, List<string> faltantes) MapearColumnas(string sistema, object?[] encabezado)
    {
        var entradas = Homologacion[sistema].Select((src, fi) => (src, fi)).Where(x => x.src != null)
            .Select(x => new Entrada { Fi = x.fi, N = Norm(x.src), L = Loose(x.src) }).ToList();
        var mapa = new int?[encabezado.Length];
        // 1) coincidencia exacta normalizada, respetando el orden (columnas con nombre repetido)
        for (var j = 0; j < encabezado.Length; j++)
        {
            if (Vacio(encabezado[j])) continue;
            var n = Norm(encabezado[j]);
            var e = entradas.FirstOrDefault(x => !x.Usada && x.N == n);
            if (e != null) { e.Usada = true; mapa[j] = e.Fi; }
        }
        // 2) coincidencia flexible (ignora signos; o misma primera palabra larga, ej. "TipoCambio …")
        for (var j = 0; j < encabezado.Length; j++)
        {
            if (Vacio(encabezado[j]) || mapa[j] != null) continue;
            var l = Loose(encabezado[j]); var w = Norm(encabezado[j]).Split(' ')[0];
            var e = entradas.FirstOrDefault(x => !x.Usada && (x.L == l || (w.Length >= 8 && x.N.Split(' ')[0] == w)));
            if (e != null) { e.Usada = true; mapa[j] = e.Fi; }
        }
        var faltantes = entradas.Where(x => !x.Usada && new[] { Ramo, Poliza, Contratante, PxC }.Contains(x.Fi)).Select(x => ColumnasFinales[x.Fi]).ToList();
        return (mapa, faltantes);
    }

    public static object? HomologarRamo(object? v) => Vacio(v) ? v : MapaRamo.TryGetValue(Norm(v), out var r) ? r : v;

    /// <param name="tcPrepaga">Factor para PREPAGA (1 = dejar en dólares).</param>
    public static ResultadoSistema ProcesarSistema(string sistema, List<Hoja> hojas, double? tcPrepaga = null)
    {
        if (!Homologacion.ContainsKey(sistema)) throw new ErrorDeArchivo($"Sistema desconocido: {sistema}");
        List<object?[]>? filas = null; var hr = -1;
        foreach (var h in hojas)
        {
            var i = BuscarFilaEncabezado(h.Filas);
            if (i >= 0) { filas = h.Filas; hr = i; break; }
        }
        if (filas == null) throw new ErrorDeArchivo($"No se encontró la fila de encabezados (Ramo / Regional) en el archivo de {sistema}.");
        var encabezado = filas[hr];

        FechaCorte? corte = null;
        for (var i = 0; i < hr && corte == null; i++)
            foreach (var v in filas[i])
                if (v is string s && RxCorte.Match(s) is { Success: true } m)
                { corte = new FechaCorte(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value) - 1, int.Parse(m.Groups[3].Value)); break; }

        var (mapa, faltantes) = MapearColumnas(sistema, encabezado);
        if (faltantes.Count > 0) throw new ErrorDeArchivo($"En {sistema} faltan columnas: {string.Join(", ", faltantes)}. ¿Es el archivo correcto?");
        var idxExtra = Enumerable.Range(0, encabezado.Length).Where(j => mapa[j] == null && !Vacio(encabezado[j])).ToList();
        var extras = idxExtra.Select(j => Convert.ToString(encabezado[j])!.Trim()).ToList();
        var colPoliza = Array.IndexOf(mapa, (int?)Poliza);
        var factor = sistema == "PREPAGA" ? (tcPrepaga ?? TipoCambioPrepagaPorDefecto) : 1;

        var salida = new List<object?[]>(filas.Count);
        var valoresExtra = new List<object?[]>(filas.Count);
        for (var i = hr + 1; i < filas.Count; i++)
        {
            var src = filas[i];
            object? Val(int j) => j < src.Length ? src[j] : null;
            if (Vacio(Val(colPoliza))) continue; // filas de totales, pies de página y vacías
            var r = new object?[ColumnasFinales.Length];
            for (var j = 0; j < encabezado.Length; j++)
            {
                if (mapa[j] is not int fi) continue;
                var v = Val(j);
                if (v is string s && s.Trim().Length == 0) v = null;
                if (ColumnasNumericas.Contains(fi)) v = ANumero(v);
                r[fi] = v;
            }
            r[Ramo] = sistema == "PREPAGA" ? "PREPAGA" : HomologarRamo(r[Ramo]); // Criterio 4 (Prepaga)
            if (factor != 1) foreach (var k in ColumnasMonto) if (r[k] is double d) r[k] = d * factor;
            r[Sistema] = sistema; // Criterio 2
            salida.Add(r);
            valoresExtra.Add(idxExtra.Select(j => Vacio(Val(j)) ? null : Val(j)).ToArray());
        }
        var avisos = new List<string>();
        if (salida.Count == 0) avisos.Add($"El archivo de {sistema} no tiene filas con número de póliza.");
        return new ResultadoSistema { Sistema = sistema, Filas = salida, Extras = extras, ValoresExtra = valoresExtra, Avisos = avisos, Corte = corte };
    }

    /// <summary>Copia de PREPAGA con los importes en dólares convertidos a bolivianos.</summary>
    public static ResultadoSistema AplicarTC(ResultadoSistema res, double tc) => new()
    {
        Sistema = res.Sistema, Extras = res.Extras, ValoresExtra = res.ValoresExtra, Avisos = res.Avisos, Corte = res.Corte,
        Filas = res.Filas.Select(f => { var x = (object?[])f.Clone(); foreach (var k in ColumnasMonto) if (x[k] is double d) x[k] = d * tc; return x; }).ToList(),
    };

    /// <summary>Une todos los sistemas: columnas homogéneas + columnas no homologadas al final (Criterio 1).</summary>
    public static Consolidado Consolidar(IReadOnlyDictionary<string, ResultadoSistema> resultados)
    {
        var extraCols = new List<string>();
        foreach (var s in Sistemas)
            if (resultados.TryGetValue(s.Id, out var r)) foreach (var e in r.Extras) if (!extraCols.Contains(e)) extraCols.Add(e);
        var encabezado = ColumnasFinales.Concat(extraCols).ToList();
        var filas = new List<object?[]>();
        var resumen = new List<TotalesSistema>();
        foreach (var s in Sistemas)
        {
            if (!resultados.TryGetValue(s.Id, out var r)) continue;
            var pos = r.Extras.Select(e => ColumnasFinales.Length + extraCols.IndexOf(e)).ToArray();
            for (var i = 0; i < r.Filas.Count; i++)
            {
                var full = new object?[encabezado.Count];
                Array.Copy(r.Filas[i], full, ColumnasFinales.Length);
                for (var k = 0; k < pos.Length; k++) full[pos[k]] = r.ValoresExtra[i][k];
                filas.Add(full);
            }
            resumen.Add(Sumar(s.Id, r.Filas));
        }
        return new Consolidado { Encabezado = encabezado, Filas = filas, Resumen = resumen, Totales = Sumar("TOTAL", filas) };
    }

    public static TotalesSistema Sumar(string sistema, IReadOnlyCollection<object?[]> f) => new(sistema, f.Count,
        f.Sum(x => Num(x[PrimaTotal])), f.Sum(x => Num(x[PxC])), f.Sum(x => Num(x[SinMora])), f.Sum(x => Num(x[TotalMora])),
        f.Sum(x => Num(x[Impuestos])), f.Sum(x => Num(x[Neto])), f.Sum(x => Num(x[Reserva])));

    /* ================= Paso 3: leer el consolidado final (ajustado a mano) ================= */
    public static List<object?[]> LeerConsolidadoFinal(List<Hoja> hojas)
    {
        var hoja = hojas.FirstOrDefault(h => Norm(h.Nombre) == "base") ?? hojas.FirstOrDefault()
            ?? throw new ErrorDeArchivo("El archivo no tiene hojas.");
        var filas = hoja.Filas;
        var hr = BuscarFilaEncabezado(filas);
        if (hr < 0) throw new ErrorDeArchivo("No se encontró la hoja BASE con encabezados (Ramo, Regional…).");
        var enc = filas[hr].Select(h => Convert.ToString(h) ?? "").ToArray();
        var usadas = new HashSet<int>();
        var mapa = ColumnasFinales.Select(fc =>
        {
            var j = Enumerable.Range(0, enc.Length).FirstOrDefault(k => !usadas.Contains(k) && enc[k] == fc, -1);
            if (j < 0) j = Enumerable.Range(0, enc.Length).FirstOrDefault(k => !usadas.Contains(k) && Norm(enc[k]) == Norm(fc), -1);
            if (j >= 0) usadas.Add(j);
            return j;
        }).ToArray();
        if (mapa[PxC] < 0 || mapa[Ramo] < 0 || mapa[Contratante] < 0)
            throw new ErrorDeArchivo("El archivo no parece ser el reporte consolidado (faltan columnas Ramo / Contratante / Prima Total Por Cobrar).");
        var datos = new List<object?[]>();
        for (var i = hr + 1; i < filas.Count; i++)
        {
            var s = filas[i];
            object? Val(int j) => j >= 0 && j < s.Length ? s[j] : null;
            var ramo = Val(mapa[Ramo]);
            if (Vacio(ramo) || Norm(ramo) == "total") continue;
            if (Vacio(Val(mapa[Poliza])) && Vacio(Val(mapa[Contratante]))) continue;
            datos.Add(mapa.Select((j, fi) => ColumnasNumericas.Contains(fi) ? (object?)(ANumero(Val(j)) ?? 0) : Val(j)).ToArray());
        }
        return datos;
    }

    /* ================= Anexo E APS ================= */
    public static readonly int[] CamposAnexo = { SinMora, M1, M2, M3, M4, M5, PxC2, Impuestos, Neto, R1, R2, R3, R4, R5, Reserva };

    public static List<(string Ramo, double[] Valores)> AnexoPorRamo(IEnumerable<object?[]> filas)
    {
        var agg = new Dictionary<string, double[]>();
        var orden = new List<string>();
        foreach (var r in filas)
        {
            var k = Convert.ToString(r[Ramo]) ?? "";
            if (!agg.TryGetValue(k, out var a)) { a = new double[CamposAnexo.Length]; agg[k] = a; orden.Add(k); }
            for (var i = 0; i < CamposAnexo.Length; i++) a[i] += Num(r[CamposAnexo[i]]);
        }
        var claves = OrdenRamosAps.Where(agg.ContainsKey).Concat(orden.Where(k => !OrdenRamosAps.Contains(k)));
        return claves.Select(k => (k, agg[k])).ToList();
    }

    /* ================= Paso 2: Conciliación de Primas por Cobrar ================= */
    public static readonly string[] ColumnasConciliacion = { "VIDA INDIVIDUAL CORTO PLAZO", "VG", "DEF", "SL", "DH", "AP", "SL-PRE", "INMOTION" };
    public static readonly string[] FilasConciliacion = { "elife1; elife2; esalud", "Bec Seguro", "Bec Masivos", "BEC MANUAL", "BNB Senior - BNB Activa", "Banco Ganadero", "Masivos " };
    public static readonly string[] Regionales = { "SC", "LP", "CB", "SR", "BN", "TJ", "OR", "PT", "PN" };
    public static readonly Dictionary<string, string> NombreRegional = new()
    { ["SC"] = "Santa Cruz", ["LP"] = "La Paz", ["CB"] = "Cochabamba", ["SR"] = "Chuquisaca", ["BN"] = "Beni", ["TJ"] = "Tarija", ["OR"] = "Oruro", ["PT"] = "Potosí", ["PN"] = "Pando" };

    public static string CodigoRegional(object? v)
    {
        var n = Norm(v);
        if (n.StartsWith("santa")) return "SC";
        if (n.StartsWith("la paz")) return "LP";
        if (n.StartsWith("cocha")) return "CB";
        if (n.StartsWith("chuqui") || n.StartsWith("sucre")) return "SR";
        if (n.StartsWith("beni")) return "BN";
        if (n.StartsWith("tarija")) return "TJ";
        if (n.StartsWith("oruro")) return "OR";
        if (n.StartsWith("potos")) return "PT";
        if (n.StartsWith("pando")) return "PN";
        return "SC";
    }

    private static string ColumnaConciliacion(object?[] r)
    {
        var s = Convert.ToString(r[Sistema]); var ramo = Norm(r[Ramo]); var rc = Norm(r[RamoContable]);
        if (s == "PREPAGA") return "SL-PRE";
        if (s == "INMOTION") return "INMOTION";
        if (s == "SALUD") return "SL";
        if (s == "MASIVOS")
        {
            if (rc.StartsWith("vida")) return "VIDA INDIVIDUAL CORTO PLAZO";
            if (rc.StartsWith("defun") || rc.Contains("sepelio")) return "DEF";
            if (rc.StartsWith("accidentes")) return "AP";
            if (rc.StartsWith("salud")) return "SL";
        }
        return ramo switch
        {
            "vi" => "VIDA INDIVIDUAL CORTO PLAZO", "vg" => "VG", "sepelio" => "DEF", "dh" => "DH", "ap" => "AP", "salud" => "SL",
            _ => "VIDA INDIVIDUAL CORTO PLAZO",
        };
    }

    private static string FilaConciliacion(object?[] r, string col)
    {
        if (Convert.ToString(r[Sistema]) != "MASIVOS") return "elife1; elife2; esalud";
        var sp = Norm(r[Sponsor]);
        if (sp.Contains("banco economico")) return "Bec Masivos";
        if (sp.Contains("banco ganadero")) return "Banco Ganadero";
        if (sp.Contains("banco nacional de bolivia") && col != "VIDA INDIVIDUAL CORTO PLAZO") return "BNB Senior - BNB Activa";
        return "Masivos ";
    }

    public sealed class Conciliacion
    {
        public required Dictionary<string, Dictionary<string, double>> Resumen { get; init; }
        public required Dictionary<string, double> Tecnico { get; init; }
        public required SortedDictionary<string, Dictionary<string, double>> Detalle { get; init; }
        public required List<(string Sponsor, List<(string RamoContable, Dictionary<string, double> PorRegional)> Ramos)> Sponsors { get; init; }
    }

    private static Dictionary<string, double> CerosRegionales() => Regionales.ToDictionary(x => x, _ => 0.0);

    public static Conciliacion CalcularConciliacion(IEnumerable<object?[]> filas)
    {
        var resumen = FilasConciliacion.ToDictionary(f => f, _ => ColumnasConciliacion.ToDictionary(c => c, _ => 0.0));
        var detalle = new SortedDictionary<string, Dictionary<string, double>>(StringComparer.Ordinal);
        var sponsors = new List<(string, List<(string, Dictionary<string, double>)>)>();
        var idxSp = new Dictionary<string, int>();
        foreach (var r in filas)
        {
            var v = Num(r[PxC]);
            var col = ColumnaConciliacion(r); var fila = FilaConciliacion(r, col);
            resumen[fila][col] += v;
            var esMasivo = Convert.ToString(r[Sistema]) == "MASIVOS";
            var fuente = esMasivo ? $"MASIVOS · {fila.Trim()}" : Convert.ToString(r[Sistema])!;
            var reg = CodigoRegional(r[Regional]);
            var k = $"{fuente}|{col}";
            if (!detalle.TryGetValue(k, out var d)) detalle[k] = d = CerosRegionales();
            d[reg] += v;
            if (esMasivo)
            {
                var sp = Convert.ToString(r[Sponsor]) ?? "(sin sponsor)";
                var rc = Convert.ToString(r[RamoContable]) ?? Convert.ToString(r[Ramo]) ?? "";
                if (!idxSp.TryGetValue(sp, out var ix)) { ix = sponsors.Count; idxSp[sp] = ix; sponsors.Add((sp, new())); }
                var ramos = sponsors[ix].Item2;
                var e = ramos.FindIndex(x => x.Item1 == rc);
                if (e < 0) { ramos.Add((rc, CerosRegionales())); e = ramos.Count - 1; }
                ramos[e].Item2[reg] += v;
            }
        }
        var tecnico = ColumnasConciliacion.ToDictionary(c => c, c => FilasConciliacion.Sum(f => resumen[f][c]));
        var ordenados = sponsors.OrderByDescending(s => s.Item2.Sum(x => x.Item2.Values.Sum())).ToList();
        return new Conciliacion { Resumen = resumen, Tecnico = tecnico, Detalle = detalle, Sponsors = ordenados };
    }

    public sealed record RespuestaContabilidad(Dictionary<string, double?> Contable, Dictionary<string, double?> TecnicoArchivo, int Completos);

    /// <summary>Lee la fila "Saldo Final (Contable)" de la hoja PrimaXcobrar.</summary>
    public static RespuestaContabilidad LeerRespuestaContabilidad(List<Hoja> hojas)
    {
        var hoja = hojas.FirstOrDefault(h => Norm(h.Nombre) == "primaxcobrar")
            ?? throw new ErrorDeArchivo("No se encontró la hoja \"PrimaXcobrar\" en el archivo de Contabilidad.");
        int hr = -1, fr = -1, tr = -1;
        for (var i = 0; i < hoja.Filas.Count; i++)
        {
            var n = hoja.Filas[i].Select(Norm).ToList();
            if (hr < 0 && n.Contains("vida individual corto plazo") && n.Contains("dh")) hr = i;
            if (fr < 0 && n.Any(x => x.StartsWith("saldo final (contable)"))) fr = i;
            if (tr < 0 && n.Any(x => x.StartsWith("saldo tecnico"))) tr = i;
        }
        if (hr < 0 || fr < 0) throw new ErrorDeArchivo("No se encontró la fila \"Saldo Final (Contable)\" en la hoja PrimaXcobrar.");
        object? Celda(int f, int c) => f >= 0 && c >= 0 && c < hoja.Filas[f].Length ? hoja.Filas[f][c] : null;
        var contable = new Dictionary<string, double?>(); var tec = new Dictionary<string, double?>(); var completos = 0;
        foreach (var c in ColumnasConciliacion)
        {
            var j = Array.FindIndex(hoja.Filas[hr], h => Norm(h) == Norm(c));
            var v = ANumero(Celda(fr, j));
            contable[c] = v; if (v != null) completos++;
            tec[c] = tr >= 0 ? ANumero(Celda(tr, j)) : null;
        }
        return new RespuestaContabilidad(contable, tec, completos);
    }
}
