using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using CierrePxC.Api.Datos;
using CierrePxC.Api.Endpoints;
using CierrePxC.Api.Servicios;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ---------- Carpeta de datos (base SQLite y clave de firma). Nunca contiene datos de clientes. ----------
var carpetaDatos = Path.GetFullPath(builder.Configuration["Datos:Carpeta"] ?? Path.Combine(builder.Environment.ContentRootPath, "App_Data"));
Directory.CreateDirectory(carpetaDatos);

// ---------- Clave para firmar las sesiones (JWT) ----------
var claveJwt = builder.Configuration["Jwt:Clave"];
if (string.IsNullOrWhiteSpace(claveJwt) || claveJwt.Length < 32)
{
    var ruta = Path.Combine(carpetaDatos, "jwt.key");
    if (!File.Exists(ruta)) File.WriteAllText(ruta, Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)));
    claveJwt = File.ReadAllText(ruta).Trim();
}
var opJwt = new OpcionesJwt { Clave = claveJwt, HorasValidez = builder.Configuration.GetValue("Jwt:HorasValidez", 8) };

// ---------- Servicios ----------
builder.Services.AddDbContext<AppDb>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Db") ?? $"Data Source={Path.Combine(carpetaDatos, "cierre.db")}"));
builder.Services.AddMemoryCache(o => o.SizeLimit = 2000);
builder.Services.AddSingleton<AlmacenSesiones>();
builder.Services.AddSingleton<ArchivosTemporales>();
builder.Services.AddSingleton(opJwt);
builder.Services.AddSingleton<ServicioTokens>();
builder.Services.AddSingleton<IPasswordHasher<Usuario>, PasswordHasher<Usuario>>();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = ValidadorArchivos.TamanoMaximo + 1024 * 1024);
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = ValidadorArchivos.TamanoMaximo + 1024 * 1024);

builder.Services.AddAuthentication("Bearer").AddJwtBearer("Bearer", o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = opJwt.Emisor, ValidAudience = opJwt.Emisor, ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(opJwt.Clave)), ValidateIssuerSigningKey = true,
        NameClaimType = "name", RoleClaimType = "role", ClockSkew = TimeSpan.FromMinutes(1),
    };
});
builder.Services.AddAuthorization();

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    // Inicio de sesión: máximo 10 intentos por minuto por dirección IP
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    // Procesos: máximo 60 solicitudes por minuto por usuario
    o.AddPolicy("api", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

// ---------- Base de datos y datos iniciales ----------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    if (!db.Empresas.Any())
    {
        db.Empresas.Add(new ConfigEmpresa { Codigo = "NSVS", Nombre = "Nacional Seguros Vida y Salud", RazonSocial = "NACIONAL VIDA SEGUROS DE PERSONAS S.A.", Activa = true });
        db.Empresas.Add(new ConfigEmpresa { Codigo = "NSPF", Nombre = "Nacional Seguros Patrimoniales y Fianzas", RazonSocial = "NACIONAL SEGUROS PATRIMONIALES Y FIANZAS S.A.", Activa = false });
    }
    if (!db.Usuarios.Any())
    {
        // Primer administrador. Su contraseña inicial se toma de la configuración o se genera y se deja en App_Data (debe cambiarse al ingresar).
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<Usuario>>();
        var clave = app.Configuration["Admin:ClaveInicial"];
        if (string.IsNullOrWhiteSpace(clave))
        {
            clave = AdminEndpoints.ClaveTemporal();
            File.WriteAllText(Path.Combine(carpetaDatos, "clave-inicial-admin.txt"),
                $"Usuario: {app.Configuration["Admin:Usuario"] ?? "admin"}\nContraseña temporal: {clave}\nSe pedirá cambiarla en el primer ingreso. Borre este archivo después.\n");
            app.Logger.LogWarning("Se creó el usuario administrador inicial. La contraseña temporal está en {Ruta}", Path.Combine(carpetaDatos, "clave-inicial-admin.txt"));
        }
        var admin = new Usuario { NombreUsuario = (app.Configuration["Admin:Usuario"] ?? "admin").ToLowerInvariant(), NombreCompleto = "Administrador", Rol = Roles.Admin, Empresas = "NSVS,NSPF" };
        admin.ClaveHash = hasher.HashPassword(admin, clave);
        db.Usuarios.Add(admin);
    }
    db.SaveChanges();
}

// ---------- Canalización HTTP ----------
app.UseExceptionHandler(e => e.Run(async ctx =>
{
    ctx.Response.StatusCode = 500;
    await ctx.Response.WriteAsJsonAsync(new { mensaje = "Ocurrió un error inesperado. Si persiste, contacte al administrador." });
}));
if (app.Configuration.GetValue("Https:Redirigir", false)) { app.UseHsts(); app.UseHttpsRedirection(); }

// Cabeceras de seguridad
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    h["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    if (ctx.Request.Path.StartsWithSegments("/api")) h["Cache-Control"] = "no-store";
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/salud");
AuthEndpoints.Mapear(app);
CierreEndpoints.Mapear(app);
AdminEndpoints.Mapear(app);
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
