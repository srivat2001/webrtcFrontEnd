import { Component, computed, ElementRef, NgZone, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../matimports';
import { ManualWebrtcService } from '../../services/manual-webrtc.service';
import { FlipDirective } from '../../directives/flip.directive';
import { RoomResponse } from '../interface';
import { BehaviorSubject, Subscription } from 'rxjs';

type StoredRoom = { [roomId: string]: string };
@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule, FormsModule, ...MATERIAL_IMPORTS, FlipDirective],
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
})
export class MainComponent implements OnInit {
  offerText = signal('');
  answerText = signal('');
  remoteIceText = signal<string[]>([]);
  localIceCandidates = signal<string[]>([]);
  messageInput = signal('');
  messages = signal<any[]>([]);
  sendBtn = signal(false);
  useServerToggle = signal(true);
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private screenStream: MediaStream | null = null;
  private screenSender: RTCRtpSender | null = null;
  private remoteStream: MediaStream | null = null;
  OfferCreated = signal(false);
  selectedRoomSecret = signal('');
  isIceCreationAccordianExpanded = signal(true);
  generdateSharedSecret = '';
  showProgressBar = false;

  @ViewChild('userid', { static: false }) userid!: ElementRef;
  @ViewChild('password', { static: false }) password!: ElementRef;
  @ViewChild('screenVideo', { static: false }) screenVideo!: ElementRef<HTMLVideoElement>;
  private connectionStateSubject = new BehaviorSubject<RTCPeerConnectionState>('new');
  connectionState$ = this.connectionStateSubject.asObservable();
  constructor(private readonly ManualWebrtcService: ManualWebrtcService) {}
  private iceTimer: any;
  chathidden = false;
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
    const arr = this.progressSetuper();
    const idx = arr.indexOf(false);
    return idx === -1 ? null : idx; // if all true → no loader
  });
  private wsSub: Subscription | null = null;
  rooms = signal<StoredRoom[]>([]);
  connectionState: 'Connected' | 'Connecting' | 'Disconnected' = 'Disconnected';
  loaded = signal(true);
  ngOnInit(): void {
    this.connectionState$.subscribe((state) => {
      if (state === 'connected') this.connectionState = 'Connected';
      else if (state === 'connecting') this.connectionState = 'Connecting';
      else this.connectionState = 'Disconnected';
    });
    this.initialise();
  }
  openchat() {
    this.chathidden = !this.chathidden;
  }
  // keep initialise name: it now only initializes websocket + saved rooms
  initialise() {
    this.ManualWebrtcService.loadSavedRooms(this.rooms);
  }

  // New: isolated websocket initialization + switch handling
  private initialiseWebsocket(): void {
    this.wsSub?.unsubscribe();
    this.wsSub = this.ManualWebrtcService.listenMessages().subscribe((val) => {
      const data = val.data;
      if (!data) return;
      if (data === 'ws_connected') {
        this.generdateSharedSecret = this.generateDeviceId();
        const payload: { roomname?: string } = {};
        if (this.generdateSharedSecret) {
          payload['roomname'] = this.generdateSharedSecret;
        }
        this.ManualWebrtcService.sendMessage({ type: 'request', data: payload });
        return;
      }

      // data may be an object with status
      switch (data.status) {
        case 'room-created': {
          this.generdateSharedSecret = data.roomname;
          this.sendOfferAndIce(data.roomname, this.offerText(), this.localIceCandidates()).then(
            (val) => {
              console.log(val);
            }
          );
          break;
        }

        case 'answer_ready': {
          const room = data.room;
          this.answerText.set(room.AnswererData.answer);
          this.remoteIceText.set(room.AnswererData.ICEcandidate);
          this.ApplyRemoteDescAndIce();
          break;
        }

        case 'offer_added': {
          this.userid.nativeElement.value = data.roomname;
          this.progressSetuper.set([true, true, true, false]);
          break;
        }

        default: {
          console.warn('Unhandled WS message', data);
        }
      }
    });
  }
  private attachRemoteStreamToVideo() {
    try {
      const videoEl = this.screenVideo?.nativeElement;
      if (!videoEl || !this.remoteStream) return;

      // ensure autoplay isn't blocked
      videoEl.autoplay = true;
      videoEl.muted = true; // mute so browsers allow autoplay
      videoEl.playsInline = true;
      videoEl.srcObject = this.remoteStream;

      // try to play — may fail without user gesture, handle gracefully
      videoEl.play().catch((err) => {
        // not fatal — we'll still have srcObject and user can click play
        console.debug('Video play() blocked or failed:', err);
      });
    } catch (err) {
      console.warn('Error attaching remote stream to video', err);
    }
  }
  private createPeerIfNeeded(): void {
    if (this.pc) return;
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:relay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        { urls: 'turn:freestun.net:3478', username: 'free', credential: 'free' },
      ],
    });
    this.setupPeerListeners();

    this.channel = this.pc.createDataChannel('chat');
    this.setupDataChannel(this.channel!);
    this.pc!.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      this.remoteStream.addTrack(event.track);
      this.attachRemoteStreamToVideo();
    };
  }
  private setupPeerListeners(): void {
    if (!this.pc) return;
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.localIceCandidates.update((candidates) => [
          ...candidates,
          JSON.stringify(e.candidate, null, 2),
        ]);
        clearTimeout(this.iceTimer);
        this.iceTimer = setTimeout(() => {
          this.logDevicePairingPayload();
          this.progressSetuper.set([true, true, false, false]);
        }, 2000);
      }
    };
    this.pc!.onconnectionstatechange = () => {
      console.log('PC state:', this.pc!.connectionState);
      this.connectionStateSubject.next(this.pc!.connectionState);
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        const offer = await this.pc!.createOffer();
        await this.pc!.setLocalDescription(offer);
        await this.waitForChannelOpen(this.channel!);
        this.channel!.send(
          JSON.stringify({
            type: 'negotiation-main-offer',
            sdp: this.pc!.localDescription,
          })
        );
      } catch (err) {
        console.error('negotiation send failed:', err);
      }
    };

    // optional: handle connectionstatechange for better cleanup/logging
    this.pc.addEventListener('connectionstatechange', () => {
      const state = this.pc?.connectionState;
      this.ManualWebrtcService.addLog(`PC connectionState: ${state}`);
      if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        // keep behavior minimal; user explicitly resets via resetWebRTC
      }
    });
  }
  async waitForChannelOpen(channel: RTCDataChannel) {
    if (channel.readyState === 'open') return;
    await new Promise<void>((resolve) => {
      const listener = () => {
        if (channel.readyState === 'open') {
          channel.removeEventListener('open', listener);
          resolve();
        }
      };
      channel.addEventListener('open', listener);
    });
  }

  async ApplyRemoteDescAndIce() {
    await this.applyAnswer();
    await this.addRemoteIce();
  }
  logs() {
    return this.ManualWebrtcService.getLogs()();
  }
  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.sendBtn.set(true);
      this.attachRemoteStreamToVideo();

      if (this.remoteStream && this.screenVideo?.nativeElement) {
        this.screenVideo.nativeElement.srcObject = this.remoteStream;
      }
    };
    channel.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'negotiation-answer-offer') {
          await this.pc!.setRemoteDescription(data.sdp);
          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          this.channel!.send(
            JSON.stringify({
              type: 'negotiation-offer-answer',
              sdp: this.pc!.localDescription,
            })
          );
        }
        if (data.type === 'negotiation-answer-answer') {
          await this.pc!.setRemoteDescription(data.sdp);
        }
        if (data.type == 'connection-established') {
          this.ManualWebrtcService.addtoSavedRoom(
            this.generdateSharedSecret,
            data.reconnectionSecret
          );
        }
      } catch (err) {
        this.addMsg(e.data, false);
      }
    };
    channel.onclose = () => {
      console.log('Channel closed!');
      this.sendBtn.set(false);
    };
  }

  resetWebRTC(close = false) {
    this.wsSub?.unsubscribe();
    this.ManualWebrtcService.closeSocket();
    if (this.pc) {
      try {
        this.pc.getSenders().forEach((s) => this.pc!.removeTrack(s));
        this.pc.getReceivers().forEach((r) => r.track?.stop());
      } catch (e) {
        console.warn('Error cleaning tracks/senders', e);
      }
      this.pc.close();
      this.pc = null;
    }
    if (this.channel) {
      try {
        this.channel.close();
      } catch (e) {}
      this.channel = null;
    }
    if (this.screenStream) this.screenStream.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.screenSender = null;
    this.isScreenShareStarted.set(false);
    if (this.screenVideo?.nativeElement) this.screenVideo.nativeElement.srcObject = null;
    this.offerText.set('');
    this.answerText.set('');
    this.localIceCandidates.set([]);
    this.remoteIceText.set([]);
    this.progressSetuper.set([false, false, false, false]);
    this.OfferCreated.set(false);
    this.messages.set([]);
    this.sendBtn.set(false);
    this.selectedRoomSecret.set('');
    this.generdateSharedSecret = '';
    console.log('✅ WebRTC fully reset');
    if (!close) {
      // this.ManualWebrtcService.connectPersistent();
      // this.initialise();
      this.showProgressBar = true;
    } else {
      this.showProgressBar = false;
    }
  }
  createOffer = async (
    newroom = true,
    roomid?: string,
    roomsecret?: string,
    event?: Event
  ): Promise<void> => {
    this.showProgressBar = true;
    this.resetWebRTC(false);
    this.loaded.set(false);
    // Ensure PC exists only when creating an offer
    this.initialiseWebsocket();

    if (!this.pc) {
      this.createPeerIfNeeded();
    }

    if (!newroom && roomsecret && roomid && event) {
      event.preventDefault();
      this.isIceCreationAccordianExpanded.set(true);
      this.selectedRoomSecret.set(roomid + '$' + roomsecret);
    }
    const offer = await this.pc!.createOffer();
    console.log(offer);
    await this.pc!.setLocalDescription(offer);
    this.progressSetuper.set([true, false, false, false]);
    this.offerText.set(JSON.stringify(offer, null, 2));
    this.OfferCreated.set(true);
    this.ManualWebrtcService.addLog('✓ Offer created');

    // 🔥 Call the device pairing payload logger here
  };

  private async logDevicePairingPayload(): Promise<void> {
    this.ManualWebrtcService.connectPersistent();
  }

  sendOfferAndIce(roomname: string, offer: any, ice: any): Promise<RoomResponse> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.wslUrl}/create-connection`);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            roomname: roomname,
            offer: offer,
            ICEcandidate: ice,
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

  private generateDeviceId(): string {
    if (this.selectedRoomSecret()) {
      return this.selectedRoomSecret();
    }
    {
      return '';
    }
  }
  // ------------------- ANSWER -------------------
  applyAnswer = async (): Promise<void> => {
    if (!this.pc || !this.answerText()) {
      this.ManualWebrtcService.addLog('✗ Answer empty');
      alert('Please paste answer first');
      return;
    }
    try {
      const ans = JSON.parse(this.answerText());
      await this.pc.setRemoteDescription(ans);
      this.ManualWebrtcService.addLog('✓ Answer applied');
      console.log('Answer applied successfully');
    } catch (e) {
      this.ManualWebrtcService.addLog('✗ Error: ' + (e as any).message);
      console.error('Error parsing answer', e);
      alert('Error applying answer: ' + (e as any).message);
    }
  };
  // ------------------- ICE -------------------
  addRemoteIce = async (): Promise<void> => {
    if (!this.pc) {
      this.ManualWebrtcService.addLog('✗ PeerConnection not ready');
      alert('PC not ready');
      return;
    }
    const iceArray = this.remoteIceText(); // already an array
    if (!Array.isArray(iceArray) || iceArray.length === 0) {
      this.ManualWebrtcService.addLog('✗ ICE array is empty or invalid');
      alert('ICE array empty');
      return;
    }

    try {
      let count = 0;
      for (const item of iceArray) {
        if (!item) continue;
        const candidateObj = JSON.parse(item);
        await this.pc.addIceCandidate(candidateObj);
        console.log('ICE candidate added:', candidateObj);
        count++;
      }

      this.ManualWebrtcService.addLog(`✓ Added ${count} ICE candidate(s)`);
    } catch (e: any) {
      this.ManualWebrtcService.addLog('✗ Error: ' + e.message);
      console.error('Error parsing ICE', e);
      alert('Error adding ICE: ' + e.message);
    }
  };
  // ------------------- MESSAGES -------------------
  sendMessage = (): void => {
    const text = this.messageInput().trim();
    if (!text || !this.channel || this.channel.readyState !== 'open') {
      this.ManualWebrtcService.addLog('✗ Channel not ready');
      return;
    }
    this.channel.send(text);
    this.addMsg(text, true);
    this.ManualWebrtcService.addLog(
      `✓ Message sent: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`
    );
    this.messageInput.set('');
  };
  isScreenShareStarted = signal(false);
  // ------------------- SCREEN SHARE -------------------
  startScreenShare = async (): Promise<void> => {
    if (!this.pc) {
      this.ManualWebrtcService.addLog('✗ Peer connection not ready for screen share');
      return;
    }

    try {
      const stream = await (navigator.mediaDevices as MediaDevices).getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      this.pc.addTrack(track, stream);
      track.onended = () => {
        console.log('Screen sharing stopped via browser UI');
        this.stopScreenShare();
      };

      this.screenStream = stream;
      this.isScreenShareStarted.set(true);
      const videoEl = this.screenVideo.nativeElement;
      videoEl.srcObject = stream;
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;

      videoEl.onloadedmetadata = () => {
        videoEl.play().catch((err) => console.log('Video play error', err));
      };

      // const [videoTrack] = stream.getVideoTracks();
      // if (videoTrack && this.screenSender) {
      //   await this.screenSender.replaceTrack(videoTrack);
      // }
      // await this.renegotiateOverDataChannel();
      this.ManualWebrtcService.addLog('✓ Screen sharing started');

      // When the user stops sharing from the browser UI, clean up
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          this.stopScreenShare();
        });
      });
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        this.ManualWebrtcService.addLog('✗ Screen share permission denied');
      } else if (err?.name !== 'AbortError') {
        this.ManualWebrtcService.addLog('✗ Failed to start screen share');
        console.error('Screen share error:', err);
      }
    }
  };

  stopScreenShare(): void {
    if (!this.pc || !this.screenStream) return;
    this.screenStream.getTracks().forEach((t) => t.stop());
    if (this.screenSender) {
      this.screenSender.replaceTrack(null);
    }
    // Stop tracks (safe even if already stopped)

    // Remove from PeerConnection
    if (this.screenSender) {
      this.pc.removeTrack(this.screenSender);
      this.screenSender = null;
    }

    this.screenStream = null;
    this.ManualWebrtcService.addLog('✓ Screen sharing stopped');
  }
  copyOffer = (): void => {
    navigator.clipboard?.writeText(this.generdateSharedSecret).catch((e) => console.warn(e));
  };
  copyIce = (candidate: string): void => {
    navigator.clipboard?.writeText(candidate).catch((e) => console.warn(e));
  };
  copyAllIce = (): void => {
    const allCandidates = this.localIceCandidates().join('\n\n');
    navigator.clipboard?.writeText(allCandidates).catch((e) => console.warn(e));
  };
  private addMsg(text: string, me: boolean): void {
    const time = new Date().toLocaleTimeString();
    this.messages.update((arr) => [...arr, { text, me, time }]);
  }
}
