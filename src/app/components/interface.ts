export interface RoomResponse {
  status: string;
  roomname: string;
  roomdata: RoomData;
}

export interface RoomData {
  OffererData: OffererData;
  AnswererData: AnswererData;
  DATE: string;
}

export interface OffererData {
  offer: RTCSessionDescriptionInit;
  ICEcandidate: IceCandidate[];
}

export interface AnswererData {
  answer: RTCSessionDescriptionInit;
  ICEcandidate: IceCandidate[];
}

export interface IceCandidate {
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
}
