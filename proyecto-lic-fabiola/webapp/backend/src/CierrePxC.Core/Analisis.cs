using System.Text.Json.Serialization;
using static CierrePxC.Core.Reglas;

namespace CierrePxC.Core;

/* ---- Resultado del análisis (se envía tal cual al dashboard) ---- */
public sealed class TotalesCartera
{
    public double Pxc { get; set; }
    public double Mora { get; set; }
    public double Res { get; set; }
    public double Imp { get; set; }
    public double Neto { get; set; }
    public double Sin { get; set; }
    public double[] M { get; set; } = new double[5];
    public double[] R { get; set; } = new double[5];
}

public sealed class Grupo
{
    public string Nombre { get; set; } = "";
    public double Pxc { get; set; }
    public double Mora { get; set; }
    public double Res { get; set; }
    public double Dias { get; set; }
    public string Regional { get; set; } = "";
    public int N { get; set; }
    public double Valor { get; set; }
    public double Acum { get; set; }
    [JsonIgnore] public Dictionary<string, double> Regs { get; } = new();
}

public sealed class Pareto
{
    public List<Grupo> Top { get; set; } = new();
    public double Share { get; set; }
}

public sealed class PolizaConsolidada
{
    public string Poliza { get; set; } = "";
    public string Contratante { get; set; } = "";
    public string Regional { get; set; } = "";
    public string Ramo { get; set; } = "";
    public double Dias { get; set; }
    public double Pxc { get; set; }
    public double Mora { get; set; }
    public double Res { get; set; }
    [JsonIgnore] public double Imp, Neto, Sin;
    [JsonIgnore] public double[] M = new double[5], R = new double[5];
}

public sealed class ResultadoAnalisis
{
    public int Registros { get; set; }
    public int NPolizas { get; set; }
    public int NClientes { get; set; }
    [JsonPropertyName("T")] public TotalesCartera T { get; set; } = new();
    public List<Grupo> Regionales { get; set; } = new();
    public List<Grupo> Ramos { get; set; } = new();
    public Pareto ParetoPxc { get; set; } = new();
    public Pareto ParetoRes { get; set; } = new();
    public Pareto ParetoMora { get; set; } = new();
    public List<Grupo> TopMora { get; set; } = new();
    public List<Grupo> TopRes { get; set; } = new();
    public PolizaConsolidada MaxMora { get; set; } = new();
    public int MaxMoraEmpates { get; set; }
}

public static class Analisis
{
    /// <summary>Análisis gerencial: consolida pólizas con mismo número y contratante y recalcula los importes.</summary>
    public static ResultadoAnalisis Analizar(IReadOnlyList<object?[]> filas)
    {
        var pol = new Dictionary<string, PolizaConsolidada>();
        var orden = new List<PolizaConsolidada>();
        foreach (var r in filas)
        {
            var k = $"{Convert.ToString(r[Poliza], System.Globalization.CultureInfo.InvariantCulture)}|{Norm(r[Contratante])}";
            if (!pol.TryGetValue(k, out var p))
            {
                p = new PolizaConsolidada
                {
                    Poliza = Convert.ToString(r[Poliza], System.Globalization.CultureInfo.InvariantCulture) ?? "",
                    Contratante = (Convert.ToString(r[Contratante]) ?? "").Trim(),
                    Regional = Motor.NombreRegional[Motor.CodigoRegional(r[Regional])],
                    Ramo = Convert.ToString(r[Ramo]) ?? "",
                };
                pol[k] = p; orden.Add(p);
            }
            p.Pxc += Num(r[PxC]); p.Mora += Num(r[TotalMora]); p.Res += Num(r[Reserva]);
            p.Imp += Num(r[Impuestos]); p.Neto += Num(r[Neto]); p.Sin += Num(r[SinMora]);
            int[] m = { M1, M2, M3, M4, M5 }, rr = { R1, R2, R3, R4, R5 };
            for (var i = 0; i < 5; i++) { p.M[i] += Num(r[m[i]]); p.R[i] += Num(r[rr[i]]); }
            var d = Num(r[DiasMora]);
            if (d > p.Dias) p.Dias = d;
        }

        List<Grupo> Agrupar(Func<PolizaConsolidada, string> clave)
        {
            var g = new Dictionary<string, Grupo>(); var lista = new List<Grupo>();
            foreach (var p in orden)
            {
                var k = clave(p);
                if (!g.TryGetValue(k, out var x)) { x = new Grupo { Nombre = k, Regional = p.Regional }; g[k] = x; lista.Add(x); }
                x.Pxc += p.Pxc; x.Mora += p.Mora; x.Res += p.Res; x.N++;
                x.Regs[p.Regional] = (x.Regs.TryGetValue(p.Regional, out var v) ? v : 0) + p.Pxc;
                if (p.Dias > x.Dias) x.Dias = p.Dias;
            }
            foreach (var x in lista) x.Regional = x.Regs.OrderByDescending(e => e.Value).First().Key;
            return lista;
        }

        var T = new TotalesCartera
        {
            Pxc = orden.Sum(p => p.Pxc), Mora = orden.Sum(p => p.Mora), Res = orden.Sum(p => p.Res),
            Imp = orden.Sum(p => p.Imp), Neto = orden.Sum(p => p.Neto), Sin = orden.Sum(p => p.Sin),
            M = Enumerable.Range(0, 5).Select(i => orden.Sum(p => p.M[i])).ToArray(),
            R = Enumerable.Range(0, 5).Select(i => orden.Sum(p => p.R[i])).ToArray(),
        };
        var regionales = Motor.NombreRegional.Values.Select(nombre =>
        {
            var ps = orden.Where(p => p.Regional == nombre).ToList();
            return new Grupo { Nombre = nombre, Pxc = ps.Sum(p => p.Pxc), Mora = ps.Sum(p => p.Mora), Res = ps.Sum(p => p.Res) };
        }).OrderByDescending(x => x.Pxc).ToList();
        var clientes = Agrupar(p => p.Contratante);
        var ramos = Agrupar(p => p.Ramo).OrderByDescending(x => x.Pxc).ToList();

        Pareto Par(Func<Grupo, double> sel)
        {
            var tot = clientes.Sum(sel); if (tot == 0) tot = 1;
            double acc = 0;
            var top = clientes.OrderByDescending(sel).Take(10).Select(c =>
            {
                acc += sel(c);
                return new Grupo { Nombre = c.Nombre, Pxc = c.Pxc, Mora = c.Mora, Res = c.Res, Dias = c.Dias, Regional = c.Regional, N = c.N, Valor = sel(c), Acum = acc / tot };
            }).ToList();
            return new Pareto { Top = top, Share = acc / tot };
        }

        var max = orden.Aggregate(new PolizaConsolidada { Dias = -1 }, (a, p) => p.Dias > a.Dias ? p : a);
        return new ResultadoAnalisis
        {
            Registros = filas.Count, NPolizas = orden.Count, NClientes = clientes.Count, T = T, Regionales = regionales, Ramos = ramos,
            ParetoPxc = Par(c => c.Pxc), ParetoRes = Par(c => c.Res), ParetoMora = Par(c => c.Mora),
            TopMora = clientes.OrderByDescending(c => c.Mora).Take(6).ToList(),
            TopRes = clientes.OrderByDescending(c => c.Res).Take(6).ToList(),
            MaxMora = max, MaxMoraEmpates = orden.Count(p => p.Dias == max.Dias && p.Contratante == max.Contratante),
        };
    }
}
