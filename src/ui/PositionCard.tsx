import type { ReactNode } from 'react';
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
  /**
   * Menge am Modell: aus der Mengenregel (Bauteile) oder, ohne Regel, Summe der freien
   * Messungen in der Art der Einheit; `null`, wenn es noch nichts gibt.
   */
  measured: { sum: number; count: number; from: 'rule' | 'measure' } | null;
  /** Mengenregel der Position; ohne Regel der Knopf zum Anlegen. */
  rule: ReactNode | null;
  onCreateRule: () => void;
  /** Das passende Messwerkzeug ist gerade aktiv. */
  measuring: boolean;
  onMeasure: (dimension: Dimension) => void;
  onClose: () => void;
}

/** Gewählte LV-Position neben der Summe der Messungen am Modell. */
export function PositionCard(props: Props) {
  const { position, measured, measuring, rule, onCreateRule, onMeasure, onClose } = props;
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
        {(dimension || measured) && (
          <>
            <div className="k">Am Modell</div>
            <div className="v">
              {measured ? formatQuantity(measured.sum, position.unit) : '-'}
              {measured && (
                <span className="sub">
                  {' '}
                  aus {measured.count}{' '}
                  {measured.from === 'rule'
                    ? measured.count === 1
                      ? 'Bauteil'
                      : 'Bauteilen'
                    : measured.count === 1
                      ? 'Messung'
                      : 'Messungen'}
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
      {rule}
      <div className="check-foot">
        {!rule && (
          <button type="button" className="btn btn-primary" onClick={onCreateRule}>
            Bauteile zuordnen
          </button>
        )}
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
          !rule && <span className="sub">{position.unit ? '' : 'Position ohne Einheit.'}</span>
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
