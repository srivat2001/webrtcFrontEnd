import { Injectable, signal } from '@angular/core';
import { ManualWebrtcService } from './manual-webrtc.service';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { RoomResponse } from '../../app/components/interface';

// manual-webrtc.service.ts
export interface VideoUpdateEvent {
  stream: MediaStream | null;
  type?: string;
  isReceivingScreen?: boolean;
}
export interface ConnectionState {
  connectedcreated: boolean;
  status: 'connected' | 'disconnected' | string;
  sendBtn: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private isScreenShareStarted = signal(false);
  private localIceCandidates = signal<string[]>([]);
  private connectionStateSubject = new BehaviorSubject<RTCPeerConnectionState>('new');
  private toReciveStreamType = 'screen';
  private iceTimer: any;
  private resolveFn!: (value: any) => void;
  private offerText = signal('');
  private answerText = signal<any>(null);
  private remoteIceText = signal<string[]>([]);
  private videoUpdateSubject = new Subject<VideoUpdateEvent>();
  private generdateSharedSecret = '';
  private OfferCreated = signal(false);
  videoUpdate$ = this.videoUpdateSubject.asObservable();
  private roomname = signal('');
  private roomId = signal<string>('');
  connectedcreated = false;
  status = signal('nothing');
  sendBtn = signal(false);
  messageInput = signal('');
  private wsSub: Subscription | null = null;
  private role = 'offer';
  private connStateData = new BehaviorSubject<ConnectionState>({
    connectedcreated: false,
    status: 'nothing',
    sendBtn: false,
  });
  connStateData$ = this.connStateData.asObservable();
  private isNegotiating = false;
  private answerApplied = false;
  constructor(private ManualWebrtcService: ManualWebrtcService) {
    this.ManualWebrtcService.getScreenRecordingStream.subscribe((stream) => {
      if (!stream) {
        this.isScreenShareStarted.set(false);
        return;
      }
      this.isScreenShareStarted.set(true);
      if (this.pc!.connectionState === 'connected') {
        const msg = JSON.stringify({ type: 'video-send-indent', _contentType: 'screen' });
        this.channel?.send(msg);
      }
    });
    this.ManualWebrtcService.getCameraStream.subscribe((stream) => {
      if (!stream) return;
      if (this.pc!.connectionState === 'connected') {
        const msg = JSON.stringify({ type: 'video-send-indent', _contentType: 'camera' });
        this.channel?.send(msg);
      }
    });
  }

  updateConnectionState(partial: Partial<ConnectionState>) {
    const current = this.connStateData.value;
    this.connStateData.next({
      ...current,
      ...partial,
    });
  }
  setOfferText(offer: string) {
    this.offerText.set(offer);
  }
  getOfferText() {
    return this.offerText();
  }
  setAnswerText(answer: string) {
    this.answerText.set(answer);
  }
  getAnswerText() {
    return this.answerText();
  }
  getLocalIceCandidates() {
    return this.localIceCandidates();
  }
  setLocalIceCandidates(candidates: string[]) {
    this.localIceCandidates.set(candidates);
  }
  setRemoteIceText(candidates: string[]) {
    this.remoteIceText.set(candidates);
  }
  getRemoteIceText() {
    return this.remoteIceText();
  }
  getRTCConnection() {
    return this.pc;
  }
  setRTCConnection(pc: RTCPeerConnection | null) {
    this.pc = pc;
  }
  getChannel() {
    return this.channel;
  }
  setChannel(channel: RTCDataChannel | null) {
    this.channel = channel;
  }
  emitVideoUpdate(stream: MediaStream | null, type: string = 'screen', isReceivingScreen = false) {
    this.videoUpdateSubject.next({ stream, type, isReceivingScreen });
  }
  setRole(role: 'offer' | 'answer') {
    this.role = role;
  }
  isOfferer() {
    return this.role === 'offer';
  }
  isAnswerer() {
    return this.role === 'answer';
  }
  setRoomid(roomid: string) {
    this.roomId.set(roomid);
  }
  getRoomid() {
    return this.roomId();
  }
  get wslUrl() {
    return this.ManualWebrtcService.wslUrl;
  }
  createPeerIfNeeded() {
    if (this.pc) return;
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:relay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    });
    this.channel = this.pc.createDataChannel('chat');
    this.setupDataChannel(this.channel);
    this.pc!.ondatachannel = (event) => {
      this.channel = event.channel;
      this.setupDataChannel(this.channel);
    };
    this.pc!.onicecandidate = (e) => {
      if (!e.candidate) return;
      this.localIceCandidates.update((c) => [...c, JSON.stringify(e.candidate)]);
      clearTimeout(this.iceTimer);
      this.iceTimer = setTimeout(() => {
        if (this.role === 'offer') {
          this.ManualWebrtcService.connectPersistent();
        } else {
          this.afterIceCandidatesCreation();
        }
      }, 2000);
    };
    this.pc!.onconnectionstatechange = () => {
      this.connectionStateSubject.next(this.pc!.connectionState);
    };
    this.pc!.onnegotiationneeded = async () => {
      if (this.pc?.connectionState !== 'connected') return;
      if (!this.channel || this.channel.readyState !== 'open') return;
      if (this.isNegotiating) return;
      this.isNegotiating = true;

      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.channel.send(
          JSON.stringify({
            type: 'negotiation-offer',
            sdp: this.pc.localDescription,
          })
        );
      } finally {
        // DO NOT unlock here — unlock when answer arrives
      }
    };
    this.pc!.ontrack = (event) => {
      const track = event.track;
      let stream: MediaStream;
      if (event.streams && event.streams.length > 0) {
        stream = event.streams[0];
      } else {
        stream = new MediaStream();
        stream.addTrack(event.track);
      }
      track.onended = () => {
        this.emitVideoUpdate(null, 'screen', true);
      };
      this.emitVideoUpdate(stream, this.toReciveStreamType, true);
    };
  }
  afterIceCandidatesCreation() {
    this.applyAnswer(this.roomname(), this.answerText(), this.localIceCandidates());
  }
  connectToExistingConnection = async (
    fromStorage = false,
    roomid?: string,
    roomSecret?: string,
    event?: Event
  ) => {
    this.createPeerIfNeeded();
    console.log('Connecting to existing connection...');
    if (fromStorage && event) {
      event.preventDefault();
      //  this.userid.nativeElement.value = roomid + '$' + roomSecret;
    }
    const userid = this.roomId();
    if (!(userid === '')) {
      const result = await this.fetchOffer(userid);
      if (result.type === 'error' || result.data === 'room-not-found') {
        this.ManualWebrtcService.addLog('✗ Room not found');
        //   this.webrtcUi.showAlert();
      } else {
        console.log('Offer fetched:', result);
        this.offerText.set(result.data.roomdata.OffererData.offer);
        this.roomname.set(userid);
        this.createAnswer().then((val) => {
          this.ManualWebrtcService.addLog('✗ Offer Added');
        });
      }
    } else {
      //this.webrtcUi.showAlert();
    }
  };

  private createAnswer = async (): Promise<void> => {
    if (!this.pc || !this.offerText()) {
      this.ManualWebrtcService.addLog('✗ Offer empty');
      alert('Please paste offer first');
      return;
    }
    try {
      if (this.offerText()) {
        const offer: any = JSON.parse(this.offerText()); // non-null assertion
        await this.pc.setRemoteDescription(offer);
        const ans = await this.pc.createAnswer();
        await this.pc.setLocalDescription(ans);
        this.answerText.set(JSON.stringify(ans, null, 2));
        this.ManualWebrtcService.addLog('✓ Answer created');
      }
    } catch (e) {
      this.ManualWebrtcService.addLog('✗ Error: ' + (e as any).message);
      console.error('Error creating answer', e);
      alert('Error creating answer: ' + (e as any).message);
    }
  };
  fetchOffer(roomname: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.wslUrl}/get-roomdata`);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            roomname: roomname,
          })
        );
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        resolve(data);
        ws.close(); // ← CLOSE AFTER RECEIVING!
      };
      ws.onerror = reject;
    });
  }
  applyAnswer(
    roomname: string,
    answer: RTCSessionDescriptionInit,
    iceCandidates: any[]
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.wslUrl}/answer-connection`);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            roomname,
            answerSDP: answer,
            asnwerICEcandidates: iceCandidates,
          })
        );
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        resolve(data);
        ws.close(); // close after receiving response
      };

      ws.onerror = reject;
    });
  }
  sendStreamifExists = async () => {
    if (this.ManualWebrtcService.getCameraStreamValue()) {
      await new Promise<string>((resolve) => {
        this.resolveFn = resolve;
        this.ManualWebrtcService.setCameraStream(this.ManualWebrtcService.getCameraStreamValue());
      });
    }
    setTimeout(() => {
      if (this.ManualWebrtcService.getScreenrecordingStreamValue()) {
        console.log('Sending screen recording stream');
        this.ManualWebrtcService.setScreenRecordingStream(
          this.ManualWebrtcService.getScreenrecordingStreamValue()
        );
      }
    }, 10);
  };
  private async safeSetRemoteDescription(desc: RTCSessionDescriptionInit) {
    if (!this.pc) return;

    // prevent duplicate answer application
    if (desc.type === 'answer' && this.answerApplied) {
      console.warn('Answer already applied, skipping');
      return;
    }

    // enforce WebRTC state machine
    if (desc.type === 'answer' && this.pc.signalingState !== 'have-local-offer') {
      console.warn('Skipping answer, wrong state:', this.pc.signalingState);
      return;
    }

    if (desc.type === 'offer' && this.pc.signalingState !== 'stable') {
      console.warn('Skipping offer, wrong state:', this.pc.signalingState);
      return;
    }

    await this.pc.setRemoteDescription(desc);

    if (desc.type === 'answer') {
      this.answerApplied = true;
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      this.connectedcreated = true;
      this.updateConnectionState({ status: 'connected', connectedcreated: true, sendBtn: true });
      const payload = {
        type: 'connection-established',
        reconnectionSecret: this.roomname() + '$' + this.generateReconnectionSecret(),
      };

      this.safeSend(channel, payload);
      this.sendStreamifExists();
    };
    channel.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'negotiation-offer') {
        await this.safeSetRemoteDescription(msg.sdp);
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.channel!.send(
          JSON.stringify({
            type: 'negotiation-answer',
            sdp: this.pc!.localDescription,
          })
        );
        return;
      }
      if (msg.type === 'negotiation-answer') {
        await this.safeSetRemoteDescription(msg.sdp);
        this.isNegotiating = false;
        return;
      }
      if (msg.type === 'ack-video-send-indent') {
        if (msg._contentType === 'camera' && this.ManualWebrtcService.getCameraStreamValue()) {
          this.pc!.addTrack(
            (this.ManualWebrtcService.getCameraStreamValue() as MediaStream).getVideoTracks()[0]
          );
          this.resolveFn('done');
        } else if (
          msg._contentType === 'screen' &&
          this.ManualWebrtcService.getScreenrecordingStreamValue()
        ) {
          this.pc!.addTrack(
            this.ManualWebrtcService.getScreenrecordingStreamValue()!.getVideoTracks()[0]
          );
        }
      }
      if (msg.type === 'video-send-indent') {
        this.channel!.send(
          JSON.stringify({ type: 'ack-video-send-indent', _contentType: msg._contentType })
        );
        this.toReciveStreamType = msg._contentType;
      }
    };

    channel.onclose = () => {
      this.updateConnectionState({
        status: 'nothing',
        connectedcreated: false,
        sendBtn: false,
      });
      console.log('Channel closed!');
      //  this.sendBtn.set(false);
    };
  }
  private generateReconnectionSecret(): string {
    return crypto
      .getRandomValues(new Uint8Array(32))
      .reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), '');
  }
  private safeSend(channel: RTCDataChannel, data: Record<string, string>) {
    const trySend = () => {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(data));
        this.ManualWebrtcService.addtoSavedRoom(this.roomname(), data['reconnectionSecret']);
        return;
      }
      setTimeout(trySend, 10);
    };

    trySend();
  }
  createOffer = async (): Promise<void> => {
    this.updateConnectionState({
      status: 'offer_initiated',
    });

    this.initialiseWebsocket();
    this.createPeerIfNeeded();
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this.setOfferText(JSON.stringify(offer, null, 2));
    this.OfferCreated.set(true);
    this.ManualWebrtcService.addLog('✓ Offer created');
  };
  private initialiseWebsocket(): void {
    this.wsSub?.unsubscribe();
    this.wsSub = this.ManualWebrtcService.listenMessages().subscribe((val) => {
      console.log('WS Message received:', val);
      const data = val.data;
      if (!data) return;
      if (data === 'ws_connected') {
        this.generdateSharedSecret = '';
        this.ManualWebrtcService.sendMessage({
          type: 'request',
          data: this.generdateSharedSecret ? { roomname: this.generdateSharedSecret } : {},
        });
        return;
      }

      switch (data.status) {
        case 'room-created':
          console.log('Room created:', data.roomname);
          this.generdateSharedSecret = data.roomname;
          this.sendOfferAndIce(
            data.roomname,
            this.getOfferText(),
            this.getLocalIceCandidates()
          ).then(console.log);
          break;

        case 'answer_ready':
          this.setAnswerText(data.room.AnswererData.answer);
          this.setRemoteIceText(data.room.AnswererData.ICEcandidate);
          this.ApplyRemoteDescAndIce();
          break;

        case 'offer_added':
          console.log('Offer added, waiting for answer...');
          this.connectedcreated = true;
          setTimeout(() => {
            this.roomId.set(data.roomname);
            this.updateConnectionState({
              status: 'user_id_created',
            });
          }, 1000);
          break;

        default:
          console.warn('Unhandled WS message', data);
      }
    });
  }
  sendOfferAndIce(roomname: string, offer: any, ice: any): Promise<RoomResponse> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.wslUrl}/create-connection`);
      ws.onopen = () => ws.send(JSON.stringify({ roomname, offer, ICEcandidate: ice }));
      ws.onmessage = (e) => {
        resolve(JSON.parse(e.data));
        ws.close();
      };
      ws.onerror = reject;
    });
  }
  async ApplyRemoteDescAndIce() {
    if (!this.pc || !this.answerText) {
      this.ManualWebrtcService.addLog('✗ Answer empty');
      return alert('Please paste answer first');
    }
    await this.safeSetRemoteDescription(JSON.parse(this.getAnswerText()));
    this.ManualWebrtcService.addLog('✓ Answer applied');
    if (!this.getRTCConnection()) return alert('PC not ready');
    for (const item of this.getRemoteIceText()) {
      if (item) await this.getRTCConnection()!.addIceCandidate(JSON.parse(item));
    }
    this.ManualWebrtcService.addLog('✓ ICE added');
  }

  resetWebRTC(close = false) {
    console.log('🔄 Resetting WebRTC connection...');
    this.ManualWebrtcService.closeSocket();

    this.pc?.close();
    this.pc = null;
    this.channel?.close();
    this.channel = null;
    this.offerText.set('');
    this.answerText.set('');
    this.localIceCandidates.set([]);
    this.remoteIceText.set([]);
    this.roomId.set('');
    this.sendBtn.set(false);
    this.updateConnectionState({ status: 'nothing' });
    console.log('✅ WebRTC fully reset');
  }
}
