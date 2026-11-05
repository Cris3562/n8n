import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, mensajeError } from '../servicios/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
  <div class="login-wrap">
    <form class="login-card" (ngSubmit)="entrar()">
      <div class="logo-pill"><img src="logo.png" alt="Nacional Seguros"></div>
      <div class="eyebrow" style="color:var(--orange)">Área Cobranzas</div>
      <h1>Cierre de <em>Reservas</em> y <em>Primas por Cobrar</em></h1>
      <p class="sub">Ingrese con su usuario y contraseña.</p>
      <label class="campo"><span>Usuario</span>
        <input name="usuario" [(ngModel)]="usuario" autocomplete="username" required autofocus></label>
      <label class="campo"><span>Contraseña</span>
        <input name="clave" type="password" [(ngModel)]="clave" autocomplete="current-password" required></label>
      <button class="btn primary full" type="submit" [disabled]="ocupado() || !usuario || !clave">
        @if (ocupado()) { <span class="spin" style="width:18px;height:18px"></span> } Ingresar
      </button>
      <div class="msg err">{{ error() }}</div>
      <p class="seguro">🔒 Acceso restringido al personal autorizado de Nacional Seguros.</p>
    </form>
  </div>`,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  usuario = ''; clave = '';
  ocupado = signal(false);
  error = signal('');

  async entrar() {
    this.ocupado.set(true); this.error.set('');
    try {
      const u = await this.auth.login(this.usuario, this.clave);
      this.router.navigateByUrl(u.debeCambiarClave ? '/cambiar-clave' : '/');
    } catch (e) { this.error.set(mensajeError(e)); }
    this.ocupado.set(false);
  }
}
