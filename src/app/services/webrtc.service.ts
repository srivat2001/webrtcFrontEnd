import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket: WebSocket | null = null;

  // RxJS subjects for incoming messages
  private messageSubject = new Subject<any>();
  public messages$: Observable<any> = this.messageSubject.asObservable();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.messageSubject.next({
          _about: 'ws_connected',
        });
        resolve();
      };

      this.socket.onerror = (err) => {
        this.messageSubject.next({
          _about: 'ws_error',
          _err: err,
        });
        reject(err);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.messageSubject.next({
            _about: 'frombacked',
            _data: data,
          });
        } catch {
          this.messageSubject.next(event.data);
        }
      };

      this.socket.onclose = () => {
        console.log('WS Closed');
      };
    });
  }

  send(data: any) {
    if (!this.socket) return;
    console.log('calledsend');
    const msg = JSON.stringify(data);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(msg);
    }
  }
}
