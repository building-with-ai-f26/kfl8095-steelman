// The few Lucide icons the board uses (lucide.dev, ISC licence), drawn
// inline as the prototype draws them: 24-unit boxes, round strokes.

const PATHS = {
  "chevron-up": ["m18 15-6-6-6 6"],
  "chevron-down": ["m6 9 6 6 6-6"],
  "chevrons-right": ["m6 17 5-5-5-5", "m13 17 5-5-5-5"],
  "arrow-down": ["M12 5v14", "m19 12-7 7-7-7"],
  "refresh-cw": ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  wifi: ["M12 20h.01", "M2 8.82a15 15 0 0 1 20 0", "M5 12.859a10 10 0 0 1 14 0", "M8.5 16.429a5 5 0 0 1 7 0"],
  "wifi-off": ["M12 20h.01", "M8.5 16.429a5 5 0 0 1 7 0", "M5 12.859a10 10 0 0 1 5.17-2.69", "M19 12.859a10 10 0 0 0-2.007-1.523", "M2 8.82a15 15 0 0 1 4.177-2.643", "M22 8.82a15 15 0 0 0-11.288-3.764", "m2 2 20 20"],
  plus: ["M5 12h14", "M12 5v14"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  "trash-2": ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", "M10 11v6", "M14 11v6"],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4"],
  globe: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  "fold-horizontal": ["M2 12h6", "M22 12h-6", "M12 2v2", "M12 8v2", "M12 14v2", "M12 20v2", "m19 9-3 3 3 3", "m5 15 3-3-3-3"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className={`lucide lucide-${name}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** The arrowhead the prototype's axes use. */
export function AxisHead() {
  return (
    <svg className="sm-axis-head" viewBox="0 0 12 8" aria-hidden="true">
      <path d="M11.5 .6C7 2.7 3.4 3.7 .5 4c2.9.3 6.5 1.3 11 3.4" />
    </svg>
  );
}

export function Axis({ kind, start, end }: { kind: "v" | "h"; start: string; end: string }) {
  return (
    <div className="sm-axis" data-axis={kind} aria-hidden="true">
      <span className="sm-axis-label">{start}</span>
      <span className="sm-axis-line">
        <AxisHead />
        <AxisHead />
      </span>
      <span className="sm-axis-label">{end}</span>
    </div>
  );
}

/** The Steelman logo: a honeycomb diamond, strongest cell solid, weakest dashed. */
export function Logo() {
  return (
    <svg className="sm-logo" viewBox="0 0 55.95 44.65" aria-hidden="true" focusable="false">
      <polygon points="10.96,1.00 20.92,6.75 20.92,18.25 10.96,24.00 1.00,18.25 1.00,6.75" fill="currentColor" />
      <polygon points="33.65,1.85 42.87,7.18 42.87,17.82 33.65,23.15 24.43,17.82 24.43,7.17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="miter" />
      <polygon points="22.30,21.50 31.53,26.82 31.53,37.47 22.30,42.80 13.08,37.47 13.08,26.82" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="miter" />
      <polygon
        points="44.99,21.50 54.22,26.82 54.22,37.47 44.99,42.80 35.77,37.47 35.77,26.82"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="miter"
        strokeLinecap="butt"
        pathLength={18}
        strokeDasharray=".5 .5"
        strokeDashoffset=".25"
      />
    </svg>
  );
}
