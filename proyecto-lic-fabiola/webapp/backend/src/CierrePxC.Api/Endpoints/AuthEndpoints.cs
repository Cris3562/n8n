using CierrePxC.Api.Datos;
using CierrePxC.Api.Servicios;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CierrePxC.Api.Endpoints;

public record LoginDto(string Usuario, string Clave);
public record CambioClaveDto(string Actual, string Nueva);
public record UsuarioDto(int Id, string Usuario, string Nombre, string Rol, string[] Empresas, bool Activo, bool DebeCambiarClave, DateTime? UltimoAcceso);

public static class AuthEndpoints
{
    private const int MaxIntentos = 5;
    private static readonly TimeSpan Bloqueo = TimeSpan.FromMinutes(15);

    public static UsuarioDto ADto(Usuario u) => new(u.Id, u.NombreUsuario, u.NombreCompleto, u.Rol, u.ListaEmpresas().ToArray(), u.Activo, u.DebeCambiarClave, u.UltimoAcceso);

    public static void Mapear(WebApplication app)
    {
        var g = app.MapGroup("/api/auth");

        g.MapPost("/login", async (LoginDto dto, AppDb db, ServicioTokens tokens, IPasswordHasher<Usuario> hasher, HttpContext http) =>
        {
            var nombre = (dto.Usuario ?? "").Trim().ToLowerInvariant();
            var u = await db.Usuarios.FirstOrDefaultAsync(x => x.NombreUsuario == nombre);
            const string generico = "Usuario o contraseña incorrectos.";
            if (u is null || !u.Activo)
            {
                await Bitacoras.Registrar(db, http, "LOGIN", resultado: "ERROR", detalle: "usuario inexistente o inactivo", usuario: nombre);
                return Results.Json(new { mensaje = generico }, statusCode: 401);
            }
            if (u.BloqueadoHasta is { } hasta && hasta > DateTime.UtcNow)
                return Results.Json(new { mensaje = "Usuario bloqueado temporalmente por intentos fallidos. Intente en unos minutos." }, statusCode: 423);
            if (hasher.VerifyHashedPassword(u, u.ClaveHash, dto.Clave ?? "") == PasswordVerificationResult.Failed)
            {
                u.IntentosFallidos++;
                if (u.IntentosFallidos >= MaxIntentos) { u.BloqueadoHasta = DateTime.UtcNow.Add(Bloqueo); u.IntentosFallidos = 0; }
                await db.SaveChangesAsync();
                await Bitacoras.Registrar(db, http, "LOGIN", resultado: "ERROR", detalle: "contraseña incorrecta", usuario: u.NombreUsuario);
                return Results.Json(new { mensaje = generico }, statusCode: 401);
            }
            u.IntentosFallidos = 0; u.BloqueadoHasta = null; u.UltimoAcceso = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await Bitacoras.Registrar(db, http, "LOGIN", usuario: u.NombreUsuario);
            return Results.Ok(new { token = tokens.Emitir(u), usuario = ADto(u) });
        }).AllowAnonymous().RequireRateLimiting("login");

        g.MapGet("/yo", async (HttpContext http, AppDb db) =>
        {
            var u = await db.Usuarios.FindAsync(UsuarioActual.Id(http.User));
            return u is null || !u.Activo ? Results.Unauthorized() : Results.Ok(ADto(u));
        }).RequireAuthorization();

        g.MapPost("/cambiar-clave", async (CambioClaveDto dto, HttpContext http, AppDb db, IPasswordHasher<Usuario> hasher, ServicioTokens tokens) =>
        {
            var u = await db.Usuarios.FindAsync(UsuarioActual.Id(http.User));
            if (u is null) return Results.Unauthorized();
            if (hasher.VerifyHashedPassword(u, u.ClaveHash, dto.Actual ?? "") == PasswordVerificationResult.Failed)
                return Results.BadRequest(new { mensaje = "La contraseña actual no es correcta." });
            if (PoliticaClave.Validar(dto.Nueva) is { } error) return Results.BadRequest(new { mensaje = error });
            if (dto.Nueva == dto.Actual) return Results.BadRequest(new { mensaje = "La nueva contraseña debe ser distinta de la actual." });
            u.ClaveHash = hasher.HashPassword(u, dto.Nueva);
            u.DebeCambiarClave = false;
            await db.SaveChangesAsync();
            await Bitacoras.Registrar(db, http, "CAMBIO_CLAVE");
            return Results.Ok(new { token = tokens.Emitir(u), usuario = ADto(u) });
        }).RequireAuthorization();
    }
}

public static class Bitacoras
{
    public static async Task Registrar(AppDb db, HttpContext http, string accion, string? empresa = null, string? periodo = null,
        string resultado = "OK", string? detalle = null, string? usuario = null)
    {
        db.Bitacora.Add(new Bitacora
        {
            Usuario = usuario ?? UsuarioActual.Nombre(http.User), Empresa = empresa, Accion = accion, Periodo = periodo,
            Resultado = resultado, Detalle = detalle?.Length > 2000 ? detalle[..2000] : detalle, Ip = http.Connection.RemoteIpAddress?.ToString(),
        });
        await db.SaveChangesAsync();
    }
}
