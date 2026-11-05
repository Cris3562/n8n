using System.Text.Json;
using CierrePxC.Api.Datos;
using CierrePxC.Api.Servicios;
using CierrePxC.Core;
using static CierrePxC.Core.Reglas;

namespace CierrePxC.Api.Endpoints;

public record PeriodoDto(int Mes, int Anio)
{
    public Periodo APeriodo() => new(Math.Clamp(Mes, 0, 11), Anio is >= 2000 and <= 2100 ? Anio : DateTime.Today.Year);
    public string Texto() => $"{Meses[APeriodo().Mes]} {APeriodo().Anio}";
    public string Mayus() => $"{Meses[APeriodo().Mes].ToUpperInvariant()} {APeriodo().Anio}";
}

/// <summary>Los 3 pasos del cierre. Los datos de clientes se procesan en memoria y no se guardan.</summary>
public static class CierreEndpoints
{
    private sealed class AccesoDenegado(string m, int codigo) : Exception(m) { public int Codigo { get; } = codigo; }

    private static async Task<ConfigEmpresa> Empresa(AppDb db, HttpContext http, string codigo)
    {
        codigo = codigo.ToUpperInvariant();
        var e = await db.Empresas.FindAsync(codigo) ?? throw new AccesoDenegado("Empresa no encontrada.", 404);
        if (!UsuarioActual.TieneEmpresa(http.User, codigo)) throw new AccesoDenegado("No tiene acceso a esta empresa.", 403);
        if (!e.Activa) throw new AccesoDenegado($"{e.Nombre} todavía está en desarrollo.", 409);
        return e;
    }

    private static async Task<IResult> Ejecutar(Func<Task<IResult>> accion)
    {
        try { return await accion(); }
        catch (AccesoDenegado ex) { return Results.Json(new { mensaje = ex.Message }, statusCode: ex.Codigo); }
        catch (ErrorDeArchivo ex) { return Results.BadRequest(new { mensaje = ex.Message }); }
        catch (ExcelDataReader.Exceptions.HeaderException) { return Results.BadRequest(new { mensaje = "No se pudo leer el archivo: no es un Excel válido o está protegido con contraseña." }); }
    }

    private static string Json(object o) => JsonSerializer.Serialize(o);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/cierre/{empresa}").RequireAuthorization().RequireRateLimiting("api").DisableAntiforgery();

        /* ---------------- Paso 1: Consolidar ---------------- */
        g.MapPost("/sistemas/{sistema}", (string empresa, string sistema, IFormFile archivo, HttpContext http, AppDb db, AlmacenSesiones ses, CancellationToken ct) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            sistema = sistema.ToUpperInvariant();
            if (!Sistemas.Any(s => s.Id == sistema)) throw new ErrorDeArchivo($"Sistema desconocido: {sistema}");
            var (datos, nombre) = await ValidadorArchivos.LeerAsync(archivo, ct);
            var hojas = LectorExcel.Leer(datos, nombre);
            var r = Motor.ProcesarSistema(sistema, hojas, sistema == "PREPAGA" ? 1 : null); // PREPAGA se guarda en USD
            ses.Obtener(UsuarioActual.Nombre(http.User), e.Codigo).Sistemas[sistema] = r;
            await Bitacoras.Registrar(db, http, "CARGA_SISTEMA", e.Codigo, detalle: Json(new { sistema, archivo = nombre, filas = r.Filas.Count }));
            return Results.Ok(new { sistema, filas = r.Filas.Count, pxc = r.TotalPxC, moneda = sistema == "PREPAGA" ? "USD" : "Bs", avisos = r.Avisos, corte = r.Corte });
        }));

        g.MapDelete("/sistemas", (string empresa, HttpContext http, AppDb db, AlmacenSesiones ses) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var s = ses.Obtener(UsuarioActual.Nombre(http.User), e.Codigo);
            s.Sistemas.Clear(); s.Consolidado = null;
            return Results.NoContent();
        }));

        g.MapPost("/consolidar", (string empresa, PeriodoDto p, HttpContext http, AppDb db, AlmacenSesiones ses, ArchivosTemporales arch) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var usuario = UsuarioActual.Nombre(http.User);
            var s = ses.Obtener(usuario, e.Codigo);
            if (s.Sistemas.IsEmpty) throw new ErrorDeArchivo("Primero cargue las bases de los sistemas.");
            var sis = new Dictionary<string, ResultadoSistema>(s.Sistemas);
            if (sis.TryGetValue("PREPAGA", out var pre)) sis["PREPAGA"] = Motor.AplicarTC(pre, e.TcPrepaga);
            var cons = Motor.Consolidar(sis);
            s.Consolidado = cons.Filas;
            var refe = arch.Guardar(usuario, $"01. APS REPORTE DE PRIMAS POR COBRAR Y RESERVAS CIERRE {e.Codigo} {p.Mayus()} MN.xlsx", EscritorExcel.LibroConsolidado(cons));
            await Bitacoras.Registrar(db, http, "CONSOLIDAR", e.Codigo, p.Texto(), detalle: Json(new { cons.Totales, tc = e.TcPrepaga, sistemas = cons.Resumen.Select(x => x.Sistema) }));
            return Results.Ok(new { resumen = cons.Resumen, totales = cons.Totales, tcPrepaga = e.TcPrepaga, faltantes = Sistemas.Where(x => !s.Sistemas.ContainsKey(x.Id)).Select(x => x.Id), archivo = refe });
        }));

        /* ---------------- Paso 2: Conciliación ---------------- */
        g.MapPost("/conciliacion/consolidado", (string empresa, IFormFile archivo, HttpContext http, AppDb db, AlmacenSesiones ses, CancellationToken ct) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var (datos, nombre) = await ValidadorArchivos.LeerAsync(archivo, ct);
            var filas = Motor.LeerConsolidadoFinal(LectorExcel.Leer(datos, nombre));
            ses.Obtener(UsuarioActual.Nombre(http.User), e.Codigo).ConsolidadoConciliacion = filas;
            return Results.Ok(new { filas = filas.Count });
        }));

        g.MapPost("/conciliacion", (string empresa, PeriodoDto p, bool? conDiferencias, HttpContext http, AppDb db, AlmacenSesiones ses, ArchivosTemporales arch) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var usuario = UsuarioActual.Nombre(http.User);
            var s = ses.Obtener(usuario, e.Codigo);
            var filas = s.ConsolidadoConciliacion ?? s.Consolidado ?? s.Final ?? throw new ErrorDeArchivo("Primero genere el consolidado (paso 1) o súbalo aquí.");
            var conc = Motor.CalcularConciliacion(filas);
            var dif = conDiferencias == true && s.Respuesta != null;
            var nombre = dif ? $"9.2 Conciliacion Primaxcobrar - Diferencias Cierre {p.Mayus()}.xlsx" : $"9.2 Conciliacion Primaxcobrar - Conciliacion Cierre {p.Mayus()}.xlsx";
            var refe = arch.Guardar(usuario, nombre, EscritorExcel.LibroConciliacion(conc, p.APeriodo(), dif ? s.Respuesta!.Contable : null));
            await Bitacoras.Registrar(db, http, dif ? "CONCILIACION_DIFERENCIAS" : "CONCILIACION", e.Codigo, p.Texto(), detalle: Json(new { tecnico = conc.Tecnico }));
            return Results.Ok(new { tecnico = conc.Tecnico, archivo = refe });
        }));

        g.MapPost("/conciliacion/respuesta", (string empresa, IFormFile archivo, HttpContext http, AppDb db, AlmacenSesiones ses, CancellationToken ct) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var (datos, nombre) = await ValidadorArchivos.LeerAsync(archivo, ct);
            var r = Motor.LeerRespuestaContabilidad(LectorExcel.Leer(datos, nombre, h => Norm(h) == "primaxcobrar"));
            ses.Obtener(UsuarioActual.Nombre(http.User), e.Codigo).Respuesta = r;
            await Bitacoras.Registrar(db, http, "RESPUESTA_CONTABILIDAD", e.Codigo, detalle: Json(new { archivo = nombre, r.Completos }));
            return Results.Ok(new { contable = r.Contable, tecnicoArchivo = r.TecnicoArchivo, completos = r.Completos });
        }));

        g.MapDelete("/conciliacion", (string empresa, HttpContext http, AppDb db, AlmacenSesiones ses) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var s = ses.Obtener(UsuarioActual.Nombre(http.User), e.Codigo);
            s.ConsolidadoConciliacion = null; s.Respuesta = null;
            return Results.NoContent();
        }));

        /* ---------------- Paso 3: APS y Dashboard ---------------- */
        g.MapPost("/final", (string empresa, IFormFile archivo, HttpContext http, AppDb db, AlmacenSesiones ses, CancellationToken ct) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var (datos, nombre) = await ValidadorArchivos.LeerAsync(archivo, ct);
            var filas = Motor.LeerConsolidadoFinal(LectorExcel.Leer(datos, nombre));
            ses.Obtener(UsuarioActual.Nombre(http.User), e.Codigo).Final = filas;
            var analisis = Analisis.Analizar(filas);
            await Bitacoras.Registrar(db, http, "CARGA_FINAL", e.Codigo, detalle: Json(new { archivo = nombre, registros = filas.Count, pxc = analisis.T.Pxc }));
            return Results.Ok(new { analisis });
        }));

        g.MapPost("/anexo", (string empresa, PeriodoDto p, HttpContext http, AppDb db, AlmacenSesiones ses, ArchivosTemporales arch) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            var usuario = UsuarioActual.Nombre(http.User);
            var filas = ses.Obtener(usuario, e.Codigo).Final ?? throw new ErrorDeArchivo("Primero suba el consolidado final.");
            var refe = arch.Guardar(usuario, $"02. ANEXO En Formato APS {e.Codigo} {p.Mayus()}.xlsx", EscritorExcel.LibroAnexoE(filas, p.APeriodo(), e.RazonSocial, e.TcPrepaga));
            await Bitacoras.Registrar(db, http, "ANEXO_E", e.Codigo, p.Texto());
            return Results.Ok(new { archivo = refe });
        }));

        g.MapDelete("/final", (string empresa, HttpContext http, AppDb db, AlmacenSesiones ses) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            ses.Obtener(UsuarioActual.Nombre(http.User), e.Codigo).Final = null;
            return Results.NoContent();
        }));

        g.MapPost("/informe", (string empresa, PeriodoDto p, string formato, HttpContext http, AppDb db) => Ejecutar(async () =>
        {
            var e = await Empresa(db, http, empresa);
            await Bitacoras.Registrar(db, http, formato == "pptx" ? "INFORME_PPTX" : "INFORME_PDF", e.Codigo, p.Texto());
            return Results.NoContent();
        }));

        /* ---------------- Descarga de archivos generados ---------------- */
        app.MapGet("/api/archivos/{id}", (string id, HttpContext http, ArchivosTemporales arch) =>
        {
            var a = arch.Obtener(id, UsuarioActual.Nombre(http.User));
            return a is null ? Results.NotFound(new { mensaje = "El archivo ya no está disponible (vence a los 30 minutos). Vuelva a generarlo." }) : Results.File(a.Contenido, a.Tipo, a.Nombre);
        }).RequireAuthorization();
    }
}
