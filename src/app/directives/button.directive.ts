import { Directive, ElementRef, Renderer2 } from '@angular/core';

@Directive({
  selector: 'button',
  standalone: true
})
export class GlobalFilledButtonDirective {
  constructor(private el: ElementRef, private renderer: Renderer2) {
    const element = this.el.nativeElement;
    console.log('GlobalFilledButtonDirective called for:', el.nativeElement);

    // Don't override user preference
    if (!element.hasAttribute('matButton')) {
      this.renderer.setAttribute(element, 'matButton', 'filled');
    }
  }
}
