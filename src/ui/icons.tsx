/** The MoveWise logomark: a knight's L-shaped move drawn as a forward arrow across board squares. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="MoveWise logo">
      <rect width="64" height="64" rx="14" fill="#0f1420" />
      <g fill="#1c2540">
        <rect x="10" y="10" width="14" height="14" />
        <rect x="38" y="10" width="14" height="14" />
        <rect x="24" y="24" width="14" height="14" />
        <rect x="10" y="38" width="14" height="14" />
        <rect x="38" y="38" width="14" height="14" />
      </g>
      <path d="M17 50 V23 H41" fill="none" stroke="#f1ead9" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 13 L51 23 L38 33 Z" fill="#e8a33d" />
      <circle cx="17" cy="50" r="5" fill="#e8a33d" />
    </svg>
  );
}

export type NavIconName = 'home' | 'play' | 'analysis' | 'games' | 'puzzles' | 'academy' | 'profile' | 'settings' | 'notebook';

export function NavIcon({ name }: { name: NavIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === 'home' && <path {...common} d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />}
      {name === 'play' && <path {...common} d="M8 5v14l11-7z" />}
      {name === 'analysis' && <path {...common} d="M4 20V9m6 11V4m6 16v-8m4 8H3" />}
      {name === 'games' && <path {...common} d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3" />}
      {name === 'puzzles' && <path {...common} d="M9 4h6v3.2a2 2 0 1 1 0 3.6V14h-2.2a2 2 0 1 0-3.6 0H6V4h3zm-3 10h3.2M6 14v6h12v-6M15 14v6" />}
      {name === 'academy' && <path {...common} d="M3 9l9-5 9 5-9 5zM7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5M21 9v5" />}
      {name === 'notebook' && <path {...common} d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM6 3v18M10 8h5M10 12h5" />}
      {name === 'profile' && (
        <>
          <circle {...common} cx="12" cy="8" r="3.6" />
          <path {...common} d="M4.5 20c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6" />
        </>
      )}
      {name === 'settings' && (
        <>
          <circle {...common} cx="12" cy="12" r="3" />
          <path {...common} d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" />
        </>
      )}
    </svg>
  );
}
