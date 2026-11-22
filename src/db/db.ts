import Dexie, { type EntityTable } from 'dexie';
import type { ParsedEntry } from '../core/parser';
import type { Transition } from '../core/fsm';

export interface Entry extends ParsedEntry {
  id: number;
  createdAt: number;
}

export interface TransitionLog extends Transition {
  id: number;
}

export const db = new Dexie('voice-journal') as Dexie & {
  entries: EntityTable<Entry, 'id'>;
  transitions: EntityTable<TransitionLog, 'id'>;
};

db.version(1).stores({
  entries: '++id, createdAt, priority, *tags',
  transitions: '++id, at',
});

export async function exportJournal(): Promise<Blob> {
  const [entries, transitions] = await Promise.all([db.entries.toArray(), db.transitions.toArray()]);
  return new Blob([JSON.stringify({ version: 1, entries, transitions }, null, 2)], {
    type: 'application/json',
  });
}

export async function importJournal(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as { entries?: Entry[] };
  const entries = (data.entries ?? []).map(({ id: _id, ...rest }) => rest);
  await db.entries.bulkAdd(entries);
  return entries.length;
}
