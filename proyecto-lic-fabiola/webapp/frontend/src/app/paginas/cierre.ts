import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DashboardComponent } from '../dashboard/dashboard';
import { fmt } from '../dashboard/informe';
import { generarPptx } from '../dashboard/informe';
import { AuthService, mensajeError } from '../servicios/auth.service';
import { Analisis, ApiService, CONC_COLS, Empresa, MESES, ResultadoConsolidar, SISTEMAS, Saldos } from '../servicios/api.service';
import { EstadoSlot, SlotComponent } from './slot';

interface Slot { estado: EstadoSlot; texto: string; }
const vacio = (): Slot => ({ estado: '', texto: '' });

@Component({
  selector: 'app-cierre',
  imports: [FormsModule, RouterLink, SlotComponent, DashboardComponent],
  templateUrl: './cierre.html',
})
export class CierrePage implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  protected readonly SISTEMAS = SISTEMAS; protected readonly MESES = MESES; protected readonly CONC_COLS = CONC_COLS; protected readonly fmt = fmt;
  @ViewChild(DashboardComponent) dashboard?: DashboardComponent;

  // ---- Contexto ----
  empresas = signal<Empresa[]>([]);
  empresa = signal<Empresa | null>(null);
  mes = 0; anio = 2026;
  corteTxt = signal('');
  editandoTc = signal(false); tcNuevo = 6.86; msgTc = signal('');
  paso = signal(1);
  hechos = signal<Set<number>>(new Set());

  // ---- Paso 1 ----
  slots = signal<Record<string, Slot>>(Object.fromEntries(SISTEMAS.map((s) => [s.id, vacio()])));
  cargados = computed(() => Object.values(this.slots()).filter((s) => s.estado === 'loaded').length);
  ocupado1 = signal(false); msg1 = signal(''); err1 = signal(false);
  resultado1 = signal<ResultadoConsolidar | null>(null);

  // ---- Paso 2 ----
  slotConsC = signal<Slot>(vacio()); slotResp = signal<Slot>(vacio());
  ocupado2 = signal(false); msg2 = signal(''); err2 = signal(false);
  tecnico = signal<Record<string, number> | null>(null);
  contable = signal<Saldos | null>(null);
  hayConsolidado = signal(false);

  // ---- Paso 3 ----
  slotFinal = signal<Slot>(vacio());
  ocupado3 = signal(false); msg3 = signal(''); err3 = signal(false);
  analisis = signal<Analisis | null>(null);

  async ngOnInit() {
    const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1);
    this.mes = prev.getMonth(); this.anio = prev.getFullYear();
    try {
      const lista = await this.api.empresas();
      this.empresas.set(lista);
      this.empresa.set(lista.find((e) => e.activa) ?? lista[0] ?? null);
    } catch (e) { this.msg1.set(mensajeError(e)); this.err1.set(true); }
  }

  get periodo() { return { mes: +this.mes, anio: +this.anio }; }
  get cod() { return this.empresa()!.codigo; }
  private marcar(n: number, on = true) { const s = new Set(this.hechos()); on ? s.add(n) : s.delete(n); this.hechos.set(s); }
  private setSlot(id: string, s: Slot) { this.slots.set({ ...this.slots(), [id]: s }); }

  elegirEmpresa(e: Empresa) {
    if (!e.activa || e.codigo === this.empresa()?.codigo) return;
    this.empresa.set(e); this.limpiar1(); this.limpiar2(); this.limpiar3();
  }

  // ---- Tipo de cambio (solo administrador) ----
  editarTc() { this.tcNuevo = this.empresa()!.tcPrepaga; this.editandoTc.set(true); this.msgTc.set(''); }
  async guardarTc() {
    try {
      const e = await this.api.cambiarTc(this.cod, +this.tcNuevo);
      this.empresa.set(e); this.empresas.set(this.empresas().map((x) => (x.codigo === e.codigo ? e : x)));
      this.editandoTc.set(false);
    } catch (err) { this.msgTc.set(mensajeError(err)); }
  }

  // ================= PASO 1 =================
  async cargarSistema(id: string, f: File) {
    this.setSlot(id, { estado: 'busy', texto: `Leyendo ${f.name}… ${f.size > 5e6 ? '(archivo grande, puede tardar unos segundos)' : ''}` });
    try {
      const r = await this.api.cargarSistema(this.cod, id, f);
      this.setSlot(id, { estado: 'loaded', texto: `${f.name} · ${fmt(r.filas, 0)} registros · PxC ${r.moneda === 'USD' ? 'USD ' : ''}${fmt(r.pxc)}` });
      if (r.corte && !this.corteTxt()) {
        this.mes = r.corte.mes; this.anio = r.corte.anio;
        this.corteTxt.set(`✔ Cierre detectado: ${String(r.corte.dia).padStart(2, '0')}/${String(r.corte.mes + 1).padStart(2, '0')}/${r.corte.anio}`);
      }
    } catch (e) { this.setSlot(id, { estado: 'error', texto: mensajeError(e) }); }
  }

  async consolidar() {
    const falt = SISTEMAS.filter((s) => this.slots()[s.id].estado !== 'loaded').map((s) => s.id);
    if (falt.length && !confirm(`Faltan: ${falt.join(', ')}.\n¿Generar el consolidado igualmente?`)) return;
    this.ocupado1.set(true); this.err1.set(false); this.msg1.set('Consolidando y armando el Excel… (unos segundos)');
    try {
      const r = await this.api.consolidar(this.cod, this.periodo);
      await this.api.descargar(r.archivo);
      this.resultado1.set(r); this.marcar(1); this.hayConsolidado.set(true);
      this.msg1.set(`✔ Se descargó «${r.archivo.nombre}»`);
    } catch (e) { this.err1.set(true); this.msg1.set('No se pudo consolidar: ' + mensajeError(e)); }
    this.ocupado1.set(false);
  }

  async limpiar1() {
    if (this.empresa()) this.api.limpiarSistemas(this.cod).catch(() => {});
    this.slots.set(Object.fromEntries(SISTEMAS.map((s) => [s.id, vacio()])));
    this.resultado1.set(null); this.msg1.set(''); this.corteTxt.set(''); this.marcar(1, false); this.hayConsolidado.set(false);
  }

  // ================= PASO 2 =================
  async cargarConsC(f: File) {
    this.slotConsC.set({ estado: 'busy', texto: `Leyendo ${f.name}…` });
    try {
      const r = await this.api.cargarConsolidadoConciliacion(this.cod, f);
      this.slotConsC.set({ estado: 'loaded', texto: `${f.name} · ${fmt(r.filas, 0)} registros` }); this.hayConsolidado.set(true);
    } catch (e) { this.slotConsC.set({ estado: 'error', texto: mensajeError(e) }); }
  }

  async conciliacion(conDiferencias: boolean) {
    this.ocupado2.set(true); this.err2.set(false); this.msg2.set('Calculando saldo técnico…');
    try {
      const r = await this.api.conciliacion(this.cod, this.periodo, conDiferencias);
      this.tecnico.set(r.tecnico);
      await this.api.descargar(r.archivo);
      this.msg2.set(`✔ Se descargó «${r.archivo.nombre}»`);
    } catch (e) { this.err2.set(true); this.msg2.set(mensajeError(e)); }
    this.ocupado2.set(false);
  }

  async cargarRespuesta(f: File) {
    this.slotResp.set({ estado: 'busy', texto: `Leyendo ${f.name}… (archivos grandes pueden tardar)` });
    try {
      const r = await this.api.respuestaContabilidad(this.cod, f);
      this.contable.set(r.contable);
      if (!this.tecnico()) this.tecnico.set(Object.fromEntries(CONC_COLS.map((c) => [c, r.tecnicoArchivo[c] ?? 0])));
      this.slotResp.set({ estado: 'loaded', texto: `${f.name} · ${r.completos} saldos contables leídos` });
      this.marcar(2);
    } catch (e) { this.slotResp.set({ estado: 'error', texto: mensajeError(e) }); }
  }

  diferencias = computed(() => {
    const t = this.tecnico(), k = this.contable();
    if (!t || !k) return null;
    let tt = 0, tc = 0;
    const filas = CONC_COLS.map((c) => {
      const tec = t[c] ?? 0, con = k[c];
      tt += tec; if (typeof con === 'number') tc += con;
      const d = typeof con === 'number' ? con - tec : null;
      return { ramo: c, tec, con, d, estado: d === null ? 'wait' : Math.abs(d) <= 1 ? 'ok' : 'bad' };
    });
    return { filas, tt, tc };
  });

  limpiar2() {
    if (this.empresa()) this.api.limpiarConciliacion(this.cod).catch(() => {});
    this.slotConsC.set(vacio()); this.slotResp.set(vacio()); this.tecnico.set(null); this.contable.set(null); this.msg2.set('');
    this.marcar(2, false); this.hayConsolidado.set(this.hechos().has(1));
  }

  // ================= PASO 3 =================
  async cargarFinal(f: File) {
    this.slotFinal.set({ estado: 'busy', texto: `Leyendo ${f.name}… (archivo grande, puede tardar unos segundos)` });
    this.ocupado3.set(true); this.err3.set(false); this.msg3.set('Analizando la cartera…');
    try {
      const r = await this.api.cargarFinal(this.cod, f);
      this.analisis.set(r.analisis);
      this.slotFinal.set({ estado: 'loaded', texto: `${f.name} · ${fmt(r.analisis.registros, 0)} registros` });
      this.msg3.set(''); this.marcar(3); this.hayConsolidado.set(true);
    } catch (e) { this.slotFinal.set({ estado: 'error', texto: mensajeError(e) }); this.msg3.set(''); }
    this.ocupado3.set(false);
  }

  async anexo() {
    try { const r = await this.api.anexo(this.cod, this.periodo); await this.api.descargar(r.archivo); }
    catch (e) { this.err3.set(true); this.msg3.set(mensajeError(e)); }
  }

  async pptx() {
    this.ocupado3.set(true); this.err3.set(false); this.msg3.set('Generando PowerPoint…');
    try {
      await generarPptx(this.analisis()!, this.periodo, { nombre: this.empresa()!.nombre, codigo: this.cod });
      this.api.registrarInforme(this.cod, this.periodo, 'pptx').catch(() => {});
      this.msg3.set('');
    } catch (e) { this.err3.set(true); this.msg3.set('No se pudo generar el PowerPoint: ' + (e as Error).message); }
    this.ocupado3.set(false);
  }

  async pdf() {
    this.ocupado3.set(true); this.err3.set(false); this.msg3.set('Generando PDF…');
    try {
      await this.dashboard!.pdf(`Informe Ejecutivo Gerencial Primas y Reservas ${this.cod} ${MESES[this.periodo.mes]} ${this.periodo.anio}.pdf`);
      this.api.registrarInforme(this.cod, this.periodo, 'pdf').catch(() => {});
      this.msg3.set('');
    } catch (e) { this.err3.set(true); this.msg3.set('No se pudo generar el PDF: ' + (e as Error).message); }
    this.ocupado3.set(false);
  }

  limpiar3() {
    if (this.empresa()) this.api.limpiarFinal(this.cod).catch(() => {});
    this.analisis.set(null); this.slotFinal.set(vacio()); this.msg3.set(''); this.marcar(3, false);
  }
}
