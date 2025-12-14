import { Component, ElementRef, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MATERIAL_IMPORTS } from '../matimports';
import { ManualWebrtcService } from '../../services/manual-webrtc.service';
import { FlipDirective } from '../../directives/flip.directive';
import { RoomResponse } from '../interface';
type StoredRoom = { [roomId: string]: string };

@Component({
  selector: 'app-answer',
  standalone: true,
  imports: [CommonModule, FormsModule, ...MATERIAL_IMPORTS, FlipDirective],
  templateUrl: './answer.component.html',
  styleUrls: ['../main/main.component.scss'],
})
export class AnswerComponent implements OnInit {
  offerText = signal<any>(null);
  answerText = signal<any>(null);
  remoteIceText = signal('');
  localIceCandidates = signal<string[]>([]);
  messageInput = signal('');
  messages = signal<any[]>([]);
  sendBtn = signal(false);
  private iceTimer: any;
  useServerToggle = signal(true);
  private screenStream: MediaStream | null = null;
  private screenSender: RTCRtpSender | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private remoteStream: MediaStream | null = null;
  private roomname = signal('');
  chathidden = true;
  isScreenShareStarted = signal(false);
  @ViewChild('screenVideo') screenVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('screenVideo') screenVideoReciver!: ElementRef<HTMLVideoElement>;
  openchat() {
    this.chathidden = !this.chathidden;
  }

  constructor(private readonly ManualWebrtcService: ManualWebrtcService) {}
  @ViewChild('userid', { static: false }) userid!: ElementRef;
  @ViewChild('password', { static: false }) password!: ElementRef;
  rooms = signal<StoredRoom[]>([]);
  get wslUrl() {
    return this.ManualWebrtcService.wslUrl;
  }
  ngOnInit(): void {
    this.ManualWebrtcService.loadSavedRooms(this.rooms);
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:relay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
        {
          urls: 'turn:relay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    });

    this.pc!.ondatachannel = (event) => {
      this.channel = event.channel;
      this.setupDataChannel(this.channel);
    };

    this.pc!.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      this.remoteStream.addTrack(event.track);
      if (this.screenVideo?.nativeElement) {
        this.screenVideo.nativeElement.srcObject = event.streams[0];
      }
    };

    this.pc!.onicecandidate = (e) => {
      if (e.candidate) {
        this.localIceCandidates.update((candidates) => [
          ...candidates,
          JSON.stringify(e.candidate, null, 2),
        ]);
        clearTimeout(this.iceTimer);
        this.iceTimer = setTimeout(() => {
          this.afterIceCandidatesCreation();
        }, 2000);
      }
    };
    this.pc.onnegotiationneeded = async () => {
      try {
        const offer = await this.pc!.createOffer();
        await this.pc!.setLocalDescription(offer);
        this.channel!.send(
          JSON.stringify({
            type: 'negotiation-answer-offer',
            sdp: this.pc!.localDescription,
          })
        );
      } catch (err) {
        console.error('negotiation send failed:', err);
      }
    };
  }
  startScreenShare = async (): Promise<void> => {
    if (!this.pc) {
      this.ManualWebrtcService.addLog('✗ Peer connection not ready for screen share');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      this.screenStream = stream;
      this.isScreenShareStarted.set(true);
      const videoEl = this.screenVideo.nativeElement;
      videoEl.srcObject = stream;
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.onloadedmetadata = () => videoEl.play().catch(() => {});
      this.pc.addTrack(stream.getVideoTracks()[0], stream);
      stream
        .getVideoTracks()
        .forEach((track) => track.addEventListener('ended', () => this.stopScreenShare()));

      this.ManualWebrtcService.addLog('✓ Screen sharing started');
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        this.ManualWebrtcService.addLog('✗ Screen share permission denied');
      } else if (err?.name !== 'AbortError') {
        this.ManualWebrtcService.addLog('✗ Failed to start screen share');
        console.error('Screen share error:', err);
      }
    }
  };
  connectToExistingConnection = async (
    fromStorage = false,
    roomid?: string,
    roomSecret?: string,
    event?: Event
  ) => {
    if (fromStorage && event) {
      event.preventDefault();
      this.userid.nativeElement.value = roomid + '$' + roomSecret;
    }
    const userid = this.userid.nativeElement.value.trim();
    if (!(userid === '')) {
      const result = await this.fetchOffer(userid);
      this.offerText.set(result.data.roomdata.OffererData.offer);
      this.roomname.set(userid);
      this.createAnswer().then((val) => {
        this.ManualWebrtcService.addLog('✗ Offer Added');
      });
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
  afterIceCandidatesCreation() {
    this.applyAnswer(this.roomname(), this.answerText(), this.localIceCandidates());
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

  stopScreenShare(): void {
    if (!this.pc || !this.screenStream) return;

    // Stop all local screen tracks
    this.screenStream.getTracks().forEach((t) => t.stop());

    // Clear the video track but keep the transceiver
    if (this.screenSender) {
      this.screenSender.replaceTrack(null);
    }

    this.screenStream = null;
    this.ManualWebrtcService.addLog('✓ Screen sharing stopped');
  }

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

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log('Channel open!');
      this.sendBtn.set(true);
      const payload = {
        type: 'connection-established',
        reconnectionSecret: this.roomname() + '$' + this.generateReconnectionSecret(),
      };
      setTimeout(() => {
        if (this.screenVideo?.nativeElement && this.remoteStream) {
          this.screenVideo.nativeElement.srcObject = this.remoteStream;
        }
      }, 2000);

      this.safeSend(channel, payload);
    };

    channel.onmessage = async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'negotiation-offer-answer') {
        try {
          await this.pc!.setRemoteDescription(msg.sdp);
        } catch (err) {
          console.error('Answerer failed to apply renegotiation answer:', err);
        }
      }
      if (msg.type === 'negotiation-main-offer') {
        await this.pc!.setRemoteDescription(msg.sdp);
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.channel!.send(
          JSON.stringify({
            type: 'negotiation-answer-answer',
            sdp: this.pc!.localDescription,
          })
        );
      }

      this.addMsg(e.data, false);
    };

    channel.onclose = () => {
      console.log('Channel closed!');
      this.sendBtn.set(false);
    };
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
  private generateReconnectionSecret(): string {
    return crypto
      .getRandomValues(new Uint8Array(32))
      .reduce((acc, val) => acc + val.toString(16).padStart(2, '0'), '');
  }
  logs() {
    return this.ManualWebrtcService.getLogs()();
  }
  ///asset
  copyAnswer = (): void => {
    navigator.clipboard?.writeText(this.answerText()).catch((e) => console.warn(e));
  };

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

  private addMsg(text: string, me: boolean): void {
    const time = new Date().toLocaleTimeString();
    this.messages.update((arr) => [...arr, { text, me, time }]);
  }
}
