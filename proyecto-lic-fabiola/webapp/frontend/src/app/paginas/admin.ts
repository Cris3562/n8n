import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService, Usuario, mensajeError } from '../servicios/auth.service';
import { ApiService, Bitacora } from '../servicios/api.service';

const EMPRESAS = [{ codigo: 'NSVS', nombre: 'Vida y Salud' }, { codigo: 'NSPF', nombre: 'Patrimoniales y Fianzas' }];

@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
  <section class="hero"><div class="hero-inner" style="padding-bottom:84px">
    <div class="topbar">
      <div class="logo-pill"><img src="logo.png" alt="Nacional Seguros"></div>
      <div class="userbar">
        <div class="who"><b>{{ auth.usuario()?.nombre || auth.usuario()?.usuario }}</b>Administrador</div>
        <a class="btn ghost-w" routerLink="/">← Volver al cierre</a>
        <button class="btn ghost-w" type="button" (click)="auth.salir()">Salir</button>
      </div>
    </div>
    <div class="eyebrow">Cierre de Reservas y Primas por Cobrar</div>
    <h1>Administración de <em>usuarios</em></h1>
  </div></section>
  <main>
    <section class="card panel">
      <div class="section-title"><h2>Nuevo <em>usuario</em></h2><small>Se genera una contraseña temporal que debe cambiar al ingresar</small></div>
      <form class="form-row" style="margin-top:14px" (ngSubmit)="crear()">
        <label class="campo"><span>Usuario</span><input name="u" [(ngModel)]="nuevo.usuario" placeholder="nombre.apellido" required></label>
        <label class="campo"><span>Nombre completo</span><input name="n" [(ngModel)]="nuevo.nombre" required></label>
        <label class="campo"><span>Rol</span><select name="r" [(ngModel)]="nuevo.rol"><option value="Usuario">Usuario</option><option value="Admin">Administrador</option></select></label>
        <div class="campo"><span>Empresas</span>
          @for (e of EMPRESAS; track e.codigo) { <label class="check"><input type="checkbox" [checked]="nuevo.empresas.includes(e.codigo)" (change)="alternar(nuevo.empresas, e.codigo)"> {{ e.nombre }}</label> }
        </div>
        <div><button class="btn primary" type="submit">Crear usuario</button></div>
      </form>
      <div class="msg" [class.err]="esError()">{{ msg() }}</div>
      @if (claveTemp(); as c) {
        <div class="clave-temp">Contraseña temporal para <b>{{ c.usuario }}</b>: <code>{{ c.clave }}</code><br>
          <small>Entréguela de forma segura. Solo se muestra una vez; el usuario deberá cambiarla en su primer ingreso.</small></div>
      }
    </section>

    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h2>Usuarios</h2></div>
      <div class="tablewrap"><table>
        <tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Empresas</th><th>Estado</th><th>Último acceso</th><th></th></tr>
        @for (u of usuarios(); track u.id) {
          @if (editando()?.id === u.id) {
            <tr><td>{{ u.usuario }}</td>
              <td><input [(ngModel)]="ed.nombre" name="en" style="width:100%"></td>
              <td><select [(ngModel)]="ed.rol" name="er"><option value="Usuario">Usuario</option><option value="Admin">Administrador</option></select></td>
              <td>@for (e of EMPRESAS; track e.codigo) { <label class="check"><input type="checkbox" [checked]="ed.empresas.includes(e.codigo)" (change)="alternar(ed.empresas, e.codigo)"> {{ e.codigo }}</label> }</td>
              <td><label class="check"><input type="checkbox" [(ngModel)]="ed.activo" name="ea"> Activo</label></td>
              <td></td>
              <td><button class="link" type="button" (click)="guardar(u)">Guardar</button> · <button class="link" type="button" (click)="editando.set(null)">Cancelar</button></td></tr>
          } @else {
            <tr><td><b>{{ u.usuario }}</b></td><td>{{ u.nombre }}</td>
              <td><span class="chip" [class.admin]="u.rol === 'Admin'">{{ u.rol === 'Admin' ? 'Administrador' : 'Usuario' }}</span></td>
              <td><div class="chips">@for (e of u.empresas; track e) { <span class="chip">{{ e }}</span> }</div></td>
              <td>@if (u.activo) { <span class="pill ok">Activo</span> } @else { <span class="chip off">Inactivo</span> }</td>
              <td>{{ u.ultimoAcceso ? (u.ultimoAcceso | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
              <td><button class="link" type="button" (click)="editar(u)">Editar</button> · <button class="link" type="button" (click)="restablecer(u)">Restablecer contraseña</button></td></tr>
          }
        }
      </table></div>
    </section>

    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h2>Bitácora</h2><small>Últimas 300 acciones · no contiene datos de clientes</small></div>
      <div class="tablewrap" style="max-height:420px;overflow:auto"><table>
        <tr><th>Fecha</th><th>Usuario</th><th>Empresa</th><th>Acción</th><th>Período</th><th>Resultado</th><th>Detalle</th></tr>
        @for (b of bitacora(); track b.id) {
          <tr><td>{{ b.fecha + 'Z' | date: 'dd/MM/yyyy HH:mm:ss' }}</td><td>{{ b.usuario }}</td><td>{{ b.empresa || '' }}</td><td>{{ b.accion }}</td><td>{{ b.periodo || '' }}</td>
            <td>@if (b.resultado === 'OK') { <span class="pill ok">OK</span> } @else { <span class="pill bad">{{ b.resultado }}</span> }</td>
            <td style="max-width:360px;overflow:hidden;text-overflow:ellipsis" [title]="b.detalle || ''">{{ b.detalle || '' }}</td></tr>
        }
      </table></div>
    </section>
  </main>`,
})
export class AdminPage implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  protected readonly EMPRESAS = EMPRESAS;
  usuarios = signal<Usuario[]>([]);
  bitacora = signal<Bitacora[]>([]);
  msg = signal(''); esError = signal(false);
  claveTemp = signal<{ usuario: string; clave: string } | null>(null);
  editando = signal<Usuario | null>(null);
  nuevo = { usuario: '', nombre: '', rol: 'Usuario', empresas: ['NSVS'] as string[] };
  ed = { nombre: '', rol: 'Usuario', empresas: [] as string[], activo: true };

  async ngOnInit() { await this.recargar(); }
  async recargar() {
    try { this.usuarios.set(await this.api.usuarios()); this.bitacora.set(await this.api.bitacora()); }
    catch (e) { this.aviso(mensajeError(e), true); }
  }
  private aviso(t: string, err = false) { this.msg.set(t); this.esError.set(err); }
  alternar(lista: string[], cod: string) { const i = lista.indexOf(cod); i >= 0 ? lista.splice(i, 1) : lista.push(cod); }

  async crear() {
    this.claveTemp.set(null);
    try {
      const r = await this.api.crearUsuario(this.nuevo);
      this.claveTemp.set({ usuario: r.usuario.usuario, clave: r.claveTemporal });
      this.aviso(`✔ Usuario ${r.usuario.usuario} creado.`);
      this.nuevo = { usuario: '', nombre: '', rol: 'Usuario', empresas: ['NSVS'] };
      await this.recargar();
    } catch (e) { this.aviso(mensajeError(e), true); }
  }
  editar(u: Usuario) { this.ed = { nombre: u.nombre, rol: u.rol, empresas: [...u.empresas], activo: u.activo }; this.editando.set(u); }
  async guardar(u: Usuario) {
    try { await this.api.editarUsuario(u.id, this.ed); this.editando.set(null); this.aviso(`✔ Usuario ${u.usuario} actualizado.`); await this.recargar(); }
    catch (e) { this.aviso(mensajeError(e), true); }
  }
  async restablecer(u: Usuario) {
    if (!confirm(`¿Generar una nueva contraseña temporal para ${u.usuario}?`)) return;
    try { const r = await this.api.restablecerClave(u.id); this.claveTemp.set({ usuario: u.usuario, clave: r.claveTemporal }); this.aviso(''); await this.recargar(); }
    catch (e) { this.aviso(mensajeError(e), true); }
  }
}
