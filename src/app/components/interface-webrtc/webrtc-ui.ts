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
import { VideoScreenRecoderService } from '../../services/videoscreenrecoder.service';
import { Spinner } from '../../assets/spinner/spinner';
import { WebRTCService } from '../../services/webrtc.service';
import { MediaState } from '../../models/media-state.model';
import { Dialogbox } from './dialogbox/dialogbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { single } from 'rxjs';
@Component({
  selector: 'app-webrtc-ui',
  standalone: true,
  imports: [...MATERIAL_IMPORTS, CommonModule, FormsModule, Spinner],
  templateUrl: './webrtc-ui.html',
  styleUrl: './webrtc-ui.scss',
})
export class WebrtcUiComponent implements AfterViewInit {
  @Input() type: 'offer' | 'answer' = 'offer';
  messages = signal<{ text: string; me: boolean; time: string }[]>([]);
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
  public StreamState: typeof MediaState = MediaState;
  public current_screenShareState: MediaState = MediaState.Idle;
  public currentAudiostate: MediaState = MediaState.Idle;
  public current_ReciverAudiostate: MediaState = MediaState.Idle;
  public current_cameraState: MediaState = MediaState.Idle;
  public current_screenRecordingState: MediaState = MediaState.Idle;
  isScreenVideoRecorderoptionEnabled = false;
  animal!: string;
  name!: string;
  isVideostarted = false;
  private cameraStream: MediaStream | null = null;
  private _videoStream: MediaStream | null = null;
  private ReciverAudioStream: MediaStream | null = new MediaStream();
  chunks: Blob[] = [];
  mediaRecorder!: MediaRecorder;

  // Recording state is handled by VideoScreenRecoderService
  // Use the service's `isRecording` signal to get status
  get isPipRecording() {
    return this.videoScreenRecoderService.isRecording();
  }
  ErrorMessage = signal('');
  isMobile = window.innerWidth <= 743;

  constructor(
    public dialog: MatDialog,
    private readonly manualWebrtcService: ManualWebrtcService,
    private readonly webrtcService: WebRTCService,
    private _snackBar: MatSnackBar,
    private videoScreenRecoderService: VideoScreenRecoderService,
  ) {}
  get logs() {
    return [];
  }
  ngOnInit() {
    const resize = () => {
      this.isMobile = window.innerWidth <= 743;
    };
    this.manualWebrtcService.Messages$.subscribe((messages) => {
      this.messages.set(messages);
    });

    // watch for recording stopped events to clear timers and show download UI
    this.videoScreenRecoderService.recordingStopped$.subscribe((blob) => {
      this.stopRecordingTimer();
      this.current_screenRecordingState = MediaState.Stopped;
      this.isScreenVideoRecorderoptionEnabled = false;
      // recordingReady signal is set by service; UI will update automatically
      console.debug('[ui] recording stopped event, blob size=', blob?.size);
    });
    window.addEventListener('resize', resize);
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
    navigator.mediaDevices.ondevicechange = async () => {
      console.log('🔄 Audio device changed');
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log(devices);
    };

    this.manualWebrtcService.connStateData.pipe().subscribe((state) => {
      this.connectedcreated = state.connectedcreated;
      this.status.set(state.status);
      this.sendBtn.set(state.sendBtn);

      // show dialog, toast, etc. here]qwsad
    });

    navigator.mediaDevices.ondevicechange = () => {
      this._snackBar.open('Seems like device changed', 'Close');
    };
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
        this.AudioRef,
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
  recordingSecondsLeft = signal(0);
  private recordingTimerId: any = null;

  private stopRecordingTimer() {
    if (this.recordingTimerId) {
      clearInterval(this.recordingTimerId);
      this.recordingTimerId = null;
    }
    this.recordingSecondsLeft.set(0);
  }

  async isScreenVideoRecorderoptionStart() {
    try {
      // Do NOT start screen or camera here — require screen sharing to be active already
      const screenStream = this.manualWebrtcService.getScreenrecordingStreamValue();
      if (!screenStream || screenStream.getVideoTracks().length === 0) {
        // alert user to start screen sharing first
        this._snackBar.open('Please start screen sharing before recording', 'Close', {
          duration: 3000,
        });
        return;
      }

      const screenEl = this.screenVideo?.nativeElement;
      const camEl = this.cameraVideo?.nativeElement;
      if (!screenEl) {
        this._snackBar.open('Screen element not ready yet', 'Close', { duration: 3000 });
        return;
      }

      // set state
      this.current_screenRecordingState = MediaState.Starting;

      await this.videoScreenRecoderService.startPipRecording(screenEl, camEl);

      // mark in progress
      this.current_screenRecordingState = MediaState.InProgress;
      this.isScreenVideoRecorderoptionEnabled = true;

      // start countdown timer (10 minutes)
      this.stopRecordingTimer();
      this.recordingSecondsLeft.set(10 * 60); // 10 minutes in seconds
      this.recordingTimerId = setInterval(() => {
        this.recordingSecondsLeft.update((s) => s - 1);
        if (this.recordingSecondsLeft() <= 0) {
          // stop recording when timer runs out
          this.StopScreenshareRecorderOption();
        }
      }, 1000);
    } catch (err) {
      console.error('PIP start error', err);
      this.current_screenRecordingState = MediaState.Idle;
      this.isScreenVideoRecorderoptionEnabled = false;
    }
  }
  async StopScreenshareRecorderOption() {
    try {
      // stop timer
      this.stopRecordingTimer();

      const blob = await this.videoScreenRecoderService.stopPipRecording();

      // mark ui state
      this.isVideostarted = false;
      this.isScreenVideoRecorderoptionEnabled = false;

      // update recording state to Stopped if we have a blob else Idle
      this.current_screenRecordingState = blob && blob.size ? MediaState.Stopped : MediaState.Idle;

      // keep screen share state as-is; if screen stream exists keep InProgress otherwise mark Idle
      const screenStream = this.manualWebrtcService.getScreenrecordingStreamValue();
      this.current_screenShareState =
        screenStream && screenStream.getVideoTracks().length > 0
          ? MediaState.InProgress
          : MediaState.Idle;

      // show ready state (service.recordingReady is set by service)
      // optionally keep a reference to last blob locally
      if (blob && blob.size) {
        // show UI — service.recordingReady() will be true
      }
    } catch (err) {
      console.error('Stop recording error', err);
      this.current_screenRecordingState = MediaState.Idle;
      this.isScreenVideoRecorderoptionEnabled = false;
    }
  }

  downloadLastRecording() {
    const blob = this.videoScreenRecoderService.getLastRecordingBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pip-recording-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);

    // clear stored recording after download
    this.videoScreenRecoderService.clearLastRecording();
    // reset recording UI state
    this.current_screenRecordingState = MediaState.Idle;
  }

  hasLastRecording() {
    return !!this.videoScreenRecoderService.getLastRecordingBlob();
  }

  formatTime(s: number) {
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, '0');
    return `${mm}:${ss}`;
  }
  startScreenShare = async () => {
    try {
      this.current_screenShareState = MediaState.Starting;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      this.manualWebrtcService.setScreenRecordingStream(stream);
      this.updateVideo(stream);
      // inform recorder service about the screen video element
      const screenEl = this.screenVideo?.nativeElement;
      if (screenEl) this.videoScreenRecoderService.setScreenElement(screenEl);
      this.isScreenShareStarted.set(true);
      this.current_screenShareState = MediaState.InProgress;
    } catch (err) {
      this.current_screenShareState = MediaState.Idle;
    }
  };
  async startCamera() {
    try {
      console.log('Starting camera...');
      const stream = this.manualWebrtcService.getCameraStreamValue();
      if (stream.getVideoTracks().length === 0) {
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
        console.debug('startCamera: local camera playing, attaching to recorder');
        // inform recorder service about camera element (recorder will attach stream if needed)
        this.videoScreenRecoderService.setCameraElement(camVideo);
        this.current_cameraState = MediaState.InProgress;
        return;
      }
      const muted = this.toggleMute(stream, 'camera');
      this.current_cameraState = muted ? MediaState.Idle : MediaState.InProgress;
    } catch (e) {
      console.error('Mic error', e);
      this.current_cameraState = MediaState.Idle;
    }
  }
  startAudio = async (deviceid = '') => {
    try {
      const stream = this.manualWebrtcService.getAudioStreamValue();
      console.log(stream.getAudioTracks());
      // 1️⃣ Mic never started yet (empty MediaStream)
      if (stream.getAudioTracks().length === 0 && deviceid) {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceid } },
          video: false,
        });

        this.manualWebrtcService.setAudioStream(audioStream);
        this.currentAudiostate = MediaState.InProgress;
        return;
      }
      console.log('going to mute');
      // 2️⃣ Mic already exists → toggle mute
    } catch (e) {
      console.error('Mic error', e);
      this.currentAudiostate = MediaState.Idle;
    }
  };
  AudioMUte() {
    const stream = this.manualWebrtcService.getAudioStreamValue();
    if (stream.getAudioTracks().length > 0) {
      const muted = this.toggleMute(stream, 'audio');
      this.currentAudiostate = muted ? MediaState.Stopped : MediaState.InProgress;
    } else {
      this.openDialog();
    }
  }

  get isREciverTrackAviable() {
    return this.ReciverAudioStream?.getAudioTracks().length;
  }
  RecieverToggleMute() {
    if (this.ReciverAudioStream && this.ReciverAudioStream?.getAudioTracks().length > 0) {
      const status = this.toggleMute(this.ReciverAudioStream, 'audio');
      if (status) {
        this.current_ReciverAudiostate = this.StreamState.Idle;
      } else {
        this.current_ReciverAudiostate = this.StreamState.InProgress;
      }
    }
  }
  toggleMute(stream: MediaStream, type = 'audio'): boolean {
    if (!stream) return false;
    const tracks = type === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
    if (tracks.length === 0) return false;
    const track = tracks[0];
    track.enabled = !track.enabled;
    console.log(`${type} muted =`, !track.enabled);
    return !track.enabled; // true = muted
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
  createOffer(events: PointerEvent) {
    (events.target as HTMLElement).setPointerCapture(events.pointerId);

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
    // tell recorder that screen element is gone (if recording continues, it will handle missing screen)
    this.videoScreenRecoderService.setScreenElement(null);
    this.updateVideo(null, 'screen', false);
    this.current_screenShareState = MediaState.Stopped;
  }
  openchat() {
    this.chathidden = !this.chathidden;
  }
  public updateVideo(
    stream: MediaStream | null,
    type: string = 'screen',
    isReceivingScreen = false,
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
    this.currentAudiostate = MediaState.Starting;
    const dialogRef = this.dialog.open(Dialogbox, {});

    dialogRef.afterClosed().subscribe((result) => {
      this.currentAudiostate = MediaState.InProgress;
      this.startAudio(result);
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
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }
}
