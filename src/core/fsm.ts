export const STATES = [
  'OFFLINE',
  'IDLE_MONITORING',
  'ACTIVE_RECORDING',
  'PROCESSING_TEXT',
  'CONFIRMATION',
  'SAVED',
] as const;

export type State = (typeof STATES)[number];

export type FsmEvent =
  | 'START'
  | 'WAKE'
  | 'STOP'
  | 'SILENCE'
  | 'CANCEL'
  | 'PARSED'
  | 'INVALID'
  | 'CONFIRM'
  | 'REJECT'
  | 'DONE'
  | 'RESET'
  | 'SHUTDOWN';

export interface Transition {
  at: number;
  from: State;
  to: State;
  event: FsmEvent;
}

// Transition function δ: State × Event → State
export const TRANSITIONS: Record<State, Partial<Record<FsmEvent, State>>> = {
  OFFLINE: { START: 'IDLE_MONITORING' },
  IDLE_MONITORING: { WAKE: 'ACTIVE_RECORDING', SHUTDOWN: 'OFFLINE' },
  ACTIVE_RECORDING: {
    STOP: 'PROCESSING_TEXT',
    SILENCE: 'PROCESSING_TEXT',
    CANCEL: 'IDLE_MONITORING',
    RESET: 'IDLE_MONITORING',
    SHUTDOWN: 'OFFLINE',
  },
  PROCESSING_TEXT: {
    PARSED: 'CONFIRMATION',
    INVALID: 'IDLE_MONITORING',
    RESET: 'IDLE_MONITORING',
    SHUTDOWN: 'OFFLINE',
  },
  CONFIRMATION: {
    CONFIRM: 'SAVED',
    REJECT: 'IDLE_MONITORING',
    RESET: 'IDLE_MONITORING',
    SHUTDOWN: 'OFFLINE',
  },
  SAVED: { DONE: 'IDLE_MONITORING', RESET: 'IDLE_MONITORING', SHUTDOWN: 'OFFLINE' },
};

type Listener = (t: Transition) => void;

export class JournalFSM {
  private current: State = 'OFFLINE';
  private listeners = new Set<Listener>();

  get state(): State {
    return this.current;
  }

  can(event: FsmEvent): boolean {
    return TRANSITIONS[this.current][event] !== undefined;
  }

  send(event: FsmEvent): boolean {
    const next = TRANSITIONS[this.current][event];
    if (!next) return false;
    const t: Transition = { at: Date.now(), from: this.current, to: next, event };
    this.current = next;
    this.listeners.forEach((fn) => fn(t));
    return true;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
