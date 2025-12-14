import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ManualWebrtcService {
  private socket: WebSocket | null = null;
  private messageSubject = new Subject<any>();
  public messages$: Observable<any> = this.messageSubject.asObservable();
  stepLabels = [
    'Offer Created',
    'ICE candidate Generated',
    'Offer Sent to Websocket Server',
    'Await confirmation from Receiver side',
  ];
  progressSetuper = signal([false, false, false, false]);
  logs = signal<{ type: 'normal' | 'warn' | 'error'; message: string }[]>([]);

  constructor(private http: HttpClient) {}

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
      this.socket = new WebSocket(`${this.wslUrl}/persist-connection`);

      let hasResolved = false; // prevents double trigger
      this.socket.onopen = () => {
        hasResolved = true;
        this.addLog('✓ Persistent WS connected');
        this.messageSubject.next({ type: 'alert', data: 'ws_connected' });
        resolve();
      };

      this.socket.onerror = (err) => {
        if (hasResolved) return; // ignore runtime errors after connect
        this.stepLabels.push('WS error - server unreachable');
        this.progressSetuper.set([true, true, true, true, false]);
        this.addLog('✗ WS error - server unreachable');

        this.messageSubject.next({
          type: 'error',
          data: 'server_unreachable',
        });

        hasResolved = true;
        reject(new Error('server_unreachable'));
      };

      this.socket.onclose = (ev) => {
        if (hasResolved) {
          this.addLog('✗ Persistent WS closed');
          return;
        }

        // close BEFORE open == connection refused
        this.addLog('✗ Server offline (WS closed before handshake)');

        this.messageSubject.next({
          type: 'error',
          data: 'server_offline',
        });

        hasResolved = true;
        reject(new Error('server_offline'));
      };

      this.socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          if (!parsed?.type) {
            this.addLog('✗ Invalid payload: missing type');
            this.messageSubject.next({ type: 'error', data: 'invalid_payload' });
            return;
          }

          if (parsed.type === 'error') {
            this.addLog(`✗ ${parsed.data}`);
            this.messageSubject.next(parsed);
            return;
          }

          if (parsed.type === 'alert') {
            this.addLog(`⚠️ ${parsed.data}`);
            this.messageSubject.next(parsed);
            return;
          }

          if (parsed.type === 'response') {
            this.addLog(`✓ Response received`);
            this.messageSubject.next(parsed);
            return;
          }
        } catch {
          this.addLog('✗ Unparsed WS message');
        }
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
