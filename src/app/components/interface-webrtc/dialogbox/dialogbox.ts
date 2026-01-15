import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dialogbox',
  imports: [FormsModule, CommonModule],
  templateUrl: './dialogbox.html',
  styleUrl: './dialogbox.scss',
})
export class Dialogbox implements OnInit {
  devices: MediaDeviceInfo[] = [];
  selectedInputId: string = '';
  selectedOutputId: string = '';
  @Output() deviceSelected = new EventEmitter<string>();

  constructor(public dialogRef: MatDialogRef<Dialogbox>) {}

  ngOnInit(): void {
    this.loadDevices();
  }

  private loadDevices(): void {
    navigator.mediaDevices.enumerateDevices().then((deviceInfos) => {
      this.devices = deviceInfos;
    });
  }
  AudioDeviceSelected() {
    this.dialogRef.close(this.selectedInputId);
  }
}
