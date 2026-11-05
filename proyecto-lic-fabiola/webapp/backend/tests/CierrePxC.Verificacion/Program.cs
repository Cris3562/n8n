// Verificación del motor contra un cierre real.
// Uso: dotnet run -- <carpeta_datos> <carpeta_salida>
// La carpeta de datos (NUNCA versionada) debe contener: z1/1/BASES/*.xlsx, z2/Resultado2/FINAL/*.xlsx y conc/*.xlsx
// El programa no tiene valores fijos: compara contra los archivos oficiales que se le entregan.
using System.Diagnostics;
using CierrePxC.Core;
using static CierrePxC.Core.Reglas;

var datos = args.Length > 0 ? args[0] : Environment.GetEnvironmentVariable("DATOS_PRUEBA") ?? throw new Exception("Indica la carpeta de datos");
var salida = args.Length > 1 ? args[1] : Path.Combine(Path.GetTempPath(), "verificacion");
Directory.CreateDirectory(salida);
var bases = Path.Combine(datos, "z1/1/BASES");
// Cada base se identifica por el inicio de su nombre de archivo
string Buscar(string carpeta, string prefijo) => Directory.GetFiles(carpeta, prefijo + "*.xlsx").Single();
var archivos = new Dictionary<string, string>
{
    ["MASIVOS"] = Buscar(bases, "PxC"), ["ELIFE II"] = Buscar(bases, "ELIFE"), ["SALUD"] = Buscar(bases, "ESALUD"),
    ["INMOTION"] = Buscar(bases, "INMOTION"), ["PREPAGA"] = Buscar(bases, "PREPAGA"),
};
var fallos = 0;
void Check(bool ok, string que) { Console.WriteLine($"  {(ok ? "OK " : "FALLA")} {que}"); if (!ok) fallos++; }
List<Hoja> Leer(string ruta, Func<string, bool>? filtro = null) { using var fs = File.OpenRead(ruta); return LectorExcel.Leer(fs, ruta, filtro); }

var sw = Stopwatch.StartNew();
var res = new Dictionary<string, ResultadoSistema>();
foreach (var (s, f) in archivos)
{
    var t = Stopwatch.StartNew();
    res[s] = Motor.ProcesarSistema(s, Leer(f), s == "PREPAGA" ? 1 : null);
    Console.WriteLine($"{s}: {res[s].Filas.Count} filas, extras [{string.Join(", ", res[s].Extras)}], corte {res[s].Corte}, {t.ElapsedMilliseconds} ms");
}
res["PREPAGA"] = Motor.AplicarTC(res["PREPAGA"], TipoCambioPrepagaPorDefecto);
var cons = Motor.Consolidar(res);
var t2 = Stopwatch.StartNew();
var bytes = EscritorExcel.LibroConsolidado(cons);
File.WriteAllBytes(Path.Combine(salida, "consolidado.xlsx"), bytes);
Console.WriteLine($"Consolidado escrito: {bytes.Length / 1e6:F1} MB en {t2.ElapsedMilliseconds} ms · total {sw.ElapsedMilliseconds} ms");

Console.WriteLine("\n== 1. Consolidado vs reporte oficial (celda por celda)");
var finalRuta = Buscar(Path.Combine(datos, "z2/Resultado2/FINAL"), "01.");
var oficial = Leer(finalRuta).First(h => Norm(h.Nombre) == "base").Filas;
var encOf = oficial[0].Select(x => Convert.ToString(x) ?? "").ToList();
Check(encOf.SequenceEqual(cons.Encabezado), $"encabezados iguales ({cons.Encabezado.Count} columnas)");
Check(oficial.Count - 3 == cons.Filas.Count, $"filas: app {cons.Filas.Count} / oficial {oficial.Count - 3}");
var sinAjuste = new HashSet<string> { "MASIVOS", "INMOTION", "PREPAGA" };
var colsMora = new HashSet<int> { 10, 11, 12, 13, 14, 15, 16, 22, 23, 24, 25, 26, 27, 28, 20 };
var difs = new Dictionary<string, int>();
for (var i = 0; i < cons.Filas.Count; i++)
{
    var a = cons.Filas[i]; var b = oficial[i + 1];
    for (var c = 0; c < encOf.Count; c++)
    {
        var sis = Convert.ToString(a[Sistema])!;
        if (!sinAjuste.Contains(sis) && colsMora.Contains(c)) continue; // ajustes manuales de la Subgerencia
        var x = a[c]; var y = c < b.Length ? b[c] : null;
        if (x is null && y is null) continue;
        if (x is double dx && y is double dy) { if (Math.Abs(dx - dy) < 1e-6) continue; }
        else if (Convert.ToString(x) == Convert.ToString(y)) continue;
        var k = $"{sis}|{encOf[c]}"; difs[k] = difs.GetValueOrDefault(k) + 1;
        if (difs[k] <= 2) Console.WriteLine($"    dif {k} fila {i + 2}: app={x} oficial={y}");
    }
}
Check(difs.Count == 0, $"valores iguales (diferencias: {difs.Count})");
var totOficial = oficial.First(f => Convert.ToString(f[0]) == "TOTAL");
Check(Math.Abs(cons.Totales.PxC - Num(totOficial[PxC])) < 0.01, "PxC total igual a la fila TOTAL oficial");

Console.WriteLine("\n== 2. Anexo E (desde el consolidado oficial ajustado) vs anexo enviado a la APS");
var t3 = Stopwatch.StartNew();
var finalAjustado = Motor.LeerConsolidadoFinal(Leer(finalRuta));
Console.WriteLine($"  consolidado final leído: {finalAjustado.Count} filas en {t3.ElapsedMilliseconds} ms");
var anexo = Motor.AnexoPorRamo(finalAjustado);
var anexoOf = Leer(Buscar(Path.Combine(datos, "z2/Resultado2/FINAL"), "02."))[0].Filas;
double maxDif = 0; var ramosOk = true;
for (var i = 0; i < anexo.Count; i++)
{
    var fo = anexoOf[15 + i];
    if (Convert.ToString(fo[0]) != anexo[i].Ramo) ramosOk = false;
    for (var j = 0; j < 15; j++) maxDif = Math.Max(maxDif, Math.Abs(anexo[i].Valores[j] - Num(fo[1 + j])));
}
Check(ramosOk, $"ramos {string.Join(",", anexo.Select(x => x.Ramo))}");
Check(maxDif < 1e-6, $"máxima diferencia {maxDif}");
File.WriteAllBytes(Path.Combine(salida, "anexo.xlsx"), EscritorExcel.LibroAnexoE(finalAjustado, new Periodo(8, 2026), "NACIONAL VIDA SEGUROS DE PERSONAS S.A.", 6.86));

Console.WriteLine("\n== 3. Conciliación: saldo técnico vs archivo de la Subgerencia");
var conc = Motor.CalcularConciliacion(finalAjustado);
var jefa = Leer(Path.Combine(datos, "conc/enviado_por_jefa.xlsx"), n => Norm(n) == "primaxcobrar")[0].Filas;
var hrJefa = jefa.FindIndex(f => f.Length > 1 && Convert.ToString(f[1]) == "elife1; elife2; esalud");
for (var k = 0; k < 7; k++)
{
    var jr = jefa[hrJefa + k]; var f = Motor.FilasConciliacion[k];
    var ok = Motor.ColumnasConciliacion.Select((c, i) => Math.Abs(conc.Resumen[f][c] - Num(jr.ElementAtOrDefault(2 + i)))).All(d => d < 0.01);
    Check(ok, $"fila «{f.Trim()}»");
}
var sumaDetalle = conc.Detalle.Values.Sum(d => d.Values.Sum());
Check(Math.Abs(sumaDetalle - conc.Tecnico.Values.Sum()) < 0.01, "detalle por regional suma el saldo técnico");
var resp = Motor.LeerRespuestaContabilidad(Leer(Path.Combine(datos, "conc/respuesta_contabilidad.xlsx"), n => Norm(n) == "primaxcobrar"));
Check(resp.Completos > 0, $"respuesta Contabilidad leída ({resp.Completos} saldos)");
File.WriteAllBytes(Path.Combine(salida, "conciliacion.xlsx"), EscritorExcel.LibroConciliacion(conc, new Periodo(8, 2026), resp.Contable));

Console.WriteLine("\n== 4. Análisis del dashboard");
var A = Analisis.Analizar(finalAjustado);
// Consistencia interna (sin valores fijos): los totales del análisis deben igualar la suma de la base
Check(Math.Abs(A.T.Pxc - finalAjustado.Sum(f => Num(f[PxC]))) < 0.01, "PxC del análisis = suma de la base");
Check(Math.Abs(A.T.Mora - finalAjustado.Sum(f => Num(f[TotalMora]))) < 0.01, "mora del análisis = suma de la base");
Check(Math.Abs(A.T.Res - finalAjustado.Sum(f => Num(f[Reserva]))) < 0.01, "reserva del análisis = suma de la base");
Check(Math.Abs(A.Regionales.Sum(r => r.Pxc) - A.T.Pxc) < 0.01, "regionales suman el total");
Check(A.MaxMora.Dias == finalAjustado.Max(f => Num(f[DiasMora])), "cuenta con mayor mora detectada");
Check(A.ParetoPxc.Top.Count == 10 && A.ParetoPxc.Share is > 0 and <= 1, "pareto de clientes");

Console.WriteLine(fallos == 0 ? "\nRESULTADO: TODO OK" : $"\nRESULTADO: {fallos} FALLAS");
return fallos == 0 ? 0 : 1;
