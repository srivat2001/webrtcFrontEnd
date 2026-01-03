import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-helper-toolbox',
  imports: [],
  templateUrl: './helper-toolbox.html',
  styleUrl: './helper-toolbox.scss',
})
export class HelperToolbox {
  @Input() Errormessage = '';
}
