import type { Person } from '../types';

/** Chooses whose IRAs a lever applies to. Renders nothing for a single client. */
export function PersonPicker({ people, value, onChange, label }: { people: Person[]; value: string; onChange: (id: string) => void; label: string }) {
  if (people.length < 2) return null;
  return (
    <div className="seg w-full" role="group" aria-label={label}>
      {people.map((p) => (
        <button key={p.id} type="button" className="seg-btn flex-1" aria-pressed={value === p.id} onClick={() => onChange(p.id)}>
          {p.label}’s IRAs
        </button>
      ))}
    </div>
  );
}
