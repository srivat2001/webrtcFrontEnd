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
  private isNegotiating = false;
  private answerApplied = false;
  constructor(private ManualWebrtcService: ManualWebrtcService) {
    this.ManualWebrtcService.getScreenRecordingStream.subscribe((stream) => {
      if (!stream) {
        this.isScreenShareStarted.set(false);
        return;
      }
      this.isScreenShareStarted.set(true);
      if (this.pc && this.pc!.connectionState === 'connected') {
        console.log('send to screen');
        const msg = JSON.stringify({ type: 'media-send-indent', _contentType: 'screen' });
        this.channel?.send(msg);
      }
    });
    this.ManualWebrtcService.getCameraStream.subscribe((stream) => {
      if (!stream) return;
      if (this.pc && this.pc!.connectionState === 'connected') {
        console.log('Message sent intent camera');
        const msg = JSON.stringify({ type: 'media-send-indent', _contentType: 'camera' });
        this.channel?.send(msg);
      }
    });
    this.ManualWebrtcService.getAudioStream.subscribe((stream) => {
      if (!stream) return;
      if (this.pc && this.pc!.connectionState === 'connected') {
        console.log('Message sent intent audio');
        const msg = JSON.stringify({ type: 'media-send-indent', _contentType: 'audio' });
        this.channel?.send(msg);
      }
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
    if (this.isOfferer()) {
      this.channel = this.pc.createDataChannel('chat');
      this.setupDataChannel(this.channel);
    } else {
      this.pc!.ondatachannel = (event) => {
        this.channel = event.channel;
        this.setupDataChannel(this.channel);
      };
    }

    let isConnectionCreated = false;
    this.pc.oniceconnectionstatechange = (e) => {
      console.log(this.pc?.connectionState);
      if (this.pc?.connectionState === 'connected') {
        this.connectedcreated = true;
        this.ManualWebrtcService.updateConnectionState({
          status: 'connected',
          connectedcreated: true,
          sendBtn: true,
        });
      }
    };
    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', this.pc!.iceConnectionState, performance.now());
      if (this.pc && this.pc!.iceConnectionState === 'connected') {
        this.inspectIce(this.pc);
      }
    };

    this.pc.onicegatheringstatechange = () => {
      console.log('ICE gathering:', this.pc!.iceGatheringState, performance.now());
    };

    this.pc.onconnectionstatechange = () => {
      console.log('PC state:', this.pc!.connectionState, performance.now());
    };

    this.pc!.onicecandidate = (e) => {
      if (!e.candidate) return;
      //    if (e.candidate.candidate.includes(' tcp ')) return;
      this.localIceCandidates.update((c) => [...c, JSON.stringify(e.candidate)]);
      clearTimeout(this.iceTimer);
      this.iceTimer = setTimeout(() => {
        if (this.role === 'offer' && !isConnectionCreated) {
          this.ManualWebrtcService.connectPersistent();
          isConnectionCreated = true;
        } else {
          this.afterIceCandidatesCreation();
        }
      }, 0);
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
        console.log('renociagtiion');
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
      console.log('Track received: with type', event, this.toReciveStreamType);
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
  async inspectIce(pc: RTCPeerConnection) {
    const stats = await pc.getStats();

    let selectedPair: any = null;
    let localCandidate: any = null;
    let remoteCandidate: any = null;

    stats.forEach((report) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        selectedPair = stats.get(report.selectedCandidatePairId);
      }
    });

    if (!selectedPair) {
      console.log('❌ No selected candidate pair yet');
      return;
    }

    localCandidate = stats.get(selectedPair.localCandidateId);
    remoteCandidate = stats.get(selectedPair.remoteCandidateId);

    console.log('✅ SELECTED CANDIDATE PAIR');
    console.log('Local Candidate:', localCandidate);
    console.log('Remote Candidate:', remoteCandidate);
    console.log('Candidate Pair:', selectedPair);
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
    this.ManualWebrtcService.updateConnectionState({
      status: 'connecting_to_existing',
    });
    this.createPeerIfNeeded();
    if (!this.roomId()) {
      this.ManualWebrtcService.updateConnectionState({ status: 'nothing' });
      this.ManualWebrtcService.ErrorMessageSubject.next('Enter Room id');
    }
    this.ManualWebrtcService.connectPersistent();
    this.initialiseWebsocket();
    console.log('Connecting to existing connection...');
    if (fromStorage && event) {
      event.preventDefault();
      //  this.userid.nativeElement.value = roomid + '$' + roomSecret;
    }

    // if (!(userid === '')) {
    //   const result = await this.fetchOffer(userid);
    //   if (result.type === 'error' || result.data === 'room-not-found') {
    //     this.ManualWebrtcService.addLog('✗ Room not found');
    //     //   this.webrtcUi.showAlert();
    //   } else {
    //     console.log('Offer fetched:', result);
    //     this.offerText.set(result.data.roomdata.OffererData.offer);
    //     this.roomname.set(userid);
    //     this.createAnswer().then((val) => {
    //       this.ManualWebrtcService.addLog('✗ Offer Added');
    //     });
    //   }
    // } else {
    //   //this.webrtcUi.showAlert();
    // }
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
        const offerIceArray: string[] = this.remoteIceText(); // your array
        for (const iceStr of offerIceArray) {
          const iceObj: RTCIceCandidateInit = JSON.parse(iceStr);
          await this.pc.addIceCandidate(iceObj);
        }
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
  fetchOffer(roomname: string): void {
    this.ManualWebrtcService.sendMessage({
      type: 'get-roomdata',
      payload: { roomname },
    });
  }

  applyAnswer(roomname: string, answer: RTCSessionDescriptionInit, iceCandidates: any[]): void {
    this.ManualWebrtcService.sendMessage({
      type: 'answer-connection',
      payload: {
        roomname,
        answerSDP: answer,
        asnwerICEcandidates: iceCandidates,
      },
    });
  }
  BulkSend: string[] = [];
  sendStreamifExists = async () => {
    if (this.ManualWebrtcService.getCameraStreamValue().getVideoTracks().length > 0) {
      this.BulkSend.push('camera');
    }
    if (this.ManualWebrtcService.getScreenrecordingStreamValue().getVideoTracks().length > 0) {
      this.BulkSend.push('screen');
    }
    if (this.ManualWebrtcService.getAudioStreamValue().getAudioTracks().length > 0) {
      this.BulkSend.push('audio');
    }
    if (this.BulkSend.length > 0) {
      this.channel?.send(
        JSON.stringify({ type: 'media-send-indent', _contentType: this.BulkSend.pop() })
      );
    }
  };
  private async safeSetRemoteDescription(desc: RTCSessionDescriptionInit) {
    if (!this.pc) return;

    // prevent duplicate answer application
    if (this.answerApplied) {
      console.warn('Answer already applied, skipping');
      return;
    }
    await this.pc.setRemoteDescription(desc);
    console.log('Setting remote desc');
    if (desc.type === 'answer') {
      this.answerApplied = true;
    }
    this.wsSub?.unsubscribe();
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log('connected', new Date());
      this.connectedcreated = true;
      this.ManualWebrtcService.updateConnectionState({
        status: 'connected',
        connectedcreated: true,
        sendBtn: true,
      });
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
        this.answerApplied = false;
        await this.safeSetRemoteDescription(msg.sdp);
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        console.log('renocoiation offer');

        this.channel!.send(
          JSON.stringify({
            type: 'negotiation-answer',
            sdp: this.pc!.localDescription,
          })
        );
        return;
      }
      if (msg.type === 'negotiation-answer') {
        this.answerApplied = false;

        await this.safeSetRemoteDescription(msg.sdp);
        console.log('renocoiation answer');
        this.isNegotiating = false;
        return;
      }
      if (msg.type === 'ack-media-send-indent') {
        if (msg._contentType === 'camera' && this.ManualWebrtcService.getCameraStreamValue()) {
          console.log('added track camera');
          this.pc!.addTrack(
            (this.ManualWebrtcService.getCameraStreamValue() as MediaStream).getVideoTracks()[0]
          );
          this.resolveFn('done');
        } else if (
          msg._contentType === 'screen' &&
          this.ManualWebrtcService.getScreenrecordingStreamValue()
        ) {
          console.log('added track screen');
          this.pc!.addTrack(
            this.ManualWebrtcService.getScreenrecordingStreamValue().getVideoTracks()[0]
          );
        } else if (msg._contentType === 'audio' && this.ManualWebrtcService.getAudioStreamValue()) {
          console.log('Sent Audio Track');
          this.pc!.addTrack(this.ManualWebrtcService.getAudioStreamValue().getAudioTracks()[0]);
        }
        if (this.BulkSend.length > 0) {
          this.channel?.send(
            JSON.stringify({ type: 'media-send-indent', _contentType: this.BulkSend.pop() })
          );
        }
      }
      if (msg.type === 'media-send-indent') {
        console.log('Message sent intent camera ack, ', msg);
        this.channel!.send(
          JSON.stringify({ type: 'ack-media-send-indent', _contentType: msg._contentType })
        );
        this.toReciveStreamType = msg._contentType;
      }
      if (msg.type === 'text-message') {
        console.log(msg);
        this.ManualWebrtcService.PushToMessage(
          msg.content as { text: string; me: boolean; time: string }
        );
      }
    };

    channel.onclose = () => {
      this.ManualWebrtcService.updateConnectionState({
        status: 'nothing',
        connectedcreated: false,
        sendBtn: false,
      });
      console.log('Channel closed!');
      this.resetWebRTC();
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

  sendMessage(msg: string) {
    if (this.channel) {
      this.channel.send(
        JSON.stringify({
          type: 'text-message',
          content: {
            text: msg,
            me: false,
            time: 'test',
          },
        })
      );
      this.ManualWebrtcService.PushToMessage({
        text: msg,
        me: false,
        time: 'test',
      } as { text: string; me: boolean; time: string });
    }
  }
  createOffer = async (): Promise<void> => {
    this.ManualWebrtcService.updateConnectionState({
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
    this.wsSub = this.ManualWebrtcService.listenMessages().subscribe(async (val) => {
      console.log('WS Message received:', val);
      const data = val.data;
      if (!data) return;
      if (this.isOfferer() && data.forWho === 'answer') {
        return;
      }
      if (data === 'ws_connected' && this.isOfferer()) {
        this.sendOfferAndIce('', this.getOfferText(), this.getLocalIceCandidates());
        return;
      } else if (data === 'ws_connected' && !this.isOfferer()) {
        console.log('calling from answer');
        const userid = this.roomId();
        this.fetchOffer(userid);
      }

      switch (data.status) {
        case 'offer_stored':
          console.log('Offer added, waiting for answer...');
          this.connectedcreated = true;
          setTimeout(() => {
            this.roomId.set(data.roomname);
            this.ManualWebrtcService.updateConnectionState({
              status: 'user_id_created',
            });
          }, 1000);
          break;

        case 'answer_ready':
          this.setAnswerText(data.room.AnswererData.answer);
          this.setRemoteIceText(data.room.AnswererData.ICEcandidate);
          this.ApplyRemoteDescAndIce();
          break;
        case 'roomname_is_required':
          this.ManualWebrtcService.ErrorMessageSubject.next('Room Doesnt exists');
          this.ManualWebrtcService.updateConnectionState({ status: 'nothing' });
          return;

          break;
        case 'offerdata_fetched':
          if (!this.isOfferer()) {
            const result = data.roomdata;
            this.setOfferText(result.OffererData.offer);
            this.setRemoteIceText(result.OffererData.ICEcandidate);
            this.roomname.set(data.roomname);
            this.createAnswer().then((val) => {
              this.ManualWebrtcService.addLog('✗ Offer Added');
            });
          }
          break;
        default:
          console.warn('Unhandled WS message', data);
      }
    });
  }
  // if (!(userid === '')) {
  //   const result = await this.fetchOffer(userid);
  //   if (result.type === 'error' || result.data === 'room-not-found') {
  //     this.ManualWebrtcService.addLog('✗ Room not found');
  //     //   this.webrtcUi.showAlert();
  //   } else {
  //     console.log('Offer fetched:', result);
  //     this.offerText.set(result.data.roomdata.OffererData.offer);
  //     this.roomname.set(userid);
  //     this.createAnswer().then((val) => {
  //       this.ManualWebrtcService.addLog('✗ Offer Added');
  //     });
  //   }
  // } else {
  //   //this.webrtcUi.showAlert();
  // }

  sendOfferAndIce(roomname: string, offer: any, ice: any): void {
    this.ManualWebrtcService.sendMessage({
      type: 'create-connection',
      payload: {
        roomname,
        offer,
        ICEcandidate: ice,
      },
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
    this.answerApplied = false;
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
    this.ManualWebrtcService.updateConnectionState({ status: 'nothing' });
    console.log('✅ WebRTC fully reset');
  }
}
