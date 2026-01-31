import { Component, EventEmitter, OnInit, Output, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

export enum DialogboxType {
  AudioSelector = 'AudioSelector',
  Confirm = 'Confirm',
  ScreenRecorder = 'ScreenRecorder',
}

export type DialogboxData = {
  type?: DialogboxType | string;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
};

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

  // Expose dialog type for template switching
  public dialogType: DialogboxType = DialogboxType.AudioSelector;

  // injected data allows using this dialog for multiple purposes (device picker, confirmation, etc.)
  constructor(
    public dialogRef: MatDialogRef<Dialogbox>,
    @Inject(MAT_DIALOG_DATA) public data: DialogboxData | null,
  ) {}

  ngOnInit(): void {
    // Normalize legacy `data.mode` values to new `dialogType` values
    const legacyMode = (this.data as any)?.mode;
    if (legacyMode === 'confirm') this.dialogType = DialogboxType.Confirm;

    if (this.data && (this.data as any).type) {
      const t = (this.data as any).type as string;
      if (Object.values(DialogboxType).includes(t as DialogboxType)) {
        this.dialogType = t as DialogboxType;
      }
    }

    // Initialize handler specific to the dialog type
    switch (this.dialogType) {
      case DialogboxType.AudioSelector:
        AudioSelectorHandler.init(this);
        break;
      case DialogboxType.Confirm:
        ConfirmHandler.init(this);
        break;
      case DialogboxType.ScreenRecorder:
        ScreenRecorderHandler.init(this);
        break;
      default:
        AudioSelectorHandler.init(this);
    }
  }

  public loadDevices(): void {
    navigator.mediaDevices.enumerateDevices().then((deviceInfos) => {
      this.devices = deviceInfos;
    });
  }

  AudioDeviceSelected() {
    if (!this.dialogRef) return;
    this.dialogRef.close(this.selectedInputId);
  }

  // confirm dialog helpers
  confirmYes() {
    if (!this.dialogRef) return;
    this.dialogRef.close(true);
  }
  confirmNo() {
    if (!this.dialogRef) return;
    this.dialogRef.close(false);
  }
}

/**
 * Handlers below encapsulate logic for each dialog variant. This keeps the component
 * small and makes it straightforward to add new dialog kinds in the future.
 */
class AudioSelectorHandler {
  static init(dialog: Dialogbox) {
    dialog.loadDevices();
  }
}

class ConfirmHandler {
  static init(_dialog: Dialogbox) {
    // Confirm dialog currently requires no asynchronous init.
  }
}

class ScreenRecorderHandler {
  static init(_dialog: Dialogbox) {
    // Placeholder: screen-recorder specific initialization can be added here.
  }
}
