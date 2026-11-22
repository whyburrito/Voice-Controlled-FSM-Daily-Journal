import { CANCEL_RE, STOP_RE, WAKE_RE } from './parser';

const IDLE_TAIL_CHARS = 40;

export interface NoteRead {
  text: string;
  stopped: boolean;
  cancelled: boolean;
}

export class TranscriptCursor {
  private final = '';
  private interim = '';
  private anchor = 0;
  private carry = '';
  private idleCarry = '';

  update(final: string, interim: string): void {
    this.final = this.idleCarry ? `${this.idleCarry} ${final}` : final;
    this.interim = interim;
    const total = this.final.length + this.interim.length;
    if (this.anchor > total) this.anchor = this.final.length;
  }

  detectWake(): boolean {
    if (WAKE_RE.test(this.region())) return true;
    if (!this.interim) this.trimIdle();
    return false;
  }

  peekIdle(): string {
    return this.region().trim();
  }

  readNote(): NoteRead {
    const note = this.noteText();
    if (CANCEL_RE.test(note)) return { text: '', stopped: false, cancelled: true };
    const stop = STOP_RE.exec(note);
    if (stop) return { text: note.slice(0, stop.index).trim(), stopped: true, cancelled: false };
    return { text: note, stopped: false, cancelled: false };
  }

  release(): void {
    this.carry = '';
    this.idleCarry = '';
    this.anchor = (this.final + this.interim).length;
  }

  restart(keepNote: boolean): void {
    const tail = !keepNote ? this.region().slice(-IDLE_TAIL_CHARS).trim() : '';
    this.carry = keepNote ? this.noteText() : '';
    this.idleCarry = tail;
    this.final = tail ? `${tail} ` : '';
    this.interim = '';
    this.anchor = 0;
  }

  private trimIdle(): void {
    const cut = this.final.length - IDLE_TAIL_CHARS;
    if (cut <= this.anchor) return;
    const space = this.final.indexOf(' ', cut);
    this.anchor = space === -1 ? this.final.length : space + 1;
  }

  private region(): string {
    return (this.final + this.interim).slice(this.anchor);
  }

  private noteText(): string {
    const region = this.region();
    if (this.carry) return `${this.carry} ${region}`.replace(/\s+/g, ' ').trim();
    const wake = WAKE_RE.exec(region);
    return (wake ? region.slice(wake.index + wake[0].length) : region).replace(/^[\s,.!?;:]+/, '').trim();
  }
}
