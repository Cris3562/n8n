using Microsoft.EntityFrameworkCore;

namespace CierrePxC.Api.Datos;

/// <summary>Usuario de la aplicación. La contraseña se guarda solo como hash (PBKDF2).</summary>
public class Usuario
{
    public int Id { get; set; }
    public string NombreUsuario { get; set; } = "";
    public string NombreCompleto { get; set; } = "";
    public string ClaveHash { get; set; } = "";
    /// <summary>"Admin" o "Usuario".</summary>
    public string Rol { get; set; } = Roles.Usuario;
    /// <summary>Empresas habilitadas, separadas por coma (ej. "NSVS,NSPF").</summary>
    public string Empresas { get; set; } = "NSVS";
    public bool Activo { get; set; } = true;
    public bool DebeCambiarClave { get; set; } = true;
    public int IntentosFallidos { get; set; }
    public DateTime? BloqueadoHasta { get; set; }
    public DateTime CreadoEn { get; set; } = DateTime.UtcNow;
    public DateTime? UltimoAcceso { get; set; }
    public IEnumerable<string> ListaEmpresas() => Empresas.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}

public static class Roles
{
    public const string Admin = "Admin";
    public const string Usuario = "Usuario";
}

/// <summary>Configuración por empresa.</summary>
public class ConfigEmpresa
{
    public string Codigo { get; set; } = "";
    public string Nombre { get; set; } = "";
    public string RazonSocial { get; set; } = "";
    public double TcPrepaga { get; set; } = CierrePxC.Core.Reglas.TipoCambioPrepagaPorDefecto;
    /// <summary>Las reglas de la empresa ya están implementadas y validadas.</summary>
    public bool Activa { get; set; }
}

/// <summary>Bitácora de uso: quién hizo qué y cuándo, con totales de control. No guarda datos de clientes.</summary>
public class Bitacora
{
    public long Id { get; set; }
    public DateTime Fecha { get; set; } = DateTime.UtcNow;
    public string Usuario { get; set; } = "";
    public string? Empresa { get; set; }
    public string Accion { get; set; } = "";
    public string? Periodo { get; set; }
    public string Resultado { get; set; } = "OK";
    public string? Detalle { get; set; }
    public string? Ip { get; set; }
}

public class AppDb(DbContextOptions<AppDb> opciones) : DbContext(opciones)
{
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<ConfigEmpresa> Empresas => Set<ConfigEmpresa>();
    public DbSet<Bitacora> Bitacora => Set<Bitacora>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Usuario>(e =>
        {
            e.HasIndex(x => x.NombreUsuario).IsUnique();
            e.Property(x => x.NombreUsuario).HasMaxLength(60);
            e.Property(x => x.NombreCompleto).HasMaxLength(120);
            e.Property(x => x.Rol).HasMaxLength(20);
            e.Property(x => x.Empresas).HasMaxLength(100);
        });
        b.Entity<ConfigEmpresa>(e => { e.HasKey(x => x.Codigo); e.Property(x => x.Codigo).HasMaxLength(10); });
        b.Entity<Bitacora>(e => { e.HasIndex(x => x.Fecha); e.Property(x => x.Accion).HasMaxLength(60); });
    }
}
