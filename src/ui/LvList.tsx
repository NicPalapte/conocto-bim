import { useMemo, useState } from 'react';
import { matchPositions, type LoadedLv } from '../model/lv';
import { formatQuantity } from './PositionCard';

// Mehr Zeilen bremsen bei LVs mit Tausenden Positionen; die Suche grenzt ein.
const MAX_ROWS = 300;

interface Props {
  lv: LoadedLv;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: () => void;
}

/** Positionsliste des geladenen LV mit eigener Suche (OZ, Kurztext). */
export function LvList({ lv, selectedId, onSelect, onRemove }: Props) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => matchPositions(lv.positions, query), [lv, query]);
  const shown = matches.slice(0, MAX_ROWS);
  return (
    <section className="section" aria-label="Leistungsverzeichnis">
      <div className="panel-head">
        <div className="section-title">
          <span className="label">LV</span>
          <span className="name" title={lv.name}>
            {lv.projectName ?? lv.name}
          </span>
          <button type="button" className="icon-btn" aria-label="LV schließen" onClick={onRemove}>
            ✕
          </button>
        </div>
        <input
          className="search"
          type="search"
          placeholder="OZ oder Kurztext"
          aria-label="Position suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="scroll" role="list">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            role="listitem"
            className={`lv-row${p.id === selectedId ? ' selected' : ''}`}
            onClick={() => onSelect(p.id)}
            title={p.shortText}
          >
            <span className="oz">{p.oz}</span>
            <span className="text">{p.shortText}</span>
            <span className="qty">{formatQuantity(p.quantity, p.unit)}</span>
          </button>
        ))}
        {matches.length > MAX_ROWS && (
          <div className="lv-more">
            {(matches.length - MAX_ROWS).toLocaleString('de-DE')} weitere – Suche eingrenzen
          </div>
        )}
        {matches.length === 0 && <div className="lv-more">Keine Position gefunden</div>}
      </div>
    </section>
  );
}
