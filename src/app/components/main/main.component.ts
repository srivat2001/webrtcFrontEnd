import { Component, computed, ElementRef, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../matimports';
import { ManualWebrtcService } from '../../services/manual-webrtc.service';
import { FlipDirective } from '../../directives/flip.directive';
import { RoomResponse } from '../interface';
import { BehaviorSubject, Subscription } from 'rxjs';
import { WebrtcUiComponent } from '../interface-webrtc/webrtc-ui';
import { WebRTCService } from '../../services/webrtc.service';
type StoredRoom = { [roomId: string]: string };

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, FormsModule, ...MATERIAL_IMPORTS, FlipDirective, WebrtcUiComponent],
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
})
export class MainComponent implements OnInit {
  @ViewChild(WebrtcUiComponent) webrtcUi!: WebrtcUiComponent;
  // messageInput = signal('');
  // messages = signal<any[]>([]);
  // sendBtn = signal(false);
  // OfferCreated = signal(false);
  // selectedRoomSecret = signal('');
  // isIceCreationAccordianExpanded = signal(true);
  // isScreenShareStarted = signal(false);
  // generdateSharedSecret = '';
  // connectedcreated = false;
  // chathidden = false;
  // status = signal('nothing');
  // status_text: Record<string, string> = {
  //   nothing: 'Create a connection',
  //   offer_initiated: 'Creating a connection',
  //   user_id_created: 'Connection created! Share your Room ID',
  // };
  // public screenStream: MediaStream | null = null;
  // public cameraStream: MediaStream | null = null;
  // private iceTimer: any;
  // private connectionStateSubject = new BehaviorSubject<RTCPeerConnectionState>('new');
  // connectionState$ = this.connectionStateSubject.asObservable();
  // connectionState: 'Connected' | 'Connecting' | 'Disconnected' = 'Disconnected';
  // toReciveStreamType = 'screen';
  // private wsSub: Subscription | null = null;
  // rooms = signal<StoredRoom[]>([]);
  // roomId = signal<string>('');
  constructor(
    private readonly ManualWebrtcService: ManualWebrtcService,
    private readonly WebRTCService: WebRTCService
  ) {
    WebRTCService.setRole('offer');
  }

  get progressSetuper() {
    return this.ManualWebrtcService.progressSetuper;
  }
  get stepLabels() {
    return this.ManualWebrtcService.stepLabels;
  }
  get wslUrl() {
    return this.ManualWebrtcService.wslUrl;
  }

  firstIncompleteIndex = computed(() => {
    const idx = this.progressSetuper().indexOf(false);
    return idx === -1 ? null : idx;
  });

  ngOnInit(): void {}

  openchat() {
    // this.chathidden = !this.chathidden;
  }

  // private initialiseWebsocket(): void {
  //   this.wsSub?.unsubscribe();
  //   this.wsSub = this.ManualWebrtcService.listenMessages().subscribe((val) => {
  //     const data = val.data;
  //     if (!data) return;
  //     // if (data === 'ws_connected') {
  //     //   this.generdateSharedSecret = this.selectedRoomSecret() || '';
  //     //   this.ManualWebrtcService.sendMessage({
  //     //     type: 'request',
  //     //     data: this.generdateSharedSecret ? { roomname: this.generdateSharedSecret } : {},
  //     //   });
  //     //   return;
  //     // }

  //     switch (data.status) {
  //       case 'room-created':
  //         console.log('Room created:', data.roomname);
  //         this.generdateSharedSecret = data.roomname;
  //         this.sendOfferAndIce(
  //           data.roomname,
  //           this.WebRTCService.getOfferText(),
  //           this.WebRTCService.getLocalIceCandidates()
  //         ).then(console.log);
  //         break;

  //       case 'answer_ready':
  //         this.WebRTCService.setAnswerText(data.room.AnswererData.answer);
  //         this.WebRTCService.setRemoteIceText(data.room.AnswererData.ICEcandidate);
  //         this.ApplyRemoteDescAndIce();
  //         break;

  //       case 'offer_added':
  //         console.log('Offer added, waiting for answer...');
  //         this.connectedcreated = true;
  //         setTimeout(() => {
  //           this.roomId.set(data.roomname);
  //           this.status.set('user_id_created');
  //           this.progressSetuper.set([true, true, true, false]);
  //         }, 1000);
  //         break;

  //       default:
  //         console.warn('Unhandled WS message', data);
  //     }
  //   });
  // }

  // private createPeerIfNeeded(): void {
  //   if (this.pc) return;

  //   this.pc = new RTCPeerConnection({
  //     iceServers: [
  //       { urls: 'stun:stun.l.google.com:19302' },
  //       {
  //         urls: 'turn:relay.metered.ca:443?transport=tcp',
  //         username: 'openrelayproject',
  //         credential: 'openrelayproject',
  //       },
  //     ],
  //   });

  //   this.pc.onicecandidate = (e) => {
  //     if (!e.candidate) return;
  //     this.localIceCandidates.update((c) => [...c, JSON.stringify(e.candidate)]);
  //     clearTimeout(this.iceTimer);
  //     this.iceTimer = setTimeout(() => {
  //       this.ManualWebrtcService.connectPersistent();
  //       this.progressSetuper.set([true, true, false, false]);
  //     }, 2000);
  //   };
  //   this.pc.onconnectionstatechange = () => {
  //     this.connectionStateSubject.next(this.pc!.connectionState);
  //   };
  //   this.channel = this.pc.createDataChannel('chat');
  //   this.setupDataChannel(this.channel);
  //   this.pc.onnegotiationneeded = async () => {
  //     if (this.pc?.connectionState !== 'connected') return;
  //     if (!this.channel || this.channel.readyState !== 'open') return;
  //     try {
  //       const offer = await this.pc.createOffer();
  //       await this.pc.setLocalDescription(offer);
  //       this.channel.send(
  //         JSON.stringify({
  //           type: 'negotiation-offer',
  //           sdp: this.pc.localDescription,
  //         })
  //       );
  //     } finally {
  //       // DO NOT unlock here — unlock when answer arrives
  //     }
  //   };

  //   this.pc.ontrack = (event) => {
  //     let stream: MediaStream;
  //     if (event.streams && event.streams.length > 0) {
  //       stream = event.streams[0];
  //     } else {
  //       stream = new MediaStream();
  //       stream.addTrack(event.track);
  //     }
  //     this.webrtcUi.updateVideo(stream, this.toReciveStreamType, true);
  //   };
  // }
  private resolveFn!: (value: any) => void;

  // sendStreamifExists = async () => {
  //   if (this.cameraStream) {
  //     await new Promise<string>((resolve) => {
  //       this.resolveFn = resolve;
  //       console.log('Sending camera stream');
  //       this.ManualWebrtcService.setCameraStream(this.cameraStream);
  //     });
  //   }
  //   setTimeout(() => {
  //     if (this.screenStream) {
  //       console.log('Sending screen recording stream');
  //       this.ManualWebrtcService.setScreenRecordingStream(this.screenStream);
  //     }
  //   }, 10);
  // };
  // private setupDataChannel(channel: RTCDataChannel) {
  //   channel.onopen = () => this.sendStreamifExists();
  //   channel.onmessage = async (e) => {
  //     const msg = JSON.parse(e.data);
  //     if (msg.type === 'negotiation-offer') {
  //       console.log('Received renegotiation offer');
  //       await this.pc!.setRemoteDescription(msg.sdp);
  //       const answer = await this.pc!.createAnswer();
  //       await this.pc!.setLocalDescription(answer);
  //       this.channel!.send(
  //         JSON.stringify({
  //           type: 'negotiation-answer',
  //           sdp: this.pc!.localDescription,
  //         })
  //       );
  //       return;
  //     }

  //     if (msg.type === 'negotiation-answer') {
  //       console.log('Received renegotiation answer');
  //       await this.pc!.setRemoteDescription(msg.sdp);
  //       return;
  //     }
  //     if (msg.type === 'ack-video-send-indent') {
  //       if (msg._contentType === 'camera' && this.cameraStream) {
  //         this.pc!.addTrack(this.cameraStream.getVideoTracks()[0]);
  //         this.resolveFn('done');
  //       } else if (msg._contentType === 'screen' && this.screenStream) {
  //         this.pc!.addTrack(this.screenStream.getVideoTracks()[0]);
  //       }
  //     }
  //     if (msg.type === 'video-send-indent') {
  //       this.channel!.send(
  //         JSON.stringify({ type: 'ack-video-send-indent', _contentType: msg._contentType })
  //       );
  //       this.toReciveStreamType = msg._contentType;
  //     }
  //   };

  //   channel.onclose = () => {
  //     console.log('Channel closed!');
  //     this.sendBtn.set(false);
  //   };
  // }

  // async ApplyRemoteDescAndIce() {
  //   await this.applyAnswer();
  //   await this.addRemoteIce();
  // }

  logs() {
    return this.ManualWebrtcService.getLogs()();
  }

  createOffer = async (): Promise<void> => {
    this.WebRTCService.createOffer();
  };

  // sendOfferAndIce(roomname: string, offer: any, ice: any): Promise<RoomResponse> {
  //   return new Promise((resolve, reject) => {
  //     const ws = new WebSocket(`${this.wslUrl}/create-connection`);
  //     ws.onopen = () => ws.send(JSON.stringify({ roomname, offer, ICEcandidate: ice }));
  //     ws.onmessage = (e) => {
  //       resolve(JSON.parse(e.data));
  //       ws.close();
  //     };
  //     ws.onerror = reject;
  //   });
  // }

  // async applyAnswer() {
  //   if (!this.WebRTCService.getRTCConnection() || !this.WebRTCService.getAnswerText()) {
  //     this.ManualWebrtcService.addLog('✗ Answer empty');
  //     return alert('Please paste answer first');
  //   }
  //   await this.WebRTCService.getRTCConnection()!.setRemoteDescription(
  //     JSON.parse(this.WebRTCService.getAnswerText())
  //   );
  //   this.ManualWebrtcService.addLog('✓ Answer applied');
  // }

  // async addRemoteIce() {
  //   if (!this.WebRTCService.getRTCConnection()) return alert('PC not ready');
  //   for (const item of this.WebRTCService.getRemoteIceText()) {
  //     if (item) await this.WebRTCService.getRTCConnection()!.addIceCandidate(JSON.parse(item));
  //   }
  //   this.ManualWebrtcService.addLog('✓ ICE added');
  // }

  //   sendMessage() {
  //     const text = this.messageInput().trim();
  //     if (
  //       !text ||
  //       !this.WebRTCService.getChannel() ||
  //       this.WebRTCService.getChannel()!.readyState !== 'open'
  //     )
  //       return;
  //     this.WebRTCService.getChannel()!.send(text);
  //    // this.addMsg(text, true);
  //  //   this.messageInput.set('');
  //   }

  // copyOffer() {
  //   navigator.clipboard?.writeText(this.generdateSharedSecret);
  // }

  copyIce(c: string) {
    navigator.clipboard?.writeText(c);
  }

  copyAllIce() {
    navigator.clipboard?.writeText(this.WebRTCService.getLocalIceCandidates().join('\n\n'));
  }

  // private addMsg(text: string, me: boolean) {
  //   this.messages.update((m) => [...m, { text, me, time: new Date().toLocaleTimeString() }]);
  // }

  // resetWebRTC(close = false) {
  //   console.log('🔄 Resetting WebRTC connection...');
  //   this.wsSub?.unsubscribe();
  //   this.ManualWebrtcService.closeSocket();
  //   this.WebRTCService.getRTCConnection()?.close();
  //   this.WebRTCService.setRTCConnection(null);
  //   this.WebRTCService.setChannel(null);

  //   this.screenStream?.getTracks().forEach((t) => t.stop());
  //   this.screenStream = null;

  //   this.WebRTCService.setOfferText('');
  //   this.WebRTCService.setAnswerText('');
  //   this.WebRTCService.setLocalIceCandidates([]);
  //   this.WebRTCService.setRemoteIceText([]);
  //   this.messages.set([]);

  //   this.progressSetuper.set([false, false, false, false]);
  //   this.OfferCreated.set(false);
  //   this.sendBtn.set(false);
  //   this.generdateSharedSecret = '';
  //   this.status.set('nothing');
  //   console.log('✅ WebRTC fully reset');
  // }
}
