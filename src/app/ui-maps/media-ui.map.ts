import { MediaState } from '../models/media-state.model';

export const MEDIA_STATE_ICON_MAP: Record<MediaState, string> = {
  [MediaState.Idle]: 'MicOff',
  [MediaState.Starting]: 'Hourglass',
  [MediaState.InProgress]: 'Mic',
  [MediaState.Stopped]: 'MicOff',
  [MediaState.Failed]: 'Error',
};

export const MEDIA_STATE_LABEL_MAP: Record<MediaState, string> = {
  [MediaState.Idle]: 'Microphone off',
  [MediaState.Starting]: 'Starting microphone',
  [MediaState.InProgress]: 'Microphone on',
  [MediaState.Stopped]: 'Microphone stopped',
  [MediaState.Failed]: 'Microphone error',
};
