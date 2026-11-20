import { describe, expect, it } from 'vitest';
import { TranscriptCursor } from './cursor';

describe('TranscriptCursor', () => {
  it('discards idle speech once it is final', () => {
    const c = new TranscriptCursor();
    c.update('I am talking about my journal ', '');
    expect(c.detectWake()).toBe(false);
    c.update('I am talking about my journal hey journal start note ', '');
    expect(c.detectWake()).toBe(true);
    expect(c.readNote().text).toBe('');
  });

  it('detects wake from interim results and reads the note after it', () => {
    const c = new TranscriptCursor();
    c.update('', 'hey journal start note buy');
    expect(c.detectWake()).toBe(true);
    c.update('Hey Journal, start note. ', 'buy milk tomorrow');
    expect(c.readNote()).toEqual({ text: 'buy milk tomorrow', stopped: false, cancelled: false });
  });

  it('stops on the stop phrase and does not re-trigger wake afterwards', () => {
    const c = new TranscriptCursor();
    c.update('', 'hey journal start note buy milk save note');
    expect(c.detectWake()).toBe(true);
    const note = c.readNote();
    expect(note).toEqual({ text: 'buy milk', stopped: true, cancelled: false });
    c.release();
    expect(c.detectWake()).toBe(false);
    c.update('hey journal start note buy milk save note ', '');
    expect(c.detectWake()).toBe(false);
  });

  it('detects a wake phrase split across two final results', () => {
    const c = new TranscriptCursor();
    c.update('hey journal ', '');
    expect(c.detectWake()).toBe(false);
    c.update('hey journal start note ', '');
    expect(c.detectWake()).toBe(true);
  });

  it('detects cancel', () => {
    const c = new TranscriptCursor();
    c.update('hey journal start note never mind cancel note ', '');
    c.detectWake();
    expect(c.readNote().cancelled).toBe(true);
  });

  it('keeps the note across recognizer restarts', () => {
    const c = new TranscriptCursor();
    c.update('hey journal start note first part ', '');
    c.detectWake();
    c.restart(true);
    c.update('second part ', '');
    expect(c.readNote().text).toBe('first part second part');
  });

  it('keeps idle tail across recognizer restarts so split wake phrases still trigger', () => {
    const c = new TranscriptCursor();
    c.update('hey journal ', '');
    expect(c.detectWake()).toBe(false);
    c.restart(false);
    c.update('start note buy tea ', '');
    expect(c.detectWake()).toBe(true);
    expect(c.readNote().text).toBe('buy tea');
  });

  it('triggers wake when a new phrase arrives after releasing with non-empty interim', () => {
    const c = new TranscriptCursor();
    c.update('', 'hey journal start note buy milk save note');
    expect(c.detectWake()).toBe(true);
    expect(c.readNote().stopped).toBe(true);
    c.release();
    c.update('hey journal start note buy milk save note ', 'hey journal start note');
    expect(c.detectWake()).toBe(true);
  });
});
