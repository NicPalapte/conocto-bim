import { deviation, dimensionOf, type Dimension, type LvPosition } from '../model/lv';

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const percent = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
  style: 'percent',
});

export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return '-';
  return `${number.format(quantity)} ${unit ?? ''}`.trim();
}

const TOOL: Record<Dimension, string> = {
  length: 'Strecke messen',
  area: 'Flächen messen',
  volume: 'Volumen messen',
};

interface Props {
  position: LvPosition;
  /** Summe der Messungen in der Art der Einheit; `null`, wenn noch nichts gemessen ist. */
  measured: { sum: number; count: number } | null;
  /** Das passende Messwerkzeug ist gerade aktiv. */
  measuring: boolean;
  onMeasure: (dimension: Dimension) => void;
  onClose: () => void;
}

/** Gewählte LV-Position neben der Summe der Messungen am Modell. */
export function PositionCard({ position, measured, measuring, onMeasure, onClose }: Props) {
  const dimension = dimensionOf(position.unit);
  const target = position.quantity;
  const diff = measured && target !== null ? deviation(target, measured.sum) : null;
  return (
    <aside className="panel panel-right check-card float" aria-label="LV-Position">
      <div className="props-head">
        <div className="eyebrow-row">
          <span className="label">
            {['Position', position.section].filter(Boolean).join(' · ')}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Position schließen"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <h2>
          <span className="oz">{position.oz}</span> {position.shortText}
        </h2>
      </div>
      <div className="check-grid">
        <div className="k">LV</div>
        <div className="v">{formatQuantity(target, position.unit)}</div>
        {dimension && (
          <>
            <div className="k">Am Modell</div>
            <div className="v">
              {measured ? formatQuantity(measured.sum, position.unit) : '-'}
              {measured && (
                <span className="sub">
                  {' '}
                  aus {measured.count} {measured.count === 1 ? 'Messung' : 'Messungen'}
                </span>
              )}
            </div>
          </>
        )}
        {diff && (
          <>
            <div className="k">Differenz</div>
            <div className="v">
              {diff.diff > 0 ? '+' : ''}
              {formatQuantity(diff.diff, position.unit)}
              {target ? <span className="sub"> ({percent.format(diff.share)})</span> : null}
            </div>
          </>
        )}
      </div>
      <div className="check-foot">
        {dimension ? (
          <button
            type="button"
            className={`btn${measuring ? ' active' : ''}`}
            aria-pressed={measuring}
            onClick={() => onMeasure(dimension)}
          >
            {measuring ? 'Am Modell antippen …' : TOOL[dimension]}
          </button>
        ) : (
          <span className="sub">
            {position.unit
              ? `„${position.unit}“ lässt sich am Modell nicht messen.`
              : 'Position ohne Einheit.'}
          </span>
        )}
      </div>
      {position.longText && (
        <details className="longtext">
          <summary>Langtext</summary>
          <p>{position.longText}</p>
        </details>
      )}
    </aside>
  );
}
