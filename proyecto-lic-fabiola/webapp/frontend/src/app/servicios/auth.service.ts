import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, throwError } from 'rxjs';

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  rol: 'Admin' | 'Usuario';
  empresas: string[];
  activo: boolean;
  debeCambiarClave: boolean;
  ultimoAcceso?: string | null;
}

const CLAVE_SESION = 'cierre.sesion';

/** Sesión del usuario. El token vive solo en sessionStorage (se borra al cerrar la pestaña). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly usuario = signal<Usuario | null>(null);
  readonly esAdmin = computed(() => this.usuario()?.rol === 'Admin');
  private token: string | null = null;

  constructor() {
    try {
      const s = JSON.parse(sessionStorage.getItem(CLAVE_SESION) || 'null');
      if (s?.token) { this.token = s.token; this.usuario.set(s.usuario); }
    } catch { /* sin almacenamiento disponible */ }
  }

  get tokenActual() { return this.token; }

  private guardar(token: string, usuario: Usuario) {
    this.token = token; this.usuario.set(usuario);
    try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ token, usuario })); } catch { /* */ }
  }

  async login(usuario: string, clave: string) {
    const r = await firstValueFrom(this.http.post<{ token: string; usuario: Usuario }>('/api/auth/login', { usuario, clave }));
    this.guardar(r.token, r.usuario);
    return r.usuario;
  }

  async cambiarClave(actual: string, nueva: string) {
    const r = await firstValueFrom(this.http.post<{ token: string; usuario: Usuario }>('/api/auth/cambiar-clave', { actual, nueva }));
    this.guardar(r.token, r.usuario);
  }

  salir() {
    this.token = null; this.usuario.set(null);
    try { sessionStorage.removeItem(CLAVE_SESION); } catch { /* */ }
    this.router.navigateByUrl('/login');
  }
}

/** Agrega el token a cada llamada a la API y cierra la sesión si expiró. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const t = auth.tokenActual;
  const r = t && req.url.startsWith('/api') ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;
  return next(r).pipe(catchError((e: HttpErrorResponse) => {
    if (e.status === 401 && !req.url.endsWith('/api/auth/login')) auth.salir();
    return throwError(() => e);
  }));
};

export const sesionGuard: CanActivateFn = () => {
  const auth = inject(AuthService), router = inject(Router);
  const u = auth.usuario();
  if (!u) return router.parseUrl('/login');
  if (u.debeCambiarClave) return router.parseUrl('/cambiar-clave');
  return true;
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService), router = inject(Router);
  return auth.usuario()?.rol === 'Admin' ? true : router.parseUrl('/');
};

/** Mensaje legible de un error de la API. */
export function mensajeError(e: unknown): string {
  const err = e as HttpErrorResponse;
  if (err?.error?.mensaje) return err.error.mensaje;
  if (err?.status === 0) return 'No hay conexión con el servidor.';
  if (err?.status === 413) return 'El archivo es demasiado grande.';
  if (err?.status === 429) return 'Demasiadas solicitudes seguidas. Espere un minuto e intente de nuevo.';
  return 'Ocurrió un error inesperado.';
}
