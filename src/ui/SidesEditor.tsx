import { useState } from 'react';
import type { JointHow } from '../model/faces';
import { transferFaces, type ElementFacts, type SidesTakeoff } from '../model/takeoff';
import { className } from '../model/tree';

/** Werkzeug für Seiten + Fugen; gleiche Werte wie `FaceTool` in App. */
export type FaceTool = 'sides' | JointHow;

const number = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// Mehr Fugen in der Liste helfen beim Durchsehen nicht; gerechnet werden alle.
const MAX_JOINTS = 30;

const HOW: Record<JointHow, string> = { quer: 'Quer', laengs: 'Längs', punkte: '2 Punkte' };

interface Props {
  takeoff: SidesTakeoff;
  /** Bauteile der Gruppe, für Namen und „übertragen“. */
  members: ElementFacts[];
  tool: FaceTool | null;
  /** Zuletzt angetipptes Bauteil (GlobalId). */
  pattern: string | null;
  onTool: (tool: FaceTool | null) => void;
  onChange: (takeoff: SidesTakeoff) => void;
}

function toNumber(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(n) ? n : null;
}

/** Seiten antippen, Fugen einzeichnen (quer, längs, zwei Punkte), Seiten übertragen. */
export function SidesEditor(props: Props) {
  const { takeoff, members, tool, pattern, onTool, onChange } = props;
  const [how, setHow] = useState<JointHow>('quer');
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const byGuid = new Map(members.map((e) => [e.guid, e]));
  const withSides = members.filter((e) => (takeoff.faces[e.guid]?.length ?? 0) > 0).length;
  const patternFaces = pattern ? (takeoff.faces[pattern]?.length ?? 0) : 0;
  const others = members.filter((e) => e.guid !== pattern).map((e) => e.guid);
  const nameOf = (guid: string) => {
    const e = byGuid.get(guid);
    return e ? e.name || className(e.category) : 'nicht in der Gruppe';
  };
  const toggleTool = (next: FaceTool) => onTool(tool === next ? null : next);

  const setFrom = (index: number, text: string) => {
    setEditing(null);
    const from = toNumber(text);
    if (from === null || from < 0) return;
    onChange({
      ...takeoff,
      joints: takeoff.joints.map((j, i) => (i === index ? { ...j, from } : j)),
    });
  };

  return (
    <div className="sides">
      <div className="rule-actions">
        <button
          type="button"
          className={`btn${tool === 'sides' ? ' active' : ''}`}
          aria-pressed={tool === 'sides'}
          onClick={() => toggleTool('sides')}
        >
          {tool === 'sides' ? 'Fertig' : 'Seiten antippen'}
        </button>
        <span className="sub">
          an {withSides} von {members.length} Bauteilen
        </span>
      </div>
      {pattern && patternFaces > 0 && others.length > 0 && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            const ok = window.confirm(
              `${patternFaces} Seiten von „${nameOf(pattern)}“ auf ${others.length} ` +
                'weitere Bauteile der Gruppe übertragen? Deren Seitenwahl wird ersetzt.',
            );
            if (ok) onChange(transferFaces(takeoff, pattern, others));
          }}
        >
          Auf gleiche Bauteile übertragen
        </button>
      )}

      <div className="rule-field">
        <span className="k">Fuge</span>
        <div className="seg" role="group" aria-label="Wie die Fuge liegt">
          {(Object.keys(HOW) as JointHow[]).map((h) => (
            <button
              key={h}
              type="button"
              className={how === h ? 'on' : ''}
              aria-pressed={how === h}
              onClick={() => {
                setHow(h);
                if (tool && tool !== 'sides') onTool(h);
              }}
            >
              {HOW[h]}
            </button>
          ))}
        </div>
      </div>
      <div className="rule-actions">
        <button
          type="button"
          className={`btn${tool && tool !== 'sides' ? ' active' : ''}`}
          aria-pressed={!!tool && tool !== 'sides'}
          onClick={() => onTool(tool && tool !== 'sides' ? null : how)}
        >
          {tool && tool !== 'sides' ? 'Fertig' : 'Fuge einzeichnen'}
        </button>
        <span className="sub">
          {takeoff.joints.length === 1 ? '1 Fuge' : `${takeoff.joints.length} Fugen`}
        </span>
      </div>

      {takeoff.joints.length > 0 && (
        <ul className="joints">
          {takeoff.joints.slice(0, MAX_JOINTS).map((j, i) => (
            <li key={i}>
              <span className="text" title={j.guid}>
                {HOW[j.how]} · {nameOf(j.guid)}
              </span>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Abstand vom Anfang in m"
                value={editing?.index === i ? editing.text : number.format(j.from)}
                onFocus={() => setEditing({ index: i, text: number.format(j.from) })}
                onChange={(e) => setEditing({ index: i, text: e.target.value })}
                onBlur={(e) => setFrom(i, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="sub">m</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Fuge löschen"
                onClick={() =>
                  onChange({ ...takeoff, joints: takeoff.joints.filter((_, k) => k !== i) })
                }
              >
                ✕
              </button>
            </li>
          ))}
          {takeoff.joints.length > MAX_JOINTS && (
            <li className="sub">{takeoff.joints.length - MAX_JOINTS} weitere</li>
          )}
        </ul>
      )}
    </div>
  );
}
