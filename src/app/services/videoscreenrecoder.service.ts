/**
 * VideoScreenRecoderService
 *
 * Purpose
 * -------
 * This service composes a screen capture video element and an optional camera video
 * element onto an off-screen canvas and records that composition into a single
 * WebM file (Picture-in-Picture, PIP). It is intentionally separated from the
 * application's WebRTC responsibilities and does not directly manage peer
 * connections or stop user camera/screen streams unless explicitly requested.
 *
 * Key features
 * - Canvas-based composition (screen full, small camera overlay bottom-left)
 * - Optional audio support: by default the 'app' audio stream (from
 *   ManualWebrtcService.getAudioStreamValue()) is attached when available. You can
 *   opt-in to mix additional audio sources (screen/camera) via WebAudio.
 * - Signals and events designed for UI integration:
 *   - `isRecording` (signal): true while recording
 *   - `recordingReady` (signal): true when a final blob is available for download
 *   - `recordingStopped$` (Subject): emits the Blob or `undefined` when recording stops
 *
 * Important caveats
 * - Audio mixing uses the Web Audio API and may not be supported the same way across
 *   browsers (creating MediaStreamAudioSourceNode may throw in some contexts).
 * - The service is defensive about small/corrupt blobs (e.g., recording started before
 *   any video frames were rendered) and will treat very small blobs as failed recordings.
 *
 * Public API (short):
 * - startPipRecording(screenEl, camEl, opts) → Promise<void>
 * - stopPipRecording(stopUnderlyingStreams = false) → Promise<Blob>
 * - setScreenElement(el), setCameraElement(el)
 * - getLastRecordingBlob(), clearLastRecording()
 *
 * Usage example:
 * const s = inject(VideoScreenRecoderService);
 * await s.startPipRecording(screenEl, camEl, { fps: 30, audioSource: 'app' });
 * // ...later
 * const blob = await s.stopPipRecording();
 */
import { Injectable, signal } from '@angular/core';
import { ManualWebrtcService } from './manual-webrtc.service';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class VideoScreenRecoderService {
  isRecording = signal(false);

  private canvas?: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId?: number;
  private mediaRecorder?: MediaRecorder;
  private canvasStream?: MediaStream;
  private chunks: Blob[] = [];
  private stopResolve?: (b: Blob) => void;

  // audio mixing resources
  private audioCtx?: AudioContext;
  private mediaDest?: MediaStreamAudioDestinationNode;
  private audioSources: MediaStreamAudioSourceNode[] = [];
  private addedAudioTracks: MediaStreamTrack[] = [];

  // last recording blob + ready indicator (no auto-download)
  private lastRecordingBlob?: Blob;
  recordingReady = signal(false);

  // Notifies when recording stops and blob is available
  public recordingStopped$ = new Subject<Blob | undefined>();

  // elements that may change during recording
  private screenEl?: HTMLVideoElement;
  private camEl?: HTMLVideoElement;

  constructor(private manual: ManualWebrtcService) {}

  /**
   * Start PIP recording (screen full + small camera overlay).
   *
   * This method performs the following steps:
   * 1) (optionally) use provided `screenEl` and `camEl` or fallback to previously set
   *    elements via `setScreenElement()` / `setCameraElement()`.
   * 2) Create an off-screen canvas sized to the screen element and begin a draw loop
   *    (requestAnimationFrame) that composites the screen and camera frames.
   * 3) Optionally attach audio to the canvas capture stream according to `opts`.
   * 4) Create a MediaRecorder from the canvas stream and start recording.
   *
   * Options (opts):
   * - fps (number): frames-per-second for canvas capture (default 30).
   * - camPercent (number): fraction of canvas width used by the camera overlay (default 0.22).
   * - includeAudioMix (boolean): if true, uses WebAudio (AudioContext) to mix chosen audio
   *   sources (see `audioSource`) before attaching to the canvas stream. Mixing may fail
   *   silently on unsupported browsers.
   * - waitForFrame (boolean): if true, delay starting MediaRecorder until at least one
   *   canvas frame has been rendered (helps avoid tiny/corrupt output when start races with
   *   video availability).
   * - audioSource ('app'|'screen'|'none'|'mix'): which audio source to attach. Default: 'app'.
   *
   * Returns: Promise<void> that resolves after the recorder has been started.
   * Throws: Error if called while already recording or if no screen element is available.
   */
  async startPipRecording(
    screenEl?: HTMLVideoElement,
    camEl?: HTMLVideoElement,
    opts?: {
      fps?: number;
      camPercent?: number;
      includeAudioMix?: boolean;
      waitForFrame?: boolean;
      audioSource?: 'app' | 'screen' | 'none' | 'mix';
      scale?: number; // capture scale factor applied to canvas (>=1). Defaults to devicePixelRatio or 1
      videoBitsPerSecond?: number; // encoder video bitrate target (bps)
      audioBitsPerSecond?: number; // encoder audio bitrate target (bps)
    },
  ) {
    // NOTE: Defaults: no audio mixing, no frame-wait. Default audioSource is 'app' (separate audio stream).
    // You can improve visual fidelity by passing opts.scale (or the service will use devicePixelRatio).
    if (this.isRecording()) throw new Error('Already recording');

    // allow using previously set elements if not provided
    if (screenEl) this.setScreenElement(screenEl);
    if (camEl) this.setCameraElement(camEl);

    if (!this.screenEl) throw new Error('No screen video element available for recording');

    this.chunks = [];
    const fps = opts?.fps ?? 30;
    const camPercent = opts?.camPercent ?? 0.22;

    await Promise.all([
      this.waitForVideoReady(this.screenEl),
      this.camEl ? this.waitForVideoReady(this.camEl) : Promise.resolve(),
    ]);

    const displayWidth = this.screenEl!.videoWidth || 1280;
    const displayHeight = this.screenEl!.videoHeight || 720;

    // scale determines the recorded pixel resolution relative to the video's natural size
    const deviceScale = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const scale = Math.max(1, Math.floor(opts?.scale ?? deviceScale));

    const canvasWidth = Math.floor(displayWidth * scale);
    const canvasHeight = Math.floor(displayHeight * scale);

    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.ctx = this.canvas.getContext('2d');

    // For convenience in the draw loop we keep the logical 'width'/'height' values as canvas pixel size
    const width = canvasWidth;
    const height = canvasHeight;

    // track whether we actually rendered frames
    let framesRendered = 0;

    const draw = () => {
      if (!this.ctx || !this.screenEl) return;

      try {
        // draw the screen element stretched to the canvas pixel resolution
        this.ctx.drawImage(this.screenEl, 0, 0, width, height);
        framesRendered++;
      } catch (e) {
        // ignore transient draw errors, but do not count as a rendered frame
        console.debug('[recorder] drawImage error (screen)', e);
      }

      // draw camera overlay only when available and enabled
      if (this.camEl && this.camEl.videoWidth > 0) {
        const camW = Math.floor(width * camPercent);
        const camH = Math.floor((this.camEl.videoHeight / this.camEl.videoWidth) * camW);
        const x = 10;
        const y = height - camH - 10;

        this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
        this.ctx.fillRect(x - 4, y - 4, camW + 8, camH + 8);

        this.ctx.save();
        this.roundRect(this.ctx, x, y, camW, camH, 8);
        this.ctx.clip();

        try {
          this.ctx.drawImage(this.camEl, x, y, camW, camH);
        } catch (e) {
          console.debug('[recorder] drawImage error (cam)', e);
        }

        this.ctx.restore();

        this.ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        this.ctx.lineWidth = 3;
        this.roundRect(this.ctx, x, y, camW, camH, 8);
        this.ctx.stroke();
      }

      this.rafId = requestAnimationFrame(draw);
    };

    draw();

    // Optionally wait for at least 1 rendered frame before creating capture stream & recorder.
    if (opts?.waitForFrame) {
      const startTime = Date.now();
      await new Promise<void>((resolve) => {
        const check = () => {
          if (framesRendered > 0) return resolve();
          if (Date.now() - startTime > 1500) return resolve();
          setTimeout(check, 100);
        };
        check();
      });
    }

    this.canvasStream = this.canvas.captureStream(fps);

    // attach audio. Behavior controlled by opts.audioSource (default 'app') and opts.includeAudioMix.
    const audioSource = opts?.audioSource ?? 'app';

    if (opts?.includeAudioMix) {
      try {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.mediaDest = this.audioCtx.createMediaStreamDestination();
        this.audioSources = [];

        // helper to connect a stream if it has audio tracks
        const tryConnect = (src?: MediaStream) => {
          if (!src || src.getAudioTracks().length === 0) return;
          try {
            const srcNode = this.audioCtx!.createMediaStreamSource(src);
            srcNode.connect(this.mediaDest!);
            this.audioSources.push(srcNode);
          } catch (e) {
            // ignore, not all browsers allow creating source nodes for certain streams
            console.debug('[recorder] audio source attach failed', e);
          }
        };

        // choose which sources to mix
        if (audioSource === 'mix') {
          tryConnect(this.manual.getScreenrecordingStreamValue());
          tryConnect(this.manual.getCameraStreamValue());
          tryConnect(this.manual.getAudioStreamValue());
        } else if (audioSource === 'app') {
          tryConnect(this.manual.getAudioStreamValue());
        } else if (audioSource === 'screen') {
          tryConnect(this.manual.getScreenrecordingStreamValue());
        }

        // add mixed audio tracks to the canvas stream
        this.mediaDest.stream.getAudioTracks().forEach((t) => this.canvasStream!.addTrack(t));
      } catch (e) {
        console.debug('[recorder] audio mixing not available', e);
      }
    } else {
      // legacy/simple behavior: attach tracks directly from chosen audio source
      if (audioSource === 'app') {
        const appStream = this.manual.getAudioStreamValue();
        if (appStream && appStream.getAudioTracks().length > 0) {
          appStream.getAudioTracks().forEach((t) => {
            this.canvasStream!.addTrack(t);
            this.addedAudioTracks.push(t);
            console.debug('[recorder] attached app audio track to canvas');
          });
        } else {
          // If no audio yet, set a short retry (e.g., audio started after recording)
          let attempts = 0;
          const maxAttempts = 20; // retry up to ~10 seconds
          const id = window.setInterval(() => {
            attempts++;
            const s = this.manual.getAudioStreamValue();
            if (s && s.getAudioTracks().length > 0) {
              s.getAudioTracks().forEach((t) => {
                this.canvasStream!.addTrack(t);
                this.addedAudioTracks.push(t);
                console.debug('[recorder] attached app audio track to canvas (retry)');
              });
              window.clearInterval(id);
            } else if (attempts >= maxAttempts) {
              window.clearInterval(id);
            }
          }, 500);
        }
      } else if (audioSource === 'screen') {
        const screenStream = this.manual.getScreenrecordingStreamValue();
        if (screenStream && screenStream.getAudioTracks().length > 0) {
          screenStream.getAudioTracks().forEach((t) => {
            this.canvasStream!.addTrack(t);
            this.addedAudioTracks.push(t);
            console.debug('[recorder] attached screen audio track to canvas');
          });
        }
      }
    }

    // choose best supported mime type
    let mimeType = '';
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const c of candidates) {
      if ((<any>MediaRecorder).isTypeSupported && (<any>MediaRecorder).isTypeSupported(c)) {
        mimeType = c;
        break;
      }
    }

    const tryCreateMediaRecorder = (mt?: string) => {
      try {
        const recorderOpts: any = {};
        if (mt) recorderOpts.mimeType = mt;
        // allow specifying target bitrates (if the browser honors them)
        if (opts?.videoBitsPerSecond) recorderOpts.videoBitsPerSecond = opts.videoBitsPerSecond;
        if (opts?.audioBitsPerSecond) recorderOpts.audioBitsPerSecond = opts.audioBitsPerSecond;
        if (opts?.videoBitsPerSecond || opts?.audioBitsPerSecond)
          recorderOpts.bitsPerSecond =
            (opts.videoBitsPerSecond || 0) + (opts.audioBitsPerSecond || 0);
        return new MediaRecorder(this.canvasStream!, recorderOpts);
      } catch (e) {
        console.debug('[recorder] MediaRecorder creation failed for', mt, e);
        return undefined;
      }
    };

    this.mediaRecorder = tryCreateMediaRecorder(mimeType) || tryCreateMediaRecorder()!;

    this.mediaRecorder.ondataavailable = (ev) => {
      try {
        if (ev.data && ev.data.size) {
          this.chunks.push(ev.data);
          console.debug(
            '[recorder] chunk added size=',
            ev.data.size,
            'totalChunks=',
            this.chunks.length,
          );
        } else {
          console.debug('[recorder] empty chunk received');
        }
      } catch (e) {
        console.debug('[recorder] ondataavailable error', e);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType || 'video/webm' });
      console.debug(
        '[recorder] onstop chunks=',
        this.chunks.length,
        'blobSize=',
        blob.size,
        'mimeType=',
        mimeType,
      );

      // cleanup
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
      this.canvas = undefined;
      this.ctx = null;

      // stop / disconnect audio resources
      try {
        this.audioSources.forEach((s) => s.disconnect());
        this.audioSources = [];

        // remove any raw audio tracks we appended directly to canvasStream
        try {
          if (this.canvasStream) {
            this.addedAudioTracks.forEach((t) => {
              try {
                this.canvasStream!.removeTrack(t);
              } catch (e) {
                // ignore
              }
            });
          }
        } catch (e) {
          console.debug('[recorder] removing audio tracks failed', e);
        }
        this.addedAudioTracks = [];

        if (this.mediaDest) {
          this.mediaDest.disconnect();
          this.mediaDest = undefined;
        }
        if (this.audioCtx) {
          // close audio context (async)
          this.audioCtx.close().catch(() => {});
          this.audioCtx = undefined;
        }
      } catch (e) {
        console.debug('[recorder] audio cleanup error', e);
      }

      // do not automatically stop user's screen/camera streams here by default

      // validate blob size — treat very small files as corrupted
      const MIN_ACCEPTABLE_BYTES = 1024; // 1KB
      if (!blob || blob.size < MIN_ACCEPTABLE_BYTES) {
        console.warn('[recorder] produced blob is too small/corrupt, size=', blob.size);
        this.lastRecordingBlob = undefined;
        this.recordingReady.set(false);
        this.isRecording.set(false);
        // emit undefined to signal failure
        this.recordingStopped$.next(undefined);
        if (this.stopResolve) {
          this.stopResolve(new Blob());
          this.stopResolve = undefined;
        }
        return;
      }

      // store last recording and mark ready (no automatic download)
      this.lastRecordingBlob = blob;
      this.recordingReady.set(true);

      this.isRecording.set(false);

      // emit event
      this.recordingStopped$.next(blob);

      if (this.stopResolve) {
        this.stopResolve(blob);
        this.stopResolve = undefined;
      }
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);
  }

  /**
   * Stop recording and return the resulting Blob (resolves after MediaRecorder.onstop).
   *
   * If `stopUnderlyingStreams` is true this also attempts to stop the user's screen and
   * camera streams via ManualWebrtcService. The returned promise resolves to the final
   * Blob. If the recording produced a very small/corrupt blob the service will treat it
   * as a failure (the `recordingStopped$` will emit `undefined` and the promise resolves
   * to an empty Blob).
   */
  stopPipRecording(stopUnderlyingStreams = false): Promise<Blob> {
    // reset recording ready flag until new recording finishes
    this.recordingReady.set(false);

    // cleanup audio resources if nothing to stop
    const cleanupAudio = () => {
      try {
        this.audioSources.forEach((s) => s.disconnect());
        this.audioSources = [];
        if (this.mediaDest) {
          this.mediaDest.disconnect();
          this.mediaDest = undefined;
        }
        if (this.audioCtx) {
          this.audioCtx.close().catch(() => {});
          this.audioCtx = undefined;
        }
      } catch (e) {
        console.debug('[recorder] audio cleanup error', e);
      }
    };

    if (!this.mediaRecorder) {
      if (stopUnderlyingStreams) {
        try {
          this.manual.StopScreenRecordingStream();
          this.manual.CameraStreamclear();
        } catch (e) {}
      }
      cleanupAudio();
      this.isRecording.set(false);
      return Promise.resolve(new Blob());
    }

    if (this.mediaRecorder.state === 'inactive') {
      if (stopUnderlyingStreams) {
        try {
          this.manual.StopScreenRecordingStream();
          this.manual.CameraStreamclear();
        } catch (e) {}
      }
      cleanupAudio();
      return Promise.resolve(new Blob(this.chunks, { type: 'video/webm' }));
    }

    return new Promise<Blob>((resolve) => {
      this.stopResolve = (blob) => {
        if (stopUnderlyingStreams) {
          try {
            this.manual.StopScreenRecordingStream();
            this.manual.CameraStreamclear();
          } catch (e) {}
        }
        cleanupAudio();
        resolve(blob);
      };
      try {
        this.mediaRecorder!.stop();
      } catch (e) {
        // if stop throws, resolve with empty blob
        cleanupAudio();
        resolve(new Blob());
      }
    });
  }

  private waitForVideoReady(el: HTMLVideoElement) {
    return new Promise<void>((resolve) => {
      if (!el) return resolve();
      if (el.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return resolve();
      const onloaded = () => {
        el.removeEventListener('loadedmetadata', onloaded);
        el.removeEventListener('canplay', onloaded);
        resolve();
      };
      el.addEventListener('loadedmetadata', onloaded);
      el.addEventListener('canplay', onloaded);
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Set or clear the HTMLVideoElement used for the screen being recorded.
   */
  setScreenElement(el?: HTMLVideoElement | null) {
    this.screenEl = el ?? undefined;
    // if currently recording and size changed, update canvas size
    if (this.screenEl && this.canvas) {
      this.canvas.width = this.screenEl.videoWidth || this.canvas.width;
      this.canvas.height = this.screenEl.videoHeight || this.canvas.height;
    }
  }

  /**
   * Set or clear the HTMLVideoElement used for the camera overlay.
   * Also manages adding/removing camera audio track to the canvas stream when available.
   */
  setCameraElement(el?: HTMLVideoElement | null) {
    this.camEl = el ?? undefined;
    // camera element is used for overlay drawing only; audio is handled separately by the app

    // If a camera stream already exists, attach it to the element so local preview shows up immediately
    if (this.camEl) {
      const camStream = this.manual.getCameraStreamValue();
      console.debug(
        '[recorder] setCameraElement called, hasCameraStream=',
        !!(camStream && camStream.getVideoTracks().length),
      );
      if (camStream && camStream.getVideoTracks().length > 0) {
        try {
          if ((this.camEl.srcObject as MediaStream) !== camStream) {
            this.camEl.srcObject = camStream;
            this.camEl.muted = true;
            this.camEl.playsInline = true;
            // try to play; log result
            this.camEl
              .play()
              .then(() => {
                console.debug('[recorder] camera element playing');
              })
              .catch((err) => {
                console.debug('[recorder] camera play error', err);
              });
          }
        } catch (e) {
          console.debug('[recorder] attach camera stream error', e);
        }

        // if the camera's video track ends (user stopped camera), auto-clear the camera element
        camStream.getVideoTracks().forEach((t) => {
          t.onended = () => {
            // only clear if the element still references the same stream
            if (this.camEl && (this.camEl.srcObject as MediaStream) === camStream) {
              this.camEl = undefined;
            }
          };
        });
      } else {
        // no camera stream available yet; try attaching after a short delay in case it appears
        setTimeout(() => {
          const retryStream = this.manual.getCameraStreamValue();
          if (this.camEl && retryStream && retryStream.getVideoTracks().length > 0) {
            this.setCameraElement(this.camEl);
          }
        }, 500);
      }
    }
  }

  getLastRecordingBlob(): Blob | undefined {
    return this.lastRecordingBlob;
  }

  clearLastRecording() {
    this.lastRecordingBlob = undefined;
    this.recordingReady.set(false);
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
