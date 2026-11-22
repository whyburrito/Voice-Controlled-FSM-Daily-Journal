import { describe, expect, it } from 'vitest';
import { CANCEL_RE, isValidEntry, parseEntry, STOP_RE, WAKE_RE } from './parser';

describe('control phrases', () => {
  it.each([
    'Hey Journal, start note',
    'hey general start note',
    'okay journal begin a new note',
    'journal start note',
    'hey journey start note',
    'hey journals star no',
    'hay jernal begin note',
    'Hey, Journal. Start note.',
  ])('wake matches "%s"', (s) => expect(WAKE_RE.test(s)).toBe(true));

  it.each(['hey journal', 'start note', 'I wrote in my journal yesterday'])('wake ignores "%s"', (s) =>
    expect(WAKE_RE.test(s)).toBe(false),
  );

  it('matches stop and cancel phrases', () => {
    expect(STOP_RE.test('okay save note')).toBe(true);
    expect(STOP_RE.test('Save the note.')).toBe(true);
    expect(CANCEL_RE.test('cancel note')).toBe(true);
    expect(CANCEL_RE.test('discard this note')).toBe(true);
  });
});

describe('parseEntry', () => {
  it('extracts spoken tag commands and hashtags', () => {
    const e = parseEntry('Study for the exam hashtag school tag as Review #urgent');
    expect(e.tags).toEqual(['school', 'review', 'urgent']);
    expect(e.body).toBe('Study for the exam');
    expect(parseEntry('Finish slides. Hashtag. School.').tags).toEqual(['school']);
  });

  it('extracts priority markers', () => {
    expect(parseEntry('call mom priority high').priority).toBe('high');
    expect(parseEntry('low priority clean desk').priority).toBe('low');
    expect(parseEntry('fix the bug mark it as urgent').priority).toBe('high');
    expect(parseEntry('just a thought').priority).toBeNull();
  });

  it('extracts dates and times while keeping them in the body', () => {
    const e = parseEntry('submit the report next friday at 5pm and review on March 3rd');
    expect(e.dates).toEqual(expect.arrayContaining(['next friday', 'march 3rd']));
    expect(e.times).toEqual(['5pm']);
    expect(e.body).toContain('next friday');
    expect(parseEntry('meet at 11.30pm').times).toEqual(['11.30pm']);
  });

  it('strips residual wake and stop phrases', () => {
    const e = parseEntry('hey journal start note buy milk save note');
    expect(e.body).toBe('Buy milk');
  });

  it('falls back to uncategorized raw text', () => {
    const e = parseEntry('remember the thing from the meeting');
    expect(e.tags).toEqual([]);
    expect(e.priority).toBeNull();
    expect(e.body).toBe('Remember the thing from the meeting');
  });

  it('rejects entries with no content', () => {
    expect(isValidEntry(parseEntry('hashtag school priority high'))).toBe(false);
    expect(isValidEntry(parseEntry('buy eggs'))).toBe(true);
  });
});
