import {
  AfterViewInit,
  Component,
  ComponentRef,
  ElementRef,
  inject,
  Inject,
  Input,
  inputBinding,
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
import { MediaState } from '../../models/media-state.model';
@Component({
  selector: 'app-webrtc-ui',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, CommonModule, FormsModule, Spinner],
  templateUrl: './webrtc-ui.html',
  styleUrl: './webrtc-ui.scss',
})
export class WebrtcUiComponent implements AfterViewInit {
  @Input() type: 'offer' | 'answer' = 'offer';
  messages: any = [];
  sendBtn = signal(true);
  isScreenShareStarted = signal(false);
  connectionState = 'Disconnected';
  private vcr = inject(ViewContainerRef);
  private helperTollboxRef?: ComponentRef<HelperToolbox>; // ← store it here
  chathidden = true;
  connectedcreated = false;
  status = signal('nothing');
  @ViewChild('alertHost', { read: ViewContainerRef }) alertHost?: ViewContainerRef;
  @ViewChild('screenVideo', { static: false }) screenVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraVideo', { static: false }) cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('cameraVideo2', { static: false }) cameraVideo2?: ElementRef<HTMLVideoElement>;
  @ViewChild('audio', { static: false }) AudioRef?: ElementRef<HTMLAudioElement>;
  status_text: Record<string, string> = {
    nothing: 'Enter room iD',
    connected: 'Connected to Room',
    offer_initiated: 'Creating a connection',
    user_id_created: 'Connection created! Share your Room ID',
  };
  isReceivingScreen = signal(false);
  public current_screenShareState: MediaState = MediaState.Idle;
  public screenShareState: typeof MediaState = MediaState;
  public currentAudiostate: MediaState = MediaState.Idle;
  public AudioState: typeof MediaState = MediaState;
  public current_ReciverAudiostate: MediaState = MediaState.Idle;
  public ReciverAudioState: typeof MediaState = MediaState;
  animal!: string;
  name!: string;
  isVideostarted = false;
  private cameraStream: MediaStream | null = null;
  private _videoStream: MediaStream | null = null;
  private ReciverAudioStream: MediaStream | null = new MediaStream();
  chunks: Blob[] = [];
  mediaRecorder!: MediaRecorder;
  ErrorMessage = signal('');
  constructor(
    public dialog: MatDialog,
    private readonly manualWebrtcService: ManualWebrtcService,
    private readonly webrtcService: WebRTCService
  ) {}
  get logs() {
    return [];
  }
  ngOnInit() {
    if (this.type === 'offer') {
      this.status_text['nothing'] = 'Create a connection';
    } else {
      this.status_text['nothing'] = 'Enter room iD';
    }
    this.webrtcService.videoUpdate$.subscribe(({ stream, type, isReceivingScreen }) => {
      this.updateVideo(stream, type, isReceivingScreen);
    });
    this.manualWebrtcService.ErrorMessageSubject.subscribe((message) => {
      this.ErrorMessage.set(message);
      this.showAlert();
    });

    this.manualWebrtcService.connStateData.pipe().subscribe((state) => {
      this.connectedcreated = state.connectedcreated;
      this.status.set(state.status);
      this.sendBtn.set(state.sendBtn);

      // show dialog, toast, etc. here]qwsad
    });
  }
  get getMessages() {
    return this.manualWebrtcService.MessageList;
  }
  ngAfterViewInit() {}
  Firstclick = true;
  startMedia() {
    if (
      this.Firstclick &&
      this.screenVideo &&
      this.cameraVideo &&
      this.cameraVideo2 &&
      this.AudioRef
    ) {
      this.manualWebrtcService.primeVideosOnce(
        this.screenVideo,
        this.cameraVideo,
        this.cameraVideo2,
        this.AudioRef
      );
      this.Firstclick = false;
    }
  }
  public showAlert() {
    this.helperTollboxRef = this.alertHost?.createComponent(HelperToolbox, {
      bindings: [inputBinding('Errormessage', this.ErrorMessage)],
    });

    setTimeout(() => {
      this.helperTollboxRef?.destroy();
    }, 10000000);

    setTimeout(() => {
      this.hideAlert();
    }, 10000);
  }
  hideAlert() {
    this.helperTollboxRef?.destroy();
  }

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
      this.current_screenShareState = MediaState.Starting;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.manualWebrtcService.setScreenRecordingStream(stream);
      this.updateVideo(stream);
      this.isScreenShareStarted.set(true);
      this.current_screenShareState = MediaState.InProgress;
    } catch (err) {
      this.current_screenShareState = MediaState.Idle;
    }
  };

  startAudio = async () => {
    try {
      const stream = this.manualWebrtcService.getAudioStreamValue();
      console.log(stream.getAudioTracks());
      // 1️⃣ Mic never started yet (empty MediaStream)
      if (stream.getAudioTracks().length === 0) {
        console.log(stream.getAudioTracks());
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        this.manualWebrtcService.setAudioStream(audioStream);
        this.currentAudiostate = MediaState.InProgress;
        return;
      }
      console.log('going to mute');
      // 2️⃣ Mic already exists → toggle mute
      const muted = this.toggleMute(stream);
      this.currentAudiostate = muted ? MediaState.Idle : MediaState.InProgress;
    } catch (e) {
      console.error('Mic error', e);
      this.currentAudiostate = MediaState.Idle;
    }
  };
  get isREciverTrackAviable() {
    return this.ReciverAudioStream?.getAudioTracks().length;
  }
  RecieverToggleMute() {
    if (this.ReciverAudioStream && this.ReciverAudioStream?.getAudioTracks().length > 0) {
      const status = this.toggleMute(this.ReciverAudioStream);
      if (status) {
        this.current_ReciverAudiostate = this.AudioState.Idle;
      } else {
        this.current_ReciverAudiostate = this.AudioState.InProgress;
      }
    }
  }
  toggleMute(stream: MediaStream | null): boolean {
    if (!stream) return false;
    console.log(stream);

    const track = stream.getAudioTracks()[0];
    if (!track) return false;

    track.enabled = !track.enabled;
    console.log('Mute state', !track.enabled);
    return !track.enabled; // returns muted state
  }
  createSpeakingDetector(stream: MediaStream, onSpeaking: (speaking: boolean) => void) {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const data = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    let speaking = false;
    const THRESHOLD = 25; // tune this
    const tick = () => {
      analyser.getByteFrequencyData(data);

      const avg = data.reduce((a, b) => a + b, 0) / data.length;

      const isSpeaking = avg > THRESHOLD;

      if (isSpeaking !== speaking) {
        speaking = isSpeaking;
        onSpeaking(speaking);
      }

      requestAnimationFrame(tick);
    };

    tick();

    return () => audioCtx.close(); // cleanup
  }

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
    this.current_screenShareState = MediaState.Stopped;
  }
  openchat() {
    this.chathidden = !this.chathidden;
  }
  public updateVideo(
    stream: MediaStream | null,
    type: string = 'screen',
    isReceivingScreen = false
  ) {
    console.log('Updating UI with', stream, type, isReceivingScreen);

    this.isReceivingScreen.set(isReceivingScreen);

    let mediaEl: HTMLVideoElement | HTMLAudioElement | undefined = undefined;

    // 1️⃣ Pick correct element
    switch (type) {
      case 'camera':
        mediaEl = isReceivingScreen
          ? this.cameraVideo2?.nativeElement
          : this.cameraVideo?.nativeElement;
        break;

      case 'screen':
        mediaEl = this.screenVideo?.nativeElement;
        break;

      case 'audio':
        mediaEl = this.AudioRef?.nativeElement;
        break;

      default:
        return;
    }

    if (!mediaEl) return;

    // 2️⃣ Clear stream
    if (!stream) {
      mediaEl.pause();
      mediaEl.srcObject = null;
      return;
    }

    // 3️⃣ Attach stream
    mediaEl.srcObject = stream;

    if (mediaEl instanceof HTMLVideoElement) {
      mediaEl.playsInline = true;
    }
    if (mediaEl instanceof HTMLAudioElement && isReceivingScreen) {
      this.ReciverAudioStream = stream;
      this.startSpeakingIndicator(stream);
      mediaEl.autoplay = true;
      this.current_screenShareState = MediaState.InProgress;
    }
    // 4️⃣ Handle by media type
    if (type === 'audio') {
      // 🔊 AUDIO
      mediaEl.muted = false;
    } else {
      // 🎥 VIDEO / SCREEN
      mediaEl.muted = true;

      // only screen share needs onended
      if (type === 'screen') {
        const screenTrack = stream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.onended = () => this.stopScreenShare();
        }
      }
    }

    // 5️⃣ Safe play
    const playPromise = mediaEl.play();
    if (playPromise) {
      playPromise.catch(() => {
        // autoplay policy / race condition – safe ignore
      });
    }
  }
  isSpeaking = signal(false);
  sendMessage() {
    this.webrtcService.sendMessage(this.Textmessage);
    this.Textmessage = '';
  }
  private stopDetector?: () => void;
  startSpeakingIndicator(stream: MediaStream) {
    this.stopDetector = this.createSpeakingDetector(stream, (speaking) => {
      this.isSpeaking.set(speaking);
    });
  }
  stopSpeakingIndicator() {
    this.stopDetector?.();
  }
  Textmessage = '';
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
