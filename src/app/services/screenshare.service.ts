import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ScreenShareService {
  private stream: MediaStream | null = null;

  // A callback that your component will register
  private onTrackReady: ((track: MediaStreamTrack) => void) | null = null;

  constructor() {}

  /**
   * Component calls this once:
   * this.screenShareService.registerSenderCallback(track => this.screenSender.replaceTrack(track));
   */
  registerSenderCallback(cb: (track: MediaStreamTrack) => void) {
    this.onTrackReady = cb;
  }

  /**
   * Start screen sharing and replace the RTCPeerConnection track
   */
  async start(): Promise<void> {
    if (this.stream) {
      console.warn('Screen already being shared');
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });

      const videoTrack = this.stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('No video track received');

      // If callback registered, replace track in RTCPeerConnection
      if (this.onTrackReady) {
        this.onTrackReady(videoTrack);
      }

      // Stop sharing when user presses "Stop Sharing" in Chrome popup
      videoTrack.onended = () => {
        this.stop();
      };
    } catch (err) {
      this.stream = null;
      throw err;
    }
  }

  /**
   * Stop screen share and cleanup
   */
  stop(): void {
    if (!this.stream) return;

    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /**
   * Get the active screen stream if needed
   */
  getStream(): MediaStream | null {
    return this.stream;
  }
}
