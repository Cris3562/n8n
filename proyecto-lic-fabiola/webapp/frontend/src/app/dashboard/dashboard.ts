import { AfterViewInit, Component, ElementRef, OnChanges, OnDestroy, ViewChild, input } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { Analisis, MESES, Pareto, Periodo } from '../servicios/api.service';
import { MM, MMn, TRAMOS, bs, corto, ent, generarPdf, pct, textos } from './informe';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  template: `
  @let A = analisis();
  @let T = A.T;
  @let mx = A.maxMora;
  @let tx = tex();
  <div #dash id="dash" [class.pdf-mode]="modoPdf">
    <div class="dash-head"><div><h3>INFORME EJECUTIVO GERENCIAL – PRIMAS POR COBRAR Y RESERVAS</h3>
      <p>{{ empresa() }} · Cierre {{ mesTxt() }} · Moneda Nacional (MM Bs.) · Consolidado por póliza + contratante · Incluye todas las regionales</p></div>
      <img src="logo.png" alt="Nacional Seguros"></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Primas por cobrar</div><div class="v">{{ MMn(T.pxc) }}<small> MM Bs.</small></div><div class="s">{{ ent(A.nPolizas) }} pólizas · {{ ent(A.nClientes) }} clientes</div></div>
      <div class="kpi or"><div class="l">Mora total</div><div class="v">{{ MMn(T.mora) }}<small> MM Bs.</small></div><div class="s">Mora vs PxC: {{ pct(T.mora, T.pxc) }}</div></div>
      <div class="kpi"><div class="l">Reserva total</div><div class="v">{{ MMn(T.res) }}<small> MM Bs.</small></div><div class="s">Cobertura de mora: {{ pct(T.res, T.mora) }}</div></div>
      <div class="kpi dark"><div class="l">Mayor mora</div><div class="v">{{ ent(mx.dias) }}<small> días</small></div><div class="s">{{ corto(mx.contratante, 26) }}</div></div>
      <div class="kpi or"><div class="l">Mora mayor a 90 días</div><div class="v">{{ MMn(T.m[4]) }}<small> MM Bs.</small></div><div class="s">{{ pct(T.m[4], T.mora) }} del total mora</div></div>
      <div class="kpi"><div class="l">Deuda neta de impuestos</div><div class="v">{{ MMn(T.neto) }}<small> MM Bs.</small></div><div class="s">Impuestos y aportes: {{ MM(T.imp) }}</div></div>
      <div class="kpi"><div class="l">Top 10 reserva</div><div class="v">{{ pct(A.paretoRes.share, 1) }}</div><div class="s">Concentración de reserva</div></div>
    </div>
    <div class="dgrid">
      <div class="box"><h4>Resumen por regional – todas <small>(MM Bs.)</small></h4><div class="bd"><table>
        <tr><th>Regional</th><th class="n">PxC</th><th class="n">Mora</th><th class="n">Reserva</th><th class="n">% Mora</th></tr>
        @for (r of A.regionales; track r.nombre) { <tr><td>{{ r.nombre }}</td><td class="n">{{ MMn(r.pxc) }}</td><td class="n">{{ MMn(r.mora) }}</td><td class="n">{{ MMn(r.res) }}</td><td class="n">{{ pct(r.mora, r.pxc) }}</td></tr> }
        <tr class="tot"><td>TOTAL</td><td class="n">{{ MMn(T.pxc) }}</td><td class="n">{{ MMn(T.mora) }}</td><td class="n">{{ MMn(T.res) }}</td><td class="n">{{ pct(T.mora, T.pxc) }}</td></tr>
      </table></div></div>
      <div class="box"><h4>Pareto clientes – Primas por cobrar</h4><div class="bd chartbox"><canvas #chPxc></canvas></div></div>
      <div class="box"><h4>Pareto clientes – Reserva</h4><div class="bd chartbox"><canvas #chRes></canvas></div></div>
    </div>
    <div class="dgrid">
      <div class="box"><h4>Mora por contratante y regional – Top 6 <small>(MM Bs.)</small></h4><div class="bd"><table>
        <tr><th>Contratante</th><th>Regional</th><th class="n">Mora</th><th class="n">Días máx.</th></tr>
        @for (c of A.topMora; track c.nombre) { <tr><td [title]="c.nombre">{{ corto(c.nombre, 24) }}</td><td>{{ c.regional }}</td><td class="n">{{ MMn(c.mora) }}</td><td class="n">{{ ent(c.dias) }}</td></tr> }
      </table></div></div>
      <div class="box"><h4>Reserva por contratante y regional – Top 6 <small>(MM Bs.)</small></h4><div class="bd"><table>
        <tr><th>Contratante</th><th>Regional</th><th class="n">Reserva</th><th class="n">Cobert.</th></tr>
        @for (c of A.topRes; track c.nombre) { <tr><td [title]="c.nombre">{{ corto(c.nombre, 24) }}</td><td>{{ c.regional }}</td><td class="n">{{ MMn(c.res) }}</td><td class="n">{{ pct(c.res, c.mora) }}</td></tr> }
      </table></div></div>
      <div class="box"><h4>Cuenta con mayor días de mora</h4><div class="bd"><div class="alert">
        <div class="big">{{ ent(mx.dias) }} días de mora</div>
        <dl><dt>Cliente:</dt><dd>{{ mx.contratante }}</dd><dt>Póliza:</dt><dd>{{ mx.poliza }}</dd>
          <dt>Regional / Ramo:</dt><dd>{{ mx.regional }} / {{ mx.ramo }}</dd><dt>Mora / Reserva:</dt><dd>{{ bs(mx.mora) }} / {{ bs(mx.res) }}</dd></dl>
        @if (A.maxMoraEmpates > 1) { <p style="font-size:11px;color:var(--muted);margin:8px 0 0">* El cliente registra {{ A.maxMoraEmpates }} pólizas con la antigüedad máxima.</p> }
      </div></div></div>
    </div>
    <div class="dgrid">
      <div class="box"><h4>Mora y reserva por ramo <small>(MM Bs.)</small></h4><div class="bd"><table>
        <tr><th>Ramo</th><th class="n">PxC</th><th class="n">Mora</th><th class="n">Reserva</th><th class="n">% Mora</th></tr>
        @for (r of A.ramos; track r.nombre) { <tr><td>{{ r.nombre }}</td><td class="n">{{ MMn(r.pxc) }}</td><td class="n">{{ MMn(r.mora) }}</td><td class="n">{{ MMn(r.res) }}</td><td class="n">{{ pct(r.mora, r.pxc) }}</td></tr> }
        <tr class="tot"><td>TOTAL</td><td class="n">{{ MMn(T.pxc) }}</td><td class="n">{{ MMn(T.mora) }}</td><td class="n">{{ MMn(T.res) }}</td><td class="n">{{ pct(T.mora, T.pxc) }}</td></tr>
      </table></div></div>
      <div class="box"><h4>Mora y reserva por antigüedad (tramos)</h4><div class="bd chartbox"><canvas #chTramos></canvas></div></div>
      <div class="box"><h4>Pareto clientes – Mora</h4><div class="bd chartbox"><canvas #chMora></canvas></div></div>
    </div>
    <div class="dgrid">
      <div class="box"><h4>Lectura ejecutiva</h4><div class="bd"><ul class="bul">@for (t of tx.lectura; track $index) { <li>{{ t }}</li> }</ul></div></div>
      <div class="box"><h4>Mora y reserva por tramo <small>(MM Bs.)</small></h4><div class="bd"><table>
        <tr><th>Tramo</th><th class="n">Mora</th><th class="n">% Part.</th><th class="n">Reserva</th><th class="n">Cobert.</th></tr>
        @for (t of TRAMOS; track t; let i = $index) { <tr><td>{{ t }}</td><td class="n">{{ MMn(T.m[i]) }}</td><td class="n">{{ pct(T.m[i], T.mora) }}</td><td class="n">{{ MMn(T.r[i]) }}</td><td class="n">{{ pct(T.r[i], T.m[i]) }}</td></tr> }
        <tr class="tot"><td>Total Mora</td><td class="n">{{ MMn(T.mora) }}</td><td class="n">100.0%</td><td class="n">{{ MMn(T.res) }}</td><td class="n">{{ pct(T.res, T.mora) }}</td></tr>
      </table>
      <p style="font-size:11px;color:var(--muted);margin:8px 2px 0">* Sin mora: {{ MM(T.sin) }}. Top 10: PxC {{ pct(A.paretoPxc.share, 1) }}, mora {{ pct(A.paretoMora.share, 1) }}, reserva {{ pct(A.paretoRes.share, 1) }}.</p></div></div>
      <div class="box"><h4>Conclusiones y recomendaciones</h4><div class="bd"><ol class="bul">@for (t of tx.recs; track $index) { <li>{{ t }}</li> }</ol></div></div>
    </div>
  </div>`,
})
export class DashboardComponent implements AfterViewInit, OnChanges, OnDestroy {
  analisis = input.required<Analisis>();
  periodo = input.required<Periodo>();
  empresa = input.required<string>();
  @ViewChild('dash') dash!: ElementRef<HTMLElement>;
  @ViewChild('chPxc') chPxc!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chRes') chRes!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chMora') chMora!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chTramos') chTramos!: ElementRef<HTMLCanvasElement>;
  modoPdf = false;
  private charts: Chart[] = [];
  protected readonly MM = MM; protected readonly MMn = MMn; protected readonly pct = pct; protected readonly ent = ent;
  protected readonly corto = corto; protected readonly bs = bs; protected readonly TRAMOS = TRAMOS;

  tex() { return textos(this.analisis()); }
  mesTxt() { const p = this.periodo(); return `${MESES[p.mes].toLowerCase()} ${p.anio}`; }

  ngAfterViewInit() { this.dibujar(); }
  ngOnChanges() { if (this.chPxc) setTimeout(() => this.dibujar()); }
  ngOnDestroy() { this.charts.forEach((c) => c.destroy()); }

  private dibujar() {
    this.charts.forEach((c) => c.destroy()); this.charts = [];
    const A = this.analisis(), T = A.T;
    Chart.defaults.font.family = 'Montserrat, Segoe UI, sans-serif';
    Chart.defaults.color = '#5B7194';
    this.charts.push(this.pareto(this.chPxc.nativeElement, A.paretoPxc), this.pareto(this.chRes.nativeElement, A.paretoRes), this.pareto(this.chMora.nativeElement, A.paretoMora));
    this.charts.push(new Chart(this.chTramos.nativeElement, {
      type: 'bar',
      data: { labels: TRAMOS, datasets: [
        { label: 'Mora', data: T.m.map((v) => v / 1e6), backgroundColor: '#0D2350', borderRadius: 4 },
        { label: 'Reserva', data: T.r.map((v) => v / 1e6), backgroundColor: '#F36A10', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${(c.raw as number).toFixed(2)} MM Bs.` } } },
        scales: { y: { title: { display: true, text: 'MM Bs.' }, grid: { color: '#EEF3FA' } }, x: { grid: { display: false } } } },
    }));
  }

  private pareto(el: HTMLCanvasElement, p: Pareto) {
    return new Chart(el, {
      type: 'bar',
      data: { labels: p.top.map((c) => corto(c.nombre)), datasets: [
        { type: 'bar', label: 'MM Bs.', data: p.top.map((c) => c.valor / 1e6), backgroundColor: '#0D2350', borderRadius: 4, yAxisID: 'y', order: 2 },
        { type: 'line', label: '% acumulado', data: p.top.map((c) => c.acum * 100), borderColor: '#F36A10', backgroundColor: '#F36A10', pointRadius: 3, tension: 0.25, yAxisID: 'y1', order: 1 } as any] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, title: { display: true, text: `Top 10 = ${(p.share * 100).toFixed(1)}% del total`, color: '#F36A10', font: { size: 11, weight: 'bold' } },
          tooltip: { callbacks: { label: (c) => (c.dataset as any).type === 'line' ? `Acumulado: ${(c.raw as number).toFixed(1)}%` : `${(c.raw as number).toFixed(2)} MM Bs.` } } },
        scales: { x: { ticks: { maxRotation: 50, minRotation: 40, font: { size: 9 }, color: '#F36A10' }, grid: { display: false } },
          y: { title: { display: true, text: 'MM Bs.' }, grid: { color: '#EEF3FA' } },
          y1: { position: 'right', min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { display: false } } } },
    });
  }

  /** PDF de una hoja: amplía el dashboard, lo captura y lo restaura. */
  async pdf(nombre: string) {
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    this.modoPdf = true; this.dash.nativeElement.classList.add('pdf-mode');
    try {
      await frame(); this.charts.forEach((c) => c.resize()); await frame();
      await generarPdf(this.dash.nativeElement, nombre);
    } finally {
      this.modoPdf = false; this.dash.nativeElement.classList.remove('pdf-mode');
      await frame(); this.charts.forEach((c) => c.resize());
    }
  }
}
