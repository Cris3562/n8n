using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text;
using CierrePxC.Api.Datos;
using CierrePxC.Core;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CierrePxC.Api.Servicios;

/// <summary>
/// Estado de trabajo de cada usuario mientras procesa un cierre. Vive SOLO en memoria y expira a los 30 minutos
/// sin uso: los datos de clientes nunca se guardan en disco ni en la base de datos.
/// </summary>
public sealed class SesionCierre
{
    public ConcurrentDictionary<string, ResultadoSistema> Sistemas { get; } = new();
    public List<object?[]>? Consolidado { get; set; }          // generado en el paso 1
    public List<object?[]>? ConsolidadoConciliacion { get; set; } // subido en el paso 2
    public List<object?[]>? Final { get; set; }                // consolidado final ajustado (paso 3)
    public Motor.RespuestaContabilidad? Respuesta { get; set; }
    public readonly object Candado = new();
}

public sealed class AlmacenSesiones(IMemoryCache cache)
{
    private static readonly TimeSpan Expira = TimeSpan.FromMinutes(30);
    public SesionCierre Obtener(string usuario, string empresa) =>
        cache.GetOrCreate($"sesion:{usuario}:{empresa}", e => { e.SlidingExpiration = Expira; e.Size = 1; return new SesionCierre(); })!;
    public void Quitar(string usuario, string empresa) => cache.Remove($"sesion:{usuario}:{empresa}");
}

/// <summary>Archivos generados listos para descargar. En memoria, ligados al usuario y con vencimiento de 30 minutos.</summary>
public sealed class ArchivosTemporales(IMemoryCache cache)
{
    public sealed record Archivo(string Usuario, string Nombre, string Tipo, byte[] Contenido);
    public sealed record Referencia(string Id, string Nombre);
    public const string TipoXlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public Referencia Guardar(string usuario, string nombre, byte[] contenido, string tipo = TipoXlsx)
    {
        var id = Guid.NewGuid().ToString("N");
        cache.Set($"archivo:{id}", new Archivo(usuario, nombre, tipo, contenido), new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30), Size = 1 });
        return new Referencia(id, nombre);
    }

    public Archivo? Obtener(string id, string usuario) =>
        cache.TryGetValue($"archivo:{id}", out Archivo? a) && a!.Usuario == usuario ? a : null;
}

public sealed class OpcionesJwt
{
    public string Clave { get; set; } = "";
    public string Emisor { get; set; } = "CierrePxC";
    public int HorasValidez { get; set; } = 8;
}

public sealed class ServicioTokens(OpcionesJwt op)
{
    public string Emitir(Usuario u)
    {
        var desc = new SecurityTokenDescriptor
        {
            Issuer = op.Emisor, Audience = op.Emisor, Expires = DateTime.UtcNow.AddHours(op.HorasValidez),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(op.Clave)), SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity(new[]
            {
                new Claim("sub", u.Id.ToString()), new Claim("name", u.NombreUsuario), new Claim("role", u.Rol),
                new Claim("empresas", u.Empresas), new Claim("cambiar_clave", u.DebeCambiarClave ? "1" : "0"),
            }),
        };
        return new JsonWebTokenHandler().CreateToken(desc);
    }
}

/// <summary>Validación básica de los archivos subidos (extensión, tamaño y firma del contenido).</summary>
public static class ValidadorArchivos
{
    public const long TamanoMaximo = 100L * 1024 * 1024; // 100 MB
    private static readonly string[] Extensiones = { ".xlsx", ".xls", ".csv" };

    public static async Task<(MemoryStream datos, string nombre)> LeerAsync(IFormFile? archivo, CancellationToken ct)
    {
        if (archivo is null || archivo.Length == 0) throw new ErrorDeArchivo("No se recibió ningún archivo.");
        if (archivo.Length > TamanoMaximo) throw new ErrorDeArchivo("El archivo supera el tamaño máximo permitido (100 MB).");
        var nombre = Path.GetFileName(archivo.FileName);
        var ext = Path.GetExtension(nombre).ToLowerInvariant();
        if (!Extensiones.Contains(ext)) throw new ErrorDeArchivo("Solo se aceptan archivos Excel (.xlsx, .xls) o .csv.");
        var ms = new MemoryStream((int)archivo.Length);
        await archivo.CopyToAsync(ms, ct);
        ms.Position = 0;
        var firma = new byte[4];
        _ = ms.Read(firma, 0, 4); ms.Position = 0;
        var esZip = firma[0] == 0x50 && firma[1] == 0x4B;           // .xlsx
        var esOle = firma[0] == 0xD0 && firma[1] == 0xCF;           // .xls
        if ((ext == ".xlsx" && !esZip) || (ext == ".xls" && !esOle && !esZip))
            throw new ErrorDeArchivo("El contenido del archivo no corresponde a un Excel válido.");
        return (ms, nombre);
    }
}

public static class UsuarioActual
{
    public static string Nombre(ClaimsPrincipal u) => u.Identity?.Name ?? "";
    public static int Id(ClaimsPrincipal u) => int.Parse(u.FindFirstValue("sub") ?? "0");
    public static bool TieneEmpresa(ClaimsPrincipal u, string empresa) =>
        (u.FindFirstValue("empresas") ?? "").Split(',', StringSplitOptions.TrimEntries).Contains(empresa, StringComparer.OrdinalIgnoreCase);
}

/// <summary>Reglas de contraseña.</summary>
public static class PoliticaClave
{
    public static string? Validar(string? clave)
    {
        if (string.IsNullOrWhiteSpace(clave) || clave.Length < 10) return "La contraseña debe tener al menos 10 caracteres.";
        if (!clave.Any(char.IsLetter) || !clave.Any(char.IsDigit)) return "La contraseña debe combinar letras y números.";
        return null;
    }
}
