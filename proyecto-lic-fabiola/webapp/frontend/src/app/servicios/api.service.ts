import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Usuario } from './auth.service';

export interface Empresa { codigo: string; nombre: string; razonSocial: string; tcPrepaga: number; activa: boolean; }
export interface ArchivoRef { id: string; nombre: string; }
export interface Periodo { mes: number; anio: number; }
export interface Corte { dia: number; mes: number; anio: number; }
export interface CargaSistema { sistema: string; filas: number; pxc: number; moneda: string; avisos: string[]; corte: Corte | null; }
export interface TotalesSistema { sistema: string; filas: number; primaTotal: number; pxC: number; sinMora: number; totalMora: number; impuestos: number; neto: number; reserva: number; }
export interface ResultadoConsolidar { resumen: TotalesSistema[]; totales: TotalesSistema; tcPrepaga: number; faltantes: string[]; archivo: ArchivoRef; }
export type Saldos = Record<string, number | null>;
export interface Grupo { nombre: string; pxc: number; mora: number; res: number; dias: number; regional: string; n: number; valor: number; acum: number; }
export interface Pareto { top: Grupo[]; share: number; }
export interface Analisis {
  registros: number; nPolizas: number; nClientes: number;
  T: { pxc: number; mora: number; res: number; imp: number; neto: number; sin: number; m: number[]; r: number[] };
  regionales: Grupo[]; ramos: Grupo[]; paretoPxc: Pareto; paretoRes: Pareto; paretoMora: Pareto; topMora: Grupo[]; topRes: Grupo[];
  maxMora: { poliza: string; contratante: string; regional: string; ramo: string; dias: number; pxc: number; mora: number; res: number };
  maxMoraEmpates: number;
}
export interface Bitacora { id: number; fecha: string; usuario: string; empresa?: string; accion: string; periodo?: string; resultado: string; detalle?: string; ip?: string; }

export const SISTEMAS = [
  { id: 'MASIVOS', titulo: 'Masivos (BI)' }, { id: 'ELIFE II', titulo: 'ELIFE II' }, { id: 'SALUD', titulo: 'ESALUD' },
  { id: 'INMOTION', titulo: 'INMOTION' }, { id: 'PREPAGA', titulo: 'PREPAGA (en dólares)' },
];
export const CONC_COLS = ['VIDA INDIVIDUAL CORTO PLAZO', 'VG', 'DEF', 'SL', 'DH', 'AP', 'SL-PRE', 'INMOTION'];
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = (e: string) => `/api/cierre/${encodeURIComponent(e)}`;
  private archivo(f: File) { const d = new FormData(); d.append('archivo', f, f.name); return d; }

  empresas() { return firstValueFrom(this.http.get<Empresa[]>('/api/empresas')); }

  // Paso 1
  cargarSistema(e: string, sistema: string, f: File) { return firstValueFrom(this.http.post<CargaSistema>(`${this.base(e)}/sistemas/${encodeURIComponent(sistema)}`, this.archivo(f))); }
  limpiarSistemas(e: string) { return firstValueFrom(this.http.delete(`${this.base(e)}/sistemas`)); }
  consolidar(e: string, p: Periodo) { return firstValueFrom(this.http.post<ResultadoConsolidar>(`${this.base(e)}/consolidar`, p)); }
  // Paso 2
  cargarConsolidadoConciliacion(e: string, f: File) { return firstValueFrom(this.http.post<{ filas: number }>(`${this.base(e)}/conciliacion/consolidado`, this.archivo(f))); }
  conciliacion(e: string, p: Periodo, conDiferencias = false) { return firstValueFrom(this.http.post<{ tecnico: Record<string, number>; archivo: ArchivoRef }>(`${this.base(e)}/conciliacion?conDiferencias=${conDiferencias}`, p)); }
  respuestaContabilidad(e: string, f: File) { return firstValueFrom(this.http.post<{ contable: Saldos; tecnicoArchivo: Saldos; completos: number }>(`${this.base(e)}/conciliacion/respuesta`, this.archivo(f))); }
  limpiarConciliacion(e: string) { return firstValueFrom(this.http.delete(`${this.base(e)}/conciliacion`)); }
  // Paso 3
  cargarFinal(e: string, f: File) { return firstValueFrom(this.http.post<{ analisis: Analisis }>(`${this.base(e)}/final`, this.archivo(f))); }
  anexo(e: string, p: Periodo) { return firstValueFrom(this.http.post<{ archivo: ArchivoRef }>(`${this.base(e)}/anexo`, p)); }
  limpiarFinal(e: string) { return firstValueFrom(this.http.delete(`${this.base(e)}/final`)); }
  registrarInforme(e: string, p: Periodo, formato: 'pdf' | 'pptx') { return firstValueFrom(this.http.post(`${this.base(e)}/informe?formato=${formato}`, p)); }

  /** Descarga un archivo generado por el servidor. */
  async descargar(a: ArchivoRef) {
    const blob = await firstValueFrom(this.http.get(`/api/archivos/${a.id}`, { responseType: 'blob' }));
    guardarBlob(blob, a.nombre);
  }

  // Administración
  usuarios() { return firstValueFrom(this.http.get<Usuario[]>('/api/admin/usuarios')); }
  crearUsuario(d: { usuario: string; nombre: string; rol: string; empresas: string[] }) { return firstValueFrom(this.http.post<{ usuario: Usuario; claveTemporal: string }>('/api/admin/usuarios', d)); }
  editarUsuario(id: number, d: { nombre: string; rol: string; empresas: string[]; activo: boolean }) { return firstValueFrom(this.http.put<Usuario>(`/api/admin/usuarios/${id}`, d)); }
  restablecerClave(id: number) { return firstValueFrom(this.http.post<{ claveTemporal: string }>(`/api/admin/usuarios/${id}/restablecer-clave`, {})); }
  cambiarTc(e: string, tcPrepaga: number) { return firstValueFrom(this.http.put<Empresa>(`/api/admin/empresas/${e}/tc`, { tcPrepaga })); }
  bitacora(limite = 300) { return firstValueFrom(this.http.get<Bitacora[]>(`/api/admin/bitacora?limite=${limite}`)); }
}

export function guardarBlob(blob: Blob, nombre: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
