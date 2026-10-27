import type { Vec3 } from '../model/bounds';

export type MeasureMode = 'point' | 'distance' | 'area' | 'volume';

export interface Measurement {
  id: string;
  kind: MeasureMode;
  /** Szenen-Punkt, an dem das Etikett hängt. */
  anchor: Vec3;
  lines: string[];
  /** Messwert in m² bzw. m³ für die Summe. */
  value?: number;
}

interface Props {
  measurements: Measurement[];
  project: (p: Vec3) => { x: number; y: number; visible: boolean };
  onRemove: (id: string) => void;
}

/** Etiketten der Messungen; folgen der Kamera (Neuzeichnen bei jeder Bewegung). */
export function MeasureLabels({ measurements, project, onRemove }: Props) {
  return (
    <>
      {measurements.map((m) => {
        const at = project(m.anchor);
        if (!at.visible) return null;
        return (
          <div
            key={m.id}
            className={`measure-label kind-${m.kind}`}
            style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
          >
            <div className="values">
              {m.lines.map((line, i) => (
                <div key={i} className={i === 0 ? 'main' : 'sub'}>
                  {line}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Messung entfernen"
              onClick={() => onRemove(m.id)}
            >
              ✕
            </button>
          </div>
        );
      })}
    </>
  );
}
