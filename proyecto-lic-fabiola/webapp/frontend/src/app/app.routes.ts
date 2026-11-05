import { Routes } from '@angular/router';
import { adminGuard, sesionGuard } from './servicios/auth.service';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./paginas/login').then((m) => m.LoginPage) },
  { path: 'cambiar-clave', loadComponent: () => import('./paginas/cambiar-clave').then((m) => m.CambiarClavePage) },
  { path: 'admin', canActivate: [sesionGuard, adminGuard], loadComponent: () => import('./paginas/admin').then((m) => m.AdminPage) },
  { path: '', canActivate: [sesionGuard], loadComponent: () => import('./paginas/cierre').then((m) => m.CierrePage) },
  { path: '**', redirectTo: '' },
];
