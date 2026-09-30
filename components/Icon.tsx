const PATHS = {
  back: <path d="M15 6l-6 6 6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  external: <path d="M7 17L17 7M9 7h8v8" />,
  refresh: <><path d="M20 12a8 8 0 11-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bag: <><rect x="5" y="7" width="14" height="13" rx="2" /><path d="M9 7V4h6v3" /></>,
  carryon: <><rect x="7" y="6" width="10" height="14" rx="2" /><path d="M10 6V3h4v3M7 11h10" /></>,
  personal: <><path d="M6 9h12l-1 11H7L6 9z" /><path d="M9 9a3 3 0 016 0" /></>,
  warn: <><path d="M12 3l9 16H3L12 3z" /><path d="M12 10v4M12 17v.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  car: <><path d="M5 16l1.5-5A2 2 0 018.4 9.5h7.2a2 2 0 011.9 1.5L19 16" /><rect x="4" y="16" width="16" height="4" rx="1" /></>,
  lounge: <><path d="M4 18v-6a2 2 0 012-2h12a2 2 0 012 2v6" /><path d="M4 15h16M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" /></>,
  swap: <><path d="M3 12h13M12 7l5 5-5 5" /><path d="M20 5v14" /></>,
  share: <><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" /><path d="M12 3v12M8 7l4-4 4 4" /></>,
  cloud: <path d="M7 16a4 4 0 010-8 5 5 0 019.6 1.5A3.5 3.5 0 0117 16H7z" />,
  plane: <path d="M3 13l8-2 5-7 2 1-3 7 5 1 1 2-6 0-3 5-2-1 1-5-7 0z" />,
  news: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  bang: <path d="M12 7v6M12 16.5v.5" />,
  x: <path d="M7 7l10 10M17 7L7 17" />,
  question: <><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5" /><path d="M12 16.5v.5" /></>,
  spinner: <path d="M12 3a9 9 0 109 9" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.8, color = "currentColor", className, style }: {
  name: IconName; size?: number; stroke?: number; color?: string; className?: string; style?: React.CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ flexShrink: 0, ...style }}>
      {PATHS[name]}
    </svg>
  );
}
