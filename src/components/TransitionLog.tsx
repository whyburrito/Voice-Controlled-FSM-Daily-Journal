import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function TransitionLog() {
  const logs = useLiveQuery(() => db.transitions.orderBy('at').reverse().limit(40).toArray(), []) ?? [];

  return (
    <section className="panel">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">FSM Transition Log</h2>
        <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => void db.transitions.clear()}>
          Clear
        </button>
      </div>
      <ul className="max-h-80 space-y-1 overflow-y-auto font-mono text-xs">
        {logs.length === 0 && <li className="text-slate-500">No transitions yet.</li>}
        {logs.map((t) => (
          <li key={t.id} className="text-slate-400">
            <span className="text-slate-600">{new Date(t.at).toLocaleTimeString()}</span> {t.from} →{' '}
            <span className="text-slate-200">{t.to}</span> <span className="text-sky-400">[{t.event}]</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
