import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, mensajeError } from '../servicios/auth.service';

@Component({
  selector: 'app-cambiar-clave',
  imports: [FormsModule],
  template: `
  <div class="login-wrap">
    <form class="login-card" (ngSubmit)="guardar()">
      <div class="logo-pill"><img src="logo.png" alt="Nacional Seguros"></div>
      <h1>Cambiar <em>contraseña</em></h1>
      <p class="sub">
        @if (auth.usuario()?.debeCambiarClave) { Por seguridad, cambie la contraseña temporal antes de continuar. }
        @else { Elija una nueva contraseña. }
        Debe tener al menos 10 caracteres y combinar letras y números.
      </p>
      <label class="campo"><span>Contraseña actual</span>
        <input name="actual" type="password" [(ngModel)]="actual" autocomplete="current-password" required></label>
      <label class="campo"><span>Nueva contraseña</span>
        <input name="nueva" type="password" [(ngModel)]="nueva" autocomplete="new-password" required></label>
      <label class="campo"><span>Repetir nueva contraseña</span>
        <input name="repetir" type="password" [(ngModel)]="repetir" autocomplete="new-password" required></label>
      <button class="btn primary full" type="submit" [disabled]="ocupado()">Guardar contraseña</button>
      <div class="msg err">{{ error() }}</div>
      <p class="seguro"><button type="button" class="link" (click)="auth.salir()">Salir</button></p>
    </form>
  </div>`,
})
export class CambiarClavePage {
  auth = inject(AuthService);
  private router = inject(Router);
  actual = ''; nueva = ''; repetir = '';
  ocupado = signal(false);
  error = signal('');

  constructor() { if (!this.auth.usuario()) this.router.navigateByUrl('/login'); }

  async guardar() {
    if (this.nueva !== this.repetir) { this.error.set('Las contraseñas nuevas no coinciden.'); return; }
    this.ocupado.set(true); this.error.set('');
    try { await this.auth.cambiarClave(this.actual, this.nueva); this.router.navigateByUrl('/'); }
    catch (e) { this.error.set(mensajeError(e)); }
    this.ocupado.set(false);
  }
}
