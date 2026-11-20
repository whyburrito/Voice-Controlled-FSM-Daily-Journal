import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, exportJournal, importJournal, type Entry } from '../db/db';
import { parseEntry } from '../core/parser';

const PRIORITY_STYLE = {
  high: 'bg-red-900/70 text-red-200',
  medium: 'bg-amber-900/70 text-amber-200',
  low: 'bg-slate-700 text-slate-300',
} as const;

function EntryCard({ entry }: { entry: Entry }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.body);

  const save = async () => {
    const parsed = parseEntry(draft);
    await db.entries.update(entry.id, {
      body: parsed.body,
      tags: [...new Set([...entry.tags, ...parsed.tags])],
      priority: parsed.priority ?? entry.priority,
      dates: parsed.dates,
      times: parsed.times,
    });
    setEditing(false);
  };

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
        {entry.priority && (
          <span className={`rounded px-1.5 py-0.5 ${PRIORITY_STYLE[entry.priority]}`}>{entry.priority}</span>
        )}
        {entry.tags.length === 0 && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">uncategorized</span>}
        {entry.tags.map((t) => (
          <span key={t} className="rounded bg-sky-900/60 px-1.5 py-0.5 text-sky-200">
            #{t}
          </span>
        ))}
        {[...entry.dates, ...entry.times].map((d) => (
          <span key={d} className="rounded bg-violet-900/60 px-1.5 py-0.5 text-violet-200">
            {d}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          <button className="text-slate-500 hover:text-slate-200" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close' : 'Edit'}
          </button>
          <button className="text-slate-500 hover:text-red-300" onClick={() => void db.entries.delete(entry.id)}>
            Delete
          </button>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm outline-none focus:border-sky-600"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn self-end bg-sky-700 hover:bg-sky-600" onClick={() => void save()}>
            Save changes
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-100">{entry.body}</p>
      )}
    </li>
  );
}

export function EntryList() {
  const [filter, setFilter] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const entries = useLiveQuery(
    () =>
      (filter ? db.entries.where('tags').equals(filter) : db.entries.toCollection())
        .reverse()
        .sortBy('createdAt'),
    [filter],
  );
  const allTags = useLiveQuery(async () => {
    const keys = await db.entries.orderBy('tags').uniqueKeys();
    return keys.map(String);
  }, []);

  const download = async () => {
    const url = URL.createObjectURL(await exportJournal());
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file?: File) => {
    if (file) await importJournal(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-semibold text-slate-300">Entries</h2>
        <button
          className={`rounded px-2 py-0.5 text-xs ${filter === null ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
          onClick={() => setFilter(null)}
        >
          all
        </button>
        {allTags?.map((t) => (
          <button
            key={t}
            className={`rounded px-2 py-0.5 text-xs ${filter === t ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
            onClick={() => setFilter(t)}
          >
            #{t}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button className="btn bg-slate-800 hover:bg-slate-700" onClick={() => void download()}>
            Export
          </button>
          <button className="btn bg-slate-800 hover:bg-slate-700" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {entries?.length === 0 && <li className="text-sm text-slate-500">No entries yet.</li>}
        {entries?.map((e) => <EntryCard key={e.id} entry={e} />)}
      </ul>
    </section>
  );
}
