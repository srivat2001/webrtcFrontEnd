import { Directive, ElementRef, Input, OnChanges, SimpleChanges, NgZone } from '@angular/core';

@Directive({
  selector: '[flip]',
  standalone: true,
})
export class FlipDirective implements OnChanges {
  @Input() flipKey: any;

  private first!: DOMRect;

  constructor(private el: ElementRef, private zone: NgZone) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['flipKey']) {
      this.zone.runOutsideAngular(() => {
        this.first = this.el.nativeElement.getBoundingClientRect();
        requestAnimationFrame(() => {
          this.animate();
        });
      });
    }
  }

  private animate() {
    const el = this.el.nativeElement;
    const last = el.getBoundingClientRect();
    const dx = this.first.left - last.left;
    const dy = this.first.top - last.top;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transition = 'transform 0s';
    el.getBoundingClientRect();

    requestAnimationFrame(() => {
      el.style.transition = 'transform 250ms ease';
      el.style.transform = 'translate(0,0)';
    });
  }
}
