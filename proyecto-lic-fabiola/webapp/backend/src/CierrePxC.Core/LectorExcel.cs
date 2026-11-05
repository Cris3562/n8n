using System.Text;
using ExcelDataReader;

namespace CierrePxC.Core;

/// <summary>Hoja leída: filas como arreglos de valores (string, double o null). Las fechas se devuelven como número de serie de Excel.</summary>
public sealed record Hoja(string Nombre, List<object?[]> Filas);

/// <summary>Lectura rápida de .xlsx / .xls / .csv (sin cargar estilos).</summary>
public static class LectorExcel
{
    static LectorExcel() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    /// <param name="filtroHoja">Si se indica, solo lee las hojas cuyo nombre cumpla la condición (las demás se saltan sin cargar sus filas).</param>
    public static List<Hoja> Leer(Stream archivo, string nombreArchivo, Func<string, bool>? filtroHoja = null)
    {
        var esCsv = nombreArchivo.EndsWith(".csv", StringComparison.OrdinalIgnoreCase);
        using var reader = esCsv ? ExcelReaderFactory.CreateCsvReader(archivo) : ExcelReaderFactory.CreateReader(archivo);
        var hojas = new List<Hoja>();
        do
        {
            var nombre = reader.Name ?? $"Hoja{hojas.Count + 1}";
            if (filtroHoja != null && !filtroHoja(nombre)) continue;
            var filas = new List<object?[]>();
            while (reader.Read())
            {
                var n = reader.FieldCount;
                var fila = new object?[n];
                for (var i = 0; i < n; i++)
                {
                    var v = reader.GetValue(i);
                    fila[i] = v switch
                    {
                        null or DBNull => null,
                        DateTime dt => dt.ToOADate(),
                        TimeSpan ts => ts.TotalDays,
                        bool b => b ? "VERDADERO" : "FALSO",
                        double d => d,
                        int x => (double)x,
                        long x => (double)x,
                        decimal x => (double)x,
                        float x => (double)x,
                        string s => s,
                        _ => Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture),
                    };
                }
                filas.Add(fila);
            }
            hojas.Add(new Hoja(nombre, filas));
        } while (reader.NextResult());
        return hojas;
    }
}
