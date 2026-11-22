import { useState, type FormEvent } from 'react';
import { controller } from '../core/controller';
import { useJournal } from '../hooks/useJournal';

const EXAMPLES = [
  'hey journal start note',
  'finish the lab report by friday at 5pm hashtag school priority high',
  'save note',
  'cancel note',
];

export function Simulator() {
  const { state } = useJournal();
  const [text, setText] = useState('');
  const disabled = state === 'OFFLINE';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    controller.simulate(text);
    setText('');
  };

  return (
    <section className="panel">
      <h2 className="mb-2 text-sm font-semibold text-slate-300">Simulate Voice Input</h2>
      <form onSubmit={submit} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-sky-600"
          placeholder={disabled ? 'Start the listener first' : 'Type what you would say…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
        />
        <button className="btn bg-sky-700 hover:bg-sky-600" disabled={disabled || !text.trim()}>
          Send
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            onClick={() => controller.simulate(ex)}
            disabled={disabled}
          >
            {ex}
          </button>
        ))}
      </div>
    </section>
  );
}
