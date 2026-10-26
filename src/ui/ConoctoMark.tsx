// Krake von oben: Kopf + acht Arme, die nach den Informationen greifen (Entscheidung 0069).
const ARME =
  'M50 31Q57.7 19 72.4 16.8 M63.4 36.6Q77.4 33.5 89.3 42.4 M69 50Q81 57.7 83.2 72.4 ' +
  'M63.4 63.4Q66.5 77.4 57.6 89.3 M50 69Q42.3 81 27.6 83.2 M36.6 63.4Q22.6 66.5 10.7 57.6 ' +
  'M31 50Q19 42.3 16.8 27.6 M36.6 36.6Q33.5 22.6 42.4 10.7';

export function ConoctoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ display: 'block', color: 'var(--blue)' }}
    >
      <path
        d={ARME}
        fill="none"
        stroke="currentColor"
        strokeWidth={size < 20 ? 11 : 8}
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="15" fill="currentColor" />
    </svg>
  );
}
