import { describe, expect, it } from 'vitest';
import { JournalFSM, STATES, TRANSITIONS, type Transition } from './fsm';

describe('JournalFSM', () => {
  it('starts OFFLINE', () => {
    expect(new JournalFSM().state).toBe('OFFLINE');
  });

  it('follows the happy path back to IDLE_MONITORING', () => {
    const fsm = new JournalFSM();
    const seen: Transition[] = [];
    fsm.subscribe((t) => seen.push(t));
    for (const e of ['START', 'WAKE', 'STOP', 'PARSED', 'CONFIRM', 'DONE'] as const) {
      expect(fsm.send(e)).toBe(true);
    }
    expect(fsm.state).toBe('IDLE_MONITORING');
    expect(seen.map((t) => t.to)).toEqual([
      'IDLE_MONITORING',
      'ACTIVE_RECORDING',
      'PROCESSING_TEXT',
      'CONFIRMATION',
      'SAVED',
      'IDLE_MONITORING',
    ]);
  });

  it('rejects invalid transitions without changing state', () => {
    const fsm = new JournalFSM();
    expect(fsm.send('WAKE')).toBe(false);
    fsm.send('START');
    expect(fsm.send('CONFIRM')).toBe(false);
    expect(fsm.send('DONE')).toBe(false);
    expect(fsm.state).toBe('IDLE_MONITORING');
  });

  it('cannot reach SAVED without passing CONFIRMATION', () => {
    for (const s of STATES) {
      const reachesSaved = Object.values(TRANSITIONS[s]).includes('SAVED');
      expect(reachesSaved).toBe(s === 'CONFIRMATION');
    }
  });

  it('supports cancel and force reset from recording', () => {
    const fsm = new JournalFSM();
    fsm.send('START');
    fsm.send('WAKE');
    expect(fsm.send('CANCEL')).toBe(true);
    expect(fsm.state).toBe('IDLE_MONITORING');
    fsm.send('WAKE');
    expect(fsm.send('RESET')).toBe(true);
    expect(fsm.state).toBe('IDLE_MONITORING');
  });
});
