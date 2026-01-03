import { HttpClient } from '@angular/common/http';
import { ElementRef, Injectable, signal } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';
export interface ConnectionState {
  connectedcreated: boolean;
  status: 'connected' | 'disconnected' | string;
  sendBtn: boolean;
}
@Injectable({
  providedIn: 'root',
})
export class ManualWebrtcService {
  constructor(private http: HttpClient) {}
  private readonly ScreenRecordingStream = new BehaviorSubject<MediaStream>(new MediaStream());
  readonly ScreenRecordingstream$ = this.ScreenRecordingStream.asObservable();
  private readonly CameraStream = new BehaviorSubject<MediaStream>(new MediaStream());
  readonly CameraStream$ = this.CameraStream.asObservable();
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<any>();
  public messages$: Observable<any> = this.messageSubject.asObservable();
  public connStateData = new BehaviorSubject<ConnectionState>({
    connectedcreated: false,
    status: 'nothing',
    sendBtn: false,
  });
  updateConnectionState(partial: Partial<ConnectionState>) {
    const current = this.connStateData.value;
    this.connStateData.next({
      ...current,
      ...partial,
    });
  }
  //public connStateData$ = this.connStateData.asObservable();
  public timerId: any = null;
  public seconds = 10;
  public ErrorMessageSubject = new BehaviorSubject('');
  stepLabels = [
    'Offer Created',
    'ICE candidate Generated',
    'Offer Sent to Websocket Server',
    'Await confirmation from Receiver side',
  ];
  progressSetuper = signal([false, false, false, false]);
  logs = signal<{ type: 'normal' | 'warn' | 'error'; message: string }[]>([]);

  //videoStreaming
  get getScreenRecordingStream(): Observable<MediaStream | null> {
    return this.ScreenRecordingstream$;
  }

  setScreenRecordingStream(stream: MediaStream) {
    this.ScreenRecordingStream.next(stream);
  }

  getScreenrecordingStreamValue(): MediaStream {
    return this.ScreenRecordingStream.getValue();
  }
  getCameraStreamValue(): MediaStream {
    return this.CameraStream.getValue();
  }
  StopScreenRecordingStream() {
    const stream = this.ScreenRecordingStream.getValue();
    if (stream) {
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
    }
  }
  public primeVideosOnce(
    cameraVideo: ElementRef<HTMLVideoElement>,
    screenVideo: ElementRef<HTMLVideoElement>
  ) {
    this.prime(cameraVideo?.nativeElement, this.CameraStream.value);
    this.prime(screenVideo?.nativeElement, this.ScreenRecordingStream.value);
  }

  private prime(video: HTMLVideoElement | null, stream: MediaStream) {
    if (!video) return;

    video.srcObject = stream;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    video.play().catch(() => {});
  }
  get getCameraStream(): Observable<MediaStream | null> {
    return this.CameraStream$;
  }
  setCameraStream(stream: MediaStream) {
    this.CameraStream.next(stream);
  }
  CameraStreamclear() {
    const stream = this.CameraStream.value;
    stream.getVideoTracks().forEach((t) => {
      t.stop();
      stream.removeTrack(t);
    });
  }
  // ---------------------------
  // LOGGING
  // ---------------------------
  addLog(message: string): void {
    const raw = (message ?? '').toString().trim();
    let clean = raw.replace(/^[\u2713\u2714\u2717\u2718✓✗\*>\-]+\s*/, '').trim();
    const lower = raw.toLowerCase();

    let type: 'normal' | 'warn' | 'error' = 'normal';
    if (/\b(error|exception|failed|unhandled)\b/i.test(lower)) type = 'error';
    else if (/\b(warn|blocked|denied|not ready|empty)\b/i.test(lower)) type = 'warn';

    const time = new Date().toLocaleTimeString();
    const entry = { type, message: `[${time}] ${clean}` };

    this.logs.update((arr) => [entry, ...arr].slice(0, 10));
  }

  // ---------------------------
  // CONNECT (PERSIST SOCKET)
  // ---------------------------
  get wslUrl() {
    return environment.wsUrl;
  }

  connectPersistent(): Promise<void> {
    return new Promise((resolve, reject) => {
      // ✅ ONE websocket for everything
      this.socket = new WebSocket(this.wslUrl);

      let settled = false;

      this.socket.onopen = () => {
        if (settled) return;
        settled = true;

        this.addLog('✓ WebSocket connected');
        console.log('WebSocket connected');

        // Notify listeners
        this.messageSubject.next({
          type: 'system',
          data: 'ws_connected',
        });

        resolve();
      };

      this.socket.onerror = (err) => {
        if (settled) return;
        settled = true;

        console.error('WebSocket error', err);
        this.addLog('✗ WebSocket error');

        this.messageSubject.next({
          type: 'error',
          data: 'server_unreachable',
        });
        this.updateConnectionState({ status: 'nothing' });
        this.ErrorMessageSubject.next('Backend server error');
        reject(new Error('server_unreachable'));
      };

      this.socket.onclose = (ev) => {
        // Closed AFTER open → normal runtime close
        if (settled) {
          this.addLog('✗ WebSocket closed');
          this.messageSubject.next({
            type: 'system',
            data: 'ws_closed',
          });
          return;
        }

        // Closed BEFORE open → server offline
        settled = true;

        this.addLog('✗ Server offline (WS closed before open)');
        this.messageSubject.next({
          type: 'error',
          data: 'server_offline',
        });

        reject(new Error('server_offline'));
      };

      this.socket.onmessage = (event) => {
        let parsed: any;

        try {
          parsed = JSON.parse(event.data);
        } catch {
          this.addLog('✗ Unparsed WS message');
          return;
        }

        if (!parsed?.type) {
          this.addLog('✗ Invalid WS payload (missing type)');
          this.messageSubject.next({
            type: 'error',
            data: 'invalid_payload',
          });
          return;
        }

        // ✅ ALL inbound WS traffic flows through here
        this.messageSubject.next(parsed);
      };
    });
  }

  // ---------------------------
  // SEND STANDARD PAYLOAD
  // ---------------------------
  sendMessage(data: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.addLog('✗ Cannot send — WS not open');
      return;
    }

    this.addLog('Sending...');
    const msg = JSON.stringify(data);
    this.socket.send(msg);
  }

  // ---------------------------
  // UTIL
  // ---------------------------
  listenMessages() {
    return this.messages$;
  }

  getLogs() {
    return this.logs;
  }

  closeSocket() {
    if (!this.socket) return this.addLog('⚠️ No WS to close');

    try {
      this.socket.close();
      this.addLog('✓ WebSocket closed');
    } catch (err) {
      this.addLog('✗ Error closing WS');
    }
    this.socket = null;
  }
  start() {
    if (this.timerId) return;
    this.timerId = setInterval(() => {
      if (this.seconds > 0) {
        this.seconds--;
      } else {
        this.stop();
      }
    }, 1000);
  }
  stop() {
    if (!this.timerId) return;
    clearInterval(this.timerId);
    this.timerId = null;
  }
  // ---------------------------
  // ROOM STORAGE HELPERS
  // ---------------------------
  loadSavedRooms(rooms: any) {
    try {
      const parsed = JSON.parse(localStorage.getItem('rooms') || '[]');
      rooms.set(Array.isArray(parsed) ? parsed : []);
    } catch {
      rooms.set([]);
    }
  }

  addtoSavedRoom(_roomId: string, combined: string) {
    const [roomId, secret] = combined.split('$');
    let rooms: any[] = [];

    try {
      rooms = JSON.parse(localStorage.getItem('rooms') || '[]');
    } catch {
      rooms = [];
    }

    const existing = rooms.find((r: any) => r[roomId]);
    if (existing) existing[roomId] = secret;
    else rooms.push({ [roomId]: secret });

    localStorage.setItem('rooms', JSON.stringify(rooms));
  }
}
