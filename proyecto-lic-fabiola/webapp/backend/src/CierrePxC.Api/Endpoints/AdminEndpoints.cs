using System.Security.Cryptography;
using CierrePxC.Api.Datos;
using CierrePxC.Api.Servicios;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CierrePxC.Api.Endpoints;

public record NuevoUsuarioDto(string Usuario, string Nombre, string Rol, string[] Empresas);
public record EditarUsuarioDto(string Nombre, string Rol, string[] Empresas, bool Activo);
public record EmpresaDto(string Codigo, string Nombre, string RazonSocial, double TcPrepaga, bool Activa);
public record TcDto(double TcPrepaga);

public static class AdminEndpoints
{
    private static readonly string[] CodigosEmpresa = { "NSVS", "NSPF" };

    /// <summary>Contraseña temporal segura (el usuario debe cambiarla al ingresar).</summary>
    public static string ClaveTemporal()
    {
        const string letras = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
        const string digitos = "23456789";
        var c = new char[12];
        for (var i = 0; i < c.Length; i++) c[i] = (i % 4 == 3 ? digitos : letras)[RandomNumberGenerator.GetInt32(i % 4 == 3 ? digitos.Length : letras.Length)];
        return new string(c);
    }

    public static void Mapear(WebApplication app)
    {
        // Empresas visibles para el usuario (cualquier rol)
        app.MapGet("/api/empresas", async (HttpContext http, AppDb db) =>
        {
            var lista = await db.Empresas.OrderBy(e => e.Codigo).ToListAsync();
            return lista.Where(e => UsuarioActual.TieneEmpresa(http.User, e.Codigo))
                .Select(e => new EmpresaDto(e.Codigo, e.Nombre, e.RazonSocial, e.TcPrepaga, e.Activa));
        }).RequireAuthorization();

        var g = app.MapGroup("/api/admin").RequireAuthorization(p => p.RequireRole(Roles.Admin));

        g.MapGet("/usuarios", async (AppDb db) => (await db.Usuarios.OrderBy(u => u.NombreUsuario).ToListAsync()).Select(AuthEndpoints.ADto));

        g.MapPost("/usuarios", async (NuevoUsuarioDto dto, AppDb db, IPasswordHasher<Usuario> hasher, HttpContext http) =>
        {
            var nombre = (dto.Usuario ?? "").Trim().ToLowerInvariant();
            if (nombre.Length < 3 || !nombre.All(ch => char.IsLetterOrDigit(ch) || ch is '.' or '_' or '-'))
                return Results.BadRequest(new { mensaje = "El usuario debe tener al menos 3 caracteres (letras, números, punto, guion)." });
            if (await db.Usuarios.AnyAsync(u => u.NombreUsuario == nombre)) return Results.Conflict(new { mensaje = "Ese usuario ya existe." });
            var rol = dto.Rol == Roles.Admin ? Roles.Admin : Roles.Usuario;
            var empresas = (dto.Empresas ?? Array.Empty<string>()).Select(x => x.ToUpperInvariant()).Where(CodigosEmpresa.Contains).Distinct().ToArray();
            if (empresas.Length == 0) return Results.BadRequest(new { mensaje = "Asigne al menos una empresa." });
            var clave = ClaveTemporal();
            var u = new Usuario { NombreUsuario = nombre, NombreCompleto = (dto.Nombre ?? "").Trim(), Rol = rol, Empresas = string.Join(',', empresas), DebeCambiarClave = true };
            u.ClaveHash = hasher.HashPassword(u, clave);
            db.Usuarios.Add(u);
            await db.SaveChangesAsync();
            await Bitacoras.Registrar(db, http, "USUARIO_CREADO", detalle: nombre);
            return Results.Ok(new { usuario = AuthEndpoints.ADto(u), claveTemporal = clave });
        });

        g.MapPut("/usuarios/{id:int}", async (int id, EditarUsuarioDto dto, AppDb db, HttpContext http) =>
        {
            var u = await db.Usuarios.FindAsync(id);
            if (u is null) return Results.NotFound();
            var empresas = (dto.Empresas ?? Array.Empty<string>()).Select(x => x.ToUpperInvariant()).Where(CodigosEmpresa.Contains).Distinct().ToArray();
            if (empresas.Length == 0) return Results.BadRequest(new { mensaje = "Asigne al menos una empresa." });
            var esYo = id == UsuarioActual.Id(http.User);
            if (esYo && (!dto.Activo || dto.Rol != Roles.Admin)) return Results.BadRequest(new { mensaje = "No puede quitarse el rol de administrador ni desactivarse a sí mismo." });
            u.NombreCompleto = (dto.Nombre ?? "").Trim(); u.Rol = dto.Rol == Roles.Admin ? Roles.Admin : Roles.Usuario;
            u.Empresas = string.Join(',', empresas); u.Activo = dto.Activo;
            await db.SaveChangesAsync();
            await Bitacoras.Registrar(db, http, "USUARIO_EDITADO", detalle: u.NombreUsuario);
            return Results.Ok(AuthEndpoints.ADto(u));
        });

        g.MapPost("/usuarios/{id:int}/restablecer-clave", async (int id, AppDb db, IPasswordHasher<Usuario> hasher, HttpContext http) =>
        {
            var u = await db.Usuarios.FindAsync(id);
            if (u is null) return Results.NotFound();
            var clave = ClaveTemporal();
            u.ClaveHash = hasher.HashPassword(u, clave); u.DebeCambiarClave = true; u.IntentosFallidos = 0; u.BloqueadoHasta = null;
            await db.SaveChangesAsync();
            await Bitacoras.Registrar(db, http, "CLAVE_RESTABLECIDA", detalle: u.NombreUsuario);
            return Results.Ok(new { claveTemporal = clave });
        });

        g.MapPut("/empresas/{codigo}/tc", async (string codigo, TcDto dto, AppDb db, HttpContext http) =>
        {
            var e = await db.Empresas.FindAsync(codigo.ToUpperInvariant());
            if (e is null) return Results.NotFound();
            if (dto.TcPrepaga is <= 0 or > 1000) return Results.BadRequest(new { mensaje = "Tipo de cambio no válido." });
            var antes = e.TcPrepaga; e.TcPrepaga = Math.Round(dto.TcPrepaga, 4);
            await db.SaveChangesAsync();
            await Bitacoras.Registrar(db, http, "TC_PREPAGA", e.Codigo, detalle: $"{antes} -> {e.TcPrepaga}");
            return Results.Ok(new EmpresaDto(e.Codigo, e.Nombre, e.RazonSocial, e.TcPrepaga, e.Activa));
        });

        g.MapGet("/bitacora", async (AppDb db, int? limite) =>
            await db.Bitacora.OrderByDescending(b => b.Id).Take(Math.Clamp(limite ?? 200, 1, 2000)).ToListAsync());
    }
}
