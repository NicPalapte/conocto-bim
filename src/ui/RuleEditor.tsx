import { useMemo, useState } from 'react';
import type { FactValue } from '../model/properties';
import {
  AXES,
  criterionFrom,
  extentCriterion,
  members,
  type Axis,
  type Criterion,
  type ElementFacts,
  type Rule,
  type Takeoff,
  type TakeoffResult,
} from '../model/takeoff';
import { className } from '../model/tree';
import { formatQuantity } from './PositionCard';

const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
// Mehr Zeilen helfen beim Durchsehen nicht; die Summe zählt alle.
const MAX_ROWS = 200;

interface Props {
  rule: Rule;
  unit: string | null;
  categories: { category: string; count: number }[];
  /** Alle bekannten Bauteile der gewählten Klasse und die von Hand dazugenommenen. */
  candidates: ElementFacts[];
  loading: boolean;
  result: TakeoffResult;
  picking: boolean;
  onChange: (rule: Rule) => void;
  onPicking: (on: boolean) => void;
  onFocus: (element: ElementFacts) => void;
  onRemove: () => void;
}

/** Schlüssel für Kriterium und Ansatz: Maße entlang der Achsen oder Merkmal aus dem Modell. */
type FactKey = { kind: 'extent'; axis: Axis } | { kind: 'value'; key: string };

const keyId = (k: FactKey) => (k.kind === 'extent' ? `extent:${k.axis}` : `value:${k.key}`);
const axisLabel = (axis: Axis) => `Länge entlang Bauteil-${axis.toUpperCase()}`;

function describe(c: Criterion): string {
  switch (c.kind) {
    case 'value':
      return `${shortKey(c.key)} = ${c.equals}`;
    case 'range':
      return `${shortKey(c.key)} ${number.format(c.from)} bis ${number.format(c.to)}`;
    case 'extent':
      return `${axisLabel(c.axis)} ${number.format(c.from)} bis ${number.format(c.to)} m`;
    case 'name':
      return `Name enthält „${c.contains}“`;
  }
}

/** „Pset_PileCommon · Diameter“ → „Diameter“; das Set steht im Tooltip. */
function shortKey(key: string): string {
  return key.split(' · ').at(-1) ?? key;
}

function valueOf(e: ElementFacts, k: FactKey): FactValue | undefined {
  return k.kind === 'extent' ? e.extents[k.axis] : e.values[k.key];
}

/** Gleiche Werte zusammenfassen; Zahlen auf cm bzw. 3 Stellen gerundet. */
function distinct(elements: ElementFacts[], k: FactKey): { value: FactValue; count: number }[] {
  const counts = new Map<string, { value: FactValue; count: number }>();
  for (const e of elements) {
    const v = valueOf(e, k);
    if (v === undefined || v === '') continue;
    const value = typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
    const id = String(value);
    const entry = counts.get(id) ?? { value, count: 0 };
    entry.count += 1;
    counts.set(id, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 30);
}

const show = (v: FactValue) => (typeof v === 'number' ? number.format(v) : v);

/** Auswahlgruppe und Messansatz einer Position bearbeiten, Ergebnis je Bauteil. */
export function RuleEditor(props: Props) {
  const { rule, unit, categories, candidates, loading, result, picking } = props;
  const { onChange, onPicking, onFocus, onRemove } = props;
  const [keyChoice, setKeyChoice] = useState('');
  const group = rule.group;
  const current = useMemo(() => members(candidates, group), [candidates, group]);

  // Merkmale, die in der aktuellen Gruppe vorkommen: Maße immer, Werte aus dem Modell.
  const keys = useMemo(() => {
    const valueKeys = new Set<string>();
    for (const e of current) for (const k of Object.keys(e.values)) valueKeys.add(k);
    return [
      ...AXES.map((axis): FactKey => ({ kind: 'extent', axis })),
      ...[...valueKeys].sort().map((key): FactKey => ({ kind: 'value', key })),
    ];
  }, [current]);
  const chosen = keys.find((k) => keyId(k) === keyChoice) ?? null;
  const values = chosen ? distinct(current, chosen) : [];
  const numericKeys = keys.filter(
    (k) => k.kind === 'value' && current.some((e) => typeof e.values[k.key] === 'number'),
  );

  const setGroup = (patch: Partial<Rule['group']>) =>
    onChange({ ...rule, group: { ...group, ...patch } });
  const addCriterion = (value: FactValue) => {
    if (!chosen) return;
    const c =
      chosen.kind === 'extent'
        ? extentCriterion(chosen.axis, Number(value))
        : criterionFrom(chosen.key, value);
    setGroup({ where: [...group.where, c] });
    setKeyChoice('');
  };
  const takeoffId = (t: Takeoff) =>
    t.kind === 'length' ? `length:${t.axis}` : t.kind === 'value' ? `value:${t.key}` : t.kind;
  const setTakeoff = (id: string) => {
    const [kind, arg] = id.split(/:(.*)/s);
    const takeoff: Takeoff =
      kind === 'length'
        ? { kind: 'length', axis: arg as Axis }
        : kind === 'value'
          ? { kind: 'value', key: arg }
          : kind === 'count'
            ? { kind: 'count' }
            : { kind: 'volume' };
    onChange({ ...rule, takeoff });
  };

  return (
    <div className="rule">
      <div className="rule-head">
        <span className="label">Bauteile</span>
        <span className="sub">
          {loading ? 'lädt …' : `${result.rows.length.toLocaleString('de-DE')} in der Gruppe`}
        </span>
        <button type="button" className="icon-btn" onClick={onRemove}>
          Regel entfernen
        </button>
      </div>

      <label className="rule-field">
        <span className="k">Klasse</span>
        <select
          value={group.category ?? ''}
          onChange={(e) => setGroup({ category: e.target.value || null, where: [] })}
        >
          <option value="">– nur von Hand –</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>
              {className(c.category)} ({c.count.toLocaleString('de-DE')})
            </option>
          ))}
        </select>
      </label>

      {group.where.length > 0 && (
        <ul className="criteria">
          {group.where.map((c, i) => (
            <li key={i} title={'key' in c ? c.key : undefined}>
              <span>{describe(c)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Kriterium entfernen"
                onClick={() => setGroup({ where: group.where.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {current.length > 0 && (
        <div className="rule-field">
          <span className="k">Eingrenzen</span>
          <select value={keyChoice} onChange={(e) => setKeyChoice(e.target.value)}>
            <option value="">Merkmal wählen …</option>
            {keys.map((k) => (
              <option key={keyId(k)} value={keyId(k)}>
                {k.kind === 'extent' ? axisLabel(k.axis) : k.key}
              </option>
            ))}
          </select>
        </div>
      )}
      {chosen && (
        <div className="value-chips">
          {values.length === 0 && <span className="sub">keine Werte</span>}
          {values.map((v) => (
            <button
              key={String(v.value)}
              type="button"
              className="chip"
              onClick={() => addCriterion(v.value)}
            >
              {show(v.value)}
              {chosen.kind === 'extent' ? ' m' : ''} <span className="sub">{v.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rule-actions">
        <button
          type="button"
          className={`btn${picking ? ' active' : ''}`}
          aria-pressed={picking}
          onClick={() => onPicking(!picking)}
        >
          {picking ? 'Fertig' : 'Im Modell dazu / heraus'}
        </button>
        {(group.add.length > 0 || group.remove.length > 0) && (
          <span className="sub">
            {group.add.length} dazu · {group.remove.length} heraus
          </span>
        )}
      </div>

      <label className="rule-field">
        <span className="k">Menge</span>
        <select value={takeoffId(rule.takeoff)} onChange={(e) => setTakeoff(e.target.value)}>
          <option value="volume">Volumen</option>
          {AXES.map((axis) => (
            <option key={axis} value={`length:${axis}`}>
              {axisLabel(axis)}
            </option>
          ))}
          <option value="count">Anzahl</option>
          {numericKeys.map((k) =>
            k.kind === 'value' ? (
              <option key={k.key} value={`value:${k.key}`}>
                aus dem Modell: {k.key}
              </option>
            ) : null,
          )}
        </select>
      </label>

      {result.rows.length > 0 && (
        <div className="rule-rows">
          {result.missing > 0 && (
            <div className="missing">
              {result.missing} {result.missing === 1 ? 'Bauteil' : 'Bauteile'} ohne Wert
            </div>
          )}
          {result.rows.slice(0, MAX_ROWS).map(({ element, quantity }) => (
            <button
              key={`${element.modelId}#${element.localId}`}
              type="button"
              className={`rule-row${quantity === null ? ' none' : ''}`}
              onClick={() => onFocus(element)}
              title={element.guid}
            >
              <span className="text">{element.name || className(element.category)}</span>
              <span className="qty">
                {quantity === null ? 'kein Wert' : formatQuantity(quantity, unit)}
              </span>
            </button>
          ))}
          {result.rows.length > MAX_ROWS && (
            <div className="lv-more">
              {(result.rows.length - MAX_ROWS).toLocaleString('de-DE')} weitere
            </div>
          )}
        </div>
      )}
    </div>
  );
}
