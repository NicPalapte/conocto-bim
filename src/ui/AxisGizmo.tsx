import type { ViewAxes } from '../viewer/engine';

const SIZE = 96;
const LENGTH = 34;

interface Props {
  axes: ViewAxes;
  onTop: () => void;
}

/** Achsenkreuz der IFC-Achsen; dreht mit der Kamera. Tipp auf Z = Draufsicht. */
export function AxisGizmo({ axes, onTop }: Props) {
  const c = SIZE / 2;
  // Hintere Achsen zuerst zeichnen, damit vordere darüber liegen.
  const order = (['x', 'y', 'z'] as const)
    .map((key) => ({ key, ...axes[key] }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <svg
      className="axes float"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Achsen: X Ost, Y Nord, Z Höhe"
    >
      {order.map(({ key, dx, dy, depth }) => {
        const x = c + dx * LENGTH;
        const y = c + dy * LENGTH;
        const back = depth > 0.2;
        return (
          <g
            key={key}
            className={`axis axis-${key}${back ? ' back' : ''}`}
            onClick={key === 'z' ? onTop : undefined}
          >
            <line x1={c} y1={c} x2={x} y2={y} />
            <circle cx={x} cy={y} r={9} />
            <text x={x} y={y} dy="0.35em" textAnchor="middle">
              {key.toUpperCase()}
            </text>
            {key === 'z' && <title>Draufsicht</title>}
          </g>
        );
      })}
    </svg>
  );
}
