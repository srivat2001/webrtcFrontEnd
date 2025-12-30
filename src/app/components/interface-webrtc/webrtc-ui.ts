import {
  Component,
  ElementRef,
  Inject,
  Input,
  signal,
  Signal,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../matimports';
import { HelperToolbox } from './helper-toolbox/helper-toolbox';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ManualWebrtcService } from '../../services/manual-webrtc.service';
import { Spinner } from '../../assets/spinner/spinner';
import { WebRTCService } from '../../services/webrtc.service';
export enum ScreenShareState {
  Idle = 'IDLE',
  Starting = 'STARTING',
  InProgress = 'IN_PROGRESS',
  Stopped = 'STOPPED',
  Failed = 'FAILED',
}
@Component({
  selector: 'app-webrtc-ui',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, CommonModule, FormsModule, Spinner],
  templateUrl: './webrtc-ui.html',
  styleUrl: './webrtc-ui.scss',
})
export class WebrtcUiComponent {
  @Input() type: 'offer' | 'answer' = 'offer';
  messages: any = [];
  sendBtn = signal(true);
  isScreenShareStarted = signal(false);
  connectionState = 'Disconnected';
  chathidden = true;
  connectedcreated = false;
  status = signal('nothing');
  @ViewChild('screenVideo') screenVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  status_text: Record<string, string> = {
    nothing: 'Enter room iD',
    connected: 'Connected to Room',
    offer_initiated: 'Creating a connection',
    user_id_created: 'Connection created! Share your Room ID',
  };
  isReceivingScreen = signal(false);
  screenShareState: ScreenShareState = ScreenShareState.Idle;
  ScreenShareState1 = ScreenShareState;
  animal!: string;
  name!: string;
  isVideostarted = false;
  private cameraStream: MediaStream | null = null;
  private _videoStream: MediaStream | null = null;
  chunks: Blob[] = [];
  mediaRecorder!: MediaRecorder;
  constructor(
    public dialog: MatDialog,
    private readonly manualWebrtcService: ManualWebrtcService,
    private readonly webrtcService: WebRTCService
  ) {
    this.webrtcService.videoUpdate$.subscribe(({ stream, type, isReceivingScreen }) => {
      this.updateVideo(stream, type, isReceivingScreen);
    });
    this.webrtcService.connStateData$.subscribe((state) => {
      this.connectedcreated = state.connectedcreated;
      this.status.set(state.status);
      this.sendBtn.set(state.sendBtn);
    });
  }
  get logs() {
    return [];
  }
  ngOnInit() {
    if (this.type === 'offer') {
      this.status_text['nothing'] = 'Create a connection';
    } else {
      this.status_text['nothing'] = 'Enter room iD';
    }
  }
  public showAlert() {
    this.alertHost.clear();
    this.alertHost.createComponent(HelperToolbox);
    setTimeout(() => {
      this.hideAlert();
    }, 10000);
  }
  hideAlert() {
    this.alertHost.clear();
  }
  @ViewChild('alertHost', { read: ViewContainerRef })
  alertHost!: ViewContainerRef;
  @Input()
  set videoStream(stream: MediaStream | null) {
    this._videoStream = stream;
    this.updateVideo(stream);
  }
  get videoStream() {
    return this._videoStream;
  }
  async startCamera() {
    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    this.manualWebrtcService.setCameraStream(this.cameraStream);
    const camVideo = this.cameraVideo?.nativeElement;
    if (!camVideo) return;
    camVideo.srcObject = this.cameraStream;
    camVideo.muted = true;
    camVideo.playsInline = true;
    await camVideo.play();
  }

  startScreenShare = async () => {
    try {
      this.screenShareState = ScreenShareState.Starting;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.manualWebrtcService.setScreenRecordingStream(stream);
      this.updateVideo(stream);
      this.isScreenShareStarted.set(true);
      this.screenShareState = ScreenShareState.InProgress;
    } catch (err) {
      this.screenShareState = ScreenShareState.Idle;
    }
  };

  async takeScreenshot() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    this.isVideostarted = true;
    this.manualWebrtcService.start();
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp9',
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      this.isVideostarted = false;
      this.manualWebrtcService.stop();
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      stream.getTracks().forEach((t) => t.stop());
    };

    // 3️⃣ Start + auto-stop after 10s
    this.mediaRecorder.start();

    setTimeout(() => {
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    }, 3000);
  }
  createOffer() {
    if (this.type === 'offer') {
      this.webrtcService.createOffer();
    } else {
      this.webrtcService.connectToExistingConnection();
    }
  }
  setRoomId(v: string) {
    this.webrtcService.setRoomid(v);
  }
  getRoomId() {
    return this.webrtcService.getRoomid();
  }
  resetConnection() {
    this.webrtcService.resetWebRTC();
  }
  stoprecording() {
    return this.mediaRecorder.stop();
  }
  stopScreenShare() {
    this.manualWebrtcService.StopScreenRecordingStream();
    this.updateVideo(null, 'screen', false);
    this.screenShareState = ScreenShareState.Stopped;
  }
  openchat() {
    this.chathidden = !this.chathidden;
  }
  public updateVideo(stream: MediaStream | null, type = 'screen', isReceivingScreen = false) {
    this.isReceivingScreen.set(isReceivingScreen);
    let videoRef = null;
    if (type === 'camera') {
      videoRef = this.cameraVideo?.nativeElement;
    } else {
      videoRef = this.screenVideo?.nativeElement;
    }
    const video = videoRef;
    if (!video) return;
    if (stream) {
      const track = stream.getVideoTracks()[0];
      track.onended = () => this.stopScreenShare();
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});
    } else {
      video.pause();
      video.srcObject = null;
    }
  }
  openDialog(): void {
    const dialogRef = this.dialog.open(DialogOverviewExampleDialog, {
      width: '250px',
      data: { name: this.name, animal: this.animal },
    });

    dialogRef.afterClosed().subscribe((result) => {
      console.log('The dialog was closed');
      this.animal = result;
    });
  }
}

@Component({
  selector: 'dialog-overview-example-dialog',
  template: '<h1 mat-dialog-title>Alert</h1>',
})
export class DialogOverviewExampleDialog {
  constructor(
    public dialogRef: MatDialogRef<DialogOverviewExampleDialog>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }
}
