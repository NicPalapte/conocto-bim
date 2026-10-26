import type { ElementProps, PropRow } from '../model/properties';
import { className, type Placement } from '../model/tree';

export interface GroupInfo {
  category: string;
  label: string;
  count: number;
}

interface Props {
  modelName: string;
  element: ElementProps | null;
  group: GroupInfo | null;
  placement: Placement;
  loading: boolean;
  onClose: () => void;
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`prop${wide ? ' wide' : ''}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function Rows({ rows }: { rows: PropRow[] }) {
  return (
    <div className="prop-grid">
      {rows.map((r, i) => (
        <Field key={`${r.label}-${i}`} label={r.label} value={r.value} wide={r.value.length > 28} />
      ))}
    </div>
  );
}

export function PropertiesPanel({ modelName, element, group, placement, loading, onClose }: Props) {
  const category = element?.category ?? group?.category ?? '';
  const eyebrow = [className(category), placement.part?.label].filter(Boolean).join(' · ');
  const title = element?.name ?? group?.label ?? '…';
  return (
    <aside className="panel panel-right float" aria-label="Eigenschaften">
      <div className="props-head">
        <div className="eyebrow-row">
          <span className="label">{eyebrow}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Auswahl aufheben"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <h2>{title}</h2>
        <div className="sub">
          {modelName}
          {element ? ` · GUID ${element.guid}` : ''}
          {group ? ` · ${group.count.toLocaleString('de-DE')} Bauteile` : ''}
        </div>
      </div>
      <div className="scroll">
        {loading && <div className="block meta">Eigenschaften werden gelesen …</div>}
        {element && !loading && (
          <>
            <div className="block">
              <div className="block-head">
                <span className="label">Bauteil</span>
              </div>
              <div className="prop-grid">
                {placement.facility && <Field label="Bauwerk" value={placement.facility.label} />}
                {placement.part && <Field label="Teil" value={placement.part.label} />}
                {element.type && <Field label="Typ" value={element.type} />}
                {element.material && <Field label="Material" value={element.material} />}
                {element.container && element.container !== placement.part?.label && (
                  <Field label="Enthalten in" value={element.container} />
                )}
                {element.basics.map((r) => (
                  <Field key={r.label} label={r.label} value={r.value} wide={r.value.length > 28} />
                ))}
              </div>
            </div>
            {element.groups.map((g, i) => (
              <details
                key={`${g.title}-${i}`}
                className="block"
                open={g.kind === 'quantities' || i < 3}
              >
                <summary className="block-head">
                  <span className="label">
                    {g.kind === 'quantities' ? 'Mengen' : 'Eigenschaften'}
                  </span>
                  <span className="right">{g.title}</span>
                </summary>
                {g.rows.length ? <Rows rows={g.rows} /> : <div className="meta">leer</div>}
              </details>
            ))}
            {element.groups.length === 0 && (
              <div className="block meta">Keine Property-Sets oder Mengen im Modell.</div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
