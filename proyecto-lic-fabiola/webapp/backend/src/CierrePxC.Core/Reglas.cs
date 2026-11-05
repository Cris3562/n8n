using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace CierrePxC.Core;

/// <summary>
/// Reglas de negocio de Nacional Seguros Vida y Salud (NSVS):
/// prompt "NSVS – Consolidación de planillas" + tabla HOMOLOGACION COLUMNAS.
/// </summary>
public static class Reglas
{
    public const double TipoCambioPrepagaPorDefecto = 6.86;

    /// <summary>Columnas finales (columna B de HOMOLOGACION COLUMNAS, tal como salen en el reporte APS).</summary>
    public static readonly string[] ColumnasFinales =
    {
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
    };

    public static int Col(string nombre) => Array.IndexOf(ColumnasFinales, nombre);

    // Índices de uso frecuente
    public const int Ramo = 0, Regional = 1, Poliza = 2, Contratante = 3, PrimaTotal = 7, Cobrada = 8, PxC = 9,
        SinMora = 10, M1 = 11, M2 = 12, M3 = 13, M4 = 14, M5 = 15, TotalMora = 16, PxC2 = 17, Impuestos = 18,
        Neto = 19, Anexo = 21, DiasMora = 22, R1 = 23, R2 = 24, R3 = 25, R4 = 26, R5 = 27, Reserva = 28,
        TipoCambio = 31, Sistema = 32, Sponsor = 42, RamoContable = 55;

    /// <summary>Columnas que se convierten a número.</summary>
    public static readonly HashSet<int> ColumnasNumericas = new()
    { 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 31, Col("Nro Renovacion") };

    /// <summary>Importes: se multiplican por el T/C en PREPAGA y se totalizan.</summary>
    public static readonly int[] ColumnasMonto = { 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 24, 25, 26, 27, 28 };
    public static readonly HashSet<int> ColumnasFecha = new() { 4, 5, 6 };

    public sealed record SistemaInfo(string Id, string Titulo);

    /// <summary>Orden de los sistemas en el consolidado.</summary>
    public static readonly SistemaInfo[] Sistemas =
    {
        new("MASIVOS", "Masivos (BI)"), new("ELIFE II", "ELIFE II"), new("SALUD", "ESALUD"),
        new("INMOTION", "INMOTION"), new("PREPAGA", "PREPAGA (en dólares)"),
    };

    private static string?[] Completar(params string?[] v)
    {
        var r = new string?[ColumnasFinales.Length];
        Array.Copy(v, r, v.Length);
        return r;
    }

    private static readonly string?[] Base29 =
    {
        "Ramo", "Regional", "\nPóliza", "\nContratante", "Fecha Emisión", "Inicio Vigencia", "Final Vigencia",
        "Prima Total", "Prima Total Cobrada  al corte", "Prima Total Por Cobrar", "Sin Mora", "1 a 15 días", "16 a 45 días",
        "46 a 60 días", "61 a 90 días", "más de 90 días", "Total Mora", "Prima Total Por Cobrar", "Impuestos (y aportes)",
        "DeudaNeta  de Impuesto", "Tipo Plan Pago Anexo / Prima", "Anexo\nNúmero", "Dias Mora", "1 a 15 días", "16 a 45 días",
        "46 a 60 días", "61 a 90 días", "mas de 90 días", "Reserva",
    };

    /// <summary>Nombres de origen por sistema (columnas D..H de HOMOLOGACION COLUMNAS), alineados con ColumnasFinales.</summary>
    public static readonly Dictionary<string, string?[]> Homologacion = new()
    {
        ["MASIVOS"] = Completar("Ramo", "Departamento", "Nro Poliza", "Nombre Contratante", "FechaEmision", "Inicio Vigencia", "Termino Vigencia",
            "Prom. Prima Total", "PrimaTotalCobrada", "PrimaTotalxCobrar", "SinMora", "1 a 15 dias", "16 a 45 dias", "46 a 60 dias",
            "61 a 90 dias", "Mas de 90 dias", "TotalMora", "PrimaTotalxCobrar1", "Impuestos", "DeudaNetaImpuestos", "Frecuencia Cobro",
            null, "Máx. NroDiasCalc", "1 a 15 dias.", "16 a 45 dias.", "46 a 60 dias.", "61 a 90 dias.", "Mas de 90 dias.", "TotalReserva",
            "Canal.", "MonedaPoliza", "TipoCambio JULIO 2026", null, "FechaProximaCuota", null, null, null, null, null, null, null, "Linea de Negocio", "Sponsor",
            null, null, "Producto", null, null, "Fila", "Fecha_Anulacion ", "Nro Renovacion", "Estado", "Estado_calc", "UltimaFechaPago", "Origen",
            "Ramo Contable (OT) (grupo)", null),
        ["ELIFE II"] = Completar("Ramo", "Regional", "\nPóliza", "\nContratante", "Fecha Emisión", "Inicio Vigencia", "Final Vigencia",
            "Prima\nTotal", "Prima\nTotal\nCobrada", "Prima Total Por Cobrar", "Sin Mora", "1 a 15 días", "16 a 45 días", "46 a 60 días",
            "61 a 90 días", "más de 90 días", "Total Mora", "Prima Total Por Cobrar", "Impuestos (y aportes)", "DeudaNeta  de Impuesto",
            "Tipo\nPoliza", "Anexo\nNumero", "Dias Mora", "1 a 15 días", "16 a 45 días", "46 a 60 días", "61 a 90 días", "mas de 90 días",
            "\nReserva", "Tipo Intermediario", "Moneda\nOrigen", "Tipo De Cambio", null, "Fecha Próximo Vencimiento Cuota",
            "Fecha Último Pago", "Fecha Vencimiento", "Monto Próximo Cuota", "Intermediario", "Teléfono/Celular", "Tipo Póliza",
            "Ejecutivo Asignado", "Línea de Negocio", "Sponsor"),
        ["SALUD"] = Completar(Base29.Concat(new string?[] { "Canal", "Moneda Póliza", "Tipo de Cambio" }).ToArray()),
        ["INMOTION"] = Completar("RAMO", "REGIONAL", "POLIZA", "CONTRATANTE", "FECHA_EMISION", "INICIO_VIGENCIA", "FINAL_VIGENCIA", "PRIMA_TOTAL",
            "PRIMA_TOT_COBRADA", "PRIMA_TOT_POR_COBRAR", "SIN_MORA", "MORA_1_15", "MORA_16_45", "MORA_46_60", "MORA_61_90", "MORA_MAYOR_90",
            "TOTAL_MORA", "PRIMA_TOT_POR_COBRAR", "IMPUESTOS", "DEUDA_NETA", null, "ANEXO", "DIAS_MORA", "RESERVA_1_15", "RESERVA_16_45",
            "RESERVA_46_60", "RESERVA_61_90", "RESERVA_90_DIAS", "TOT_RESERVA_POR_COBRAR", "CANAL", "MONEDA_DE_LA_POLIZA", "TIPO_CAMBIO", null,
            "PROX_VENCIMIENTO", "ULTIMA_FECHA_PAGO", "FECHA_VENCIMIENTO", "MTO_PROXIMA_CUOTA", "INTERMEDIARIO", null, null, null, "LINEA_NEGOCIO",
            "SPONSOR", "TIPO_DE_FACTURAS_PARA_COLECTIVOS", "TIPO_DE_DISTRIBUCION", "PRODUCTO", "FECHA_PAGO_PRORROG", "FORMA_PAGO",
            null, null, null, null, null, null, null, null, "RAMO_APS"),
        ["PREPAGA"] = Completar(Base29.Concat(new string?[] { null, null, "Tipo de Cambio" }).ToArray()),
    };

    /// <summary>Criterios 3 y 5 del prompt: homologación de descripciones de Ramo.</summary>
    public static readonly Dictionary<string, string> MapaRamo = new()
    {
        ["accidentes personales"] = "AP", ["ap"] = "AP",
        ["salud y/o enfermedad"] = "Salud", ["salud"] = "Salud",
        ["vida masivo"] = "VI", ["vi"] = "VI",
        ["dolares"] = "Dólares Americanos", ["dolares americanos"] = "Dólares Americanos",
    };

    public static readonly string[] OrdenRamosAps = { "AP", "DH", "VG", "SEPELIO", "Salud", "VI", "PREPAGA" };
    public static readonly string[] Meses = { "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre" };

    /* ---------------- Utilidades de texto y número ---------------- */
    private static readonly Regex Espacios = new(@"[\s_]+", RegexOptions.Compiled);
    private static readonly Regex NoAlfanum = new("[^a-z0-9]", RegexOptions.Compiled);

    public static string SinAcentos(string s)
    {
        var d = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(d.Length);
        foreach (var ch in d)
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    public static string Norm(object? v) => Espacios.Replace(SinAcentos(Convert.ToString(v, CultureInfo.InvariantCulture) ?? "").ToLowerInvariant(), " ").Trim();
    public static string Loose(object? v) => NoAlfanum.Replace(Norm(v), "");
    public static bool Vacio(object? v) => v is null || (v is string s && s.Trim().Length == 0);

    public static double? ANumero(object? v)
    {
        if (v is double d) return d;
        if (v is int i) return i;
        if (v is long l) return l;
        if (v is decimal m) return (double)m;
        if (Vacio(v)) return null;
        var s = Convert.ToString(v, CultureInfo.InvariantCulture)!.Trim().Replace(",", "");
        return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var r) && double.IsFinite(r) ? r : null;
    }

    public static double Num(object? v) => v is double d ? d : 0;
}
