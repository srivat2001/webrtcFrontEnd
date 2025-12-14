import { Component } from '@angular/core';
import { MATERIAL_IMPORTS } from '../matimports';
import { ManualWebrtcService } from '../../services/manual-webrtc.service';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-stacktrace',
  imports: [MATERIAL_IMPORTS, CommonModule],
  templateUrl: './stacktrace.html',
  styleUrl: './stacktrace.scss',
})
export class Stacktrace {
  constructor(private readonly ManualWebrtcService: ManualWebrtcService) {}
  getLogs() {
    return this.ManualWebrtcService.getLogs()().reverse();
  }
}
