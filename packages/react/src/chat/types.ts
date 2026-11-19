export interface ChatMessage {
  id: string;
  text: string;
  /** `me`: outgoing (right, blue); `them`: incoming (left, gray). */
  from: 'me' | 'them';
  /** Shows the timestamp header above it when it starts the conversation or follows an hour-long gap. */
  time?: Date;
  /** `delivered`: "Delivered" under the newest delivered outgoing message. */
  status?: 'sending' | 'delivered';
}

/** Field rect (window coordinates) the flying bubble starts from. */
export interface SendOrigin {
  right: number;
  top: number;
  width: number;
}
