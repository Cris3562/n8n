import { Component, input, output, signal } from '@angular/core';

export type EstadoSlot = '' | 'busy' | 'loaded' | 'error';

/** Recuadro para subir un archivo (clic o arrastrar). */
@Component({
  selector: 'app-slot',
  template: `
  <label class="slot" [class.busy]="estado() === 'busy'" [class.loaded]="estado() === 'loaded'" [class.error]="estado() === 'error'" [class.drag]="drag()"
    (dragover)="$event.preventDefault(); drag.set(true)" (dragleave)="drag.set(false)" (drop)="soltar($event)">
    <div class="ico">
      @switch (estado()) {
        @case ('busy') { <div class="spin"></div> }
        @case ('loaded') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg> }
        @case ('error') { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg> }
        @default { <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M12 18v-6m0 0-2.5 2.5M12 12l2.5 2.5"/></svg> }
      }
    </div>
    <div class="meta"><div class="k">{{ etiqueta() }}</div><div class="t">{{ titulo() }}</div><div class="f">{{ texto() || 'Seleccionar archivo' }}</div></div>
    <input type="file" [accept]="acepta()" (change)="elegir($event)" [disabled]="estado() === 'busy'">
  </label>`,
})
export class SlotComponent {
  etiqueta = input('');
  titulo = input('');
  texto = input('');
  estado = input<EstadoSlot>('');
  acepta = input('.xlsx,.xls,.csv');
  archivo = output<File>();
  drag = signal(false);

  elegir(e: Event) {
    const inp = e.target as HTMLInputElement;
    if (inp.files?.[0]) this.archivo.emit(inp.files[0]);
    inp.value = '';
  }
  soltar(e: DragEvent) {
    e.preventDefault(); this.drag.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && this.estado() !== 'busy') this.archivo.emit(f);
  }
}
