import { Component, ElementRef, OnInit, ViewChild, computed, signal } from '@angular/core';
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
  selector: 'app-answer',
  standalone: true,
  imports: [CommonModule, FormsModule, ...MATERIAL_IMPORTS, FlipDirective, WebrtcUiComponent],
  templateUrl: './answer.component.html',
  styleUrls: ['../main/main.component.scss'],
})
export class AnswerComponent {
  @ViewChild(WebrtcUiComponent) webrtcUi!: WebrtcUiComponent;
  //offerText = signal<any>(null);
  //answerText = signal<any>(null);
  //remoteIceText = signal('');
  // //localIceCandidates = signal<string[]>([]);
  // messageInput = signal('');
  // messages = signal<any[]>([]);
  // sendBtn = signal(false);
  // private iceTimer: any;
  // //useServerToggle = signal(true);
  // public screenStream: MediaStream | null = null;
  // //public cameraStream: MediaStream | null = null;
  // //public screenTx: RTCRtpTransceiver | null = null;
  // //public cameraTx: RTCRtpTransceiver | null = null;
  // //prvate screenSender: RTCRtpSender | null = null;
  // //private pc: RTCPeerConnection | null = null;
  // //private channel: RTCDataChannel | null = null;
  // //private roomname = signal('');
  // chathidden = true;
  // isScreenShareStarted = signal(false);
  // roomId = signal<string>('');
  // private wsSub: Subscription | null = null;
  // connectedcreated = false;
  // status = signal<string>('nothing');

  // private connectionStateSubject = new BehaviorSubject<RTCPeerConnectionState>('new');
  // connectionState$ = this.connectionStateSubject.asObservable();
  // connectionState: 'Connected' | 'Connecting' | 'Disconnected' = 'Disconnected';
  // //offerAccepted = false;
  constructor(
    private readonly ManualWebrtcService: ManualWebrtcService,
    private readonly WebRTCService: WebRTCService
  ) {
    WebRTCService.setRole('answer');
  }
  // @ViewChild('userid', { static: false }) userid!: ElementRef;
  // @ViewChild('password', { static: false }) password!: ElementRef;
  // toReciveStreamType: 'screen' | 'camera' = 'screen';
  // rooms = signal<StoredRoom[]>([]);
  // get wslUrl() {
  //   return this.ManualWebrtcService.wslUrl;
  // }
  // copyOffer() {}
  // status_text: Record<string, string> = {
  //   nothing: 'Enter room iD',
  //   connected: 'Connected to Room',
  // };
  // openchat() {
  //   this.chathidden = !this.chathidden;
  // }
  // get progressSetuper() {
  //   return this.ManualWebrtcService.progressSetuper;
  // }
  // get stepLabels() {
  //   return this.ManualWebrtcService.stepLabels;
  // }
  // firstIncompleteIndex = computed(() => {
  //   const idx = this.progressSetuper().indexOf(false);
  //   return idx === -1 ? null : idx;
  // });

  // ngOnInit(): void {
  //   this.ManualWebrtcService.loadSavedRooms(this.rooms);

  //   // this.pc = new RTCPeerConnection({
  //   //   iceServers: [
  //   //     { urls: 'stun:stun.l.google.com:19302' },
  //   //     {
  //   //       urls: 'turn:relay.metered.ca:80',
  //   //       username: 'openrelayproject',
  //   //       credential: 'openrelayproject',
  //   //     },
  //   //     {
  //   //       urls: 'turn:relay.metered.ca:443',
  //   //       username: 'openrelayproject',
  //   //       credential: 'openrelayproject',
  //   //     },
  //   //   ],
  //   // });
  //   // this.pc!.ondatachannel = (event) => {
  //   //   this.channel = event.channel;
  //   //   this.setupDataChannel(this.channel);
  //   // };
  //   // this.pc!.ontrack = (event) => {
  //   //   const track = event.track;
  //   //   console.log('Track received: with type', event, this.toReciveStreamType);
  //   //   let stream: MediaStream;
  //   //   if (event.streams && event.streams.length > 0) {
  //   //     stream = event.streams[0];
  //   //   } else {
  //   //     stream = new MediaStream();
  //   //     stream.addTrack(event.track);
  //   //   }
  //   //   track.onended = () => {
  //   //     console.log('Remote stopped sending video');
  //   //     this.webrtcUi.updateVideo(null, 'screen', true);
  //   //     // clean UI, show placeholder, etc.
  //   //   };
  //   //   this.webrtcUi.updateVideo(stream, this.toReciveStreamType, true);
  //   // };
  //   // this.pc.onconnectionstatechange = () => {
  //   //   this.connectionStateSubject.next(this.pc!.connectionState);
  //   // };
  //   // this.pc!.onicecandidate = (e) => {
  //   //   if (e.candidate) {
  //   //     this.localIceCandidates.update((candidates) => [
  //   //       ...candidates,
  //   //       JSON.stringify(e.candidate),
  //   //     ]);
  //   //     clearTimeout(this.iceTimer);
  //   //     this.iceTimer = setTimeout(() => {
  //   //       this.afterIceCandidatesCreation();
  //   //     }, 2000);
  //   //   }
  //   // };
  //   // this.pc.onnegotiationneeded = async () => {
  //   //   if (this.pc?.connectionState !== 'connected') return;
  //   //   if (!this.channel || this.channel.readyState !== 'open') return;
  //   //   try {
  //   //     console.log('Renegotiation started by this peer');
  //   //     const offer = await this.pc.createOffer();
  //   //     await this.pc.setLocalDescription(offer);
  //   //     this.channel.send(
  //   //       JSON.stringify({
  //   //         type: 'negotiation-offer',
  //   //         sdp: this.pc.localDescription,
  //   //       })
  //   //     );
  //   //   } finally {
  //   //     // DO NOT unlock here — unlock when answer arrives
  //   //   }
  //   // };
  //   // this.ManualWebrtcService.getScreenRecordingStream.subscribe((stream) => {
  //   //   if (!stream) {
  //   //     this.isScreenShareStarted.set(false);
  //   //     this.screenStream = null;
  //   //     return;
  //   //   }
  //   //   this.isScreenShareStarted.set(true);
  //   //   this.screenStream = stream;
  //   //   if (this.pc!.connectionState === 'connected') {
  //   //     const msg = JSON.stringify({ type: 'video-send-indent', _contentType: 'screen' });
  //   //     this.channel?.send(msg);
  //   //   }
  //   // });
  //   // this.ManualWebrtcService.getCameraStream.subscribe((stream) => {
  //   //   if (!stream) return;
  //   //   this.cameraStream = stream;
  //   //   if (this.pc!.connectionState === 'connected') {
  //   //     const msg = JSON.stringify({ type: 'video-send-indent', _contentType: 'camera' });
  //   //     this.channel?.send(msg);
  //   //   }
  //   // });
  // }

  // // createOffer() {}
  // // connectToExistingConnection = async (
  // //   fromStorage = false,
  // //   roomid?: string,
  // //   roomSecret?: string,
  // //   event?: Event
  // // ) => {
  // //   this.WebRTCService.connectToExistingConnection(fromStorage, roomid, roomSecret, event);
  // // };

  // // logs() {
  // //   return this.ManualWebrtcService.getLogs()();
  // // }
  // // ///asset
  // // copyAnswer = (): void => {
  // //   // navigator.clipboard?.writeText(this.answerText()).catch((e) => console.warn(e));
  // // };

  // // sendMessage = (): void => {
  // //   // const text = this.messageInput().trim();
  // // };

  // // resetWebRTC(close = false) {
  // //   console.log('🔄 Resetting WebRTC connection...');
  // //   this.WebRTCService.resetWebRTC(close);
  // // }
}
