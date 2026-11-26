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
  // Combine and separate (M3a-7), as the prototype's merge handle and menu draw them; and the vote-again note.
  // A broken link, for reporting a source that can't be opened (C-02), as Lucide's link-2-off.
  "link-2-off": ["M9 17H7A5 5 0 0 1 7 7", "M15 7h2a5 5 0 0 1 4 8", "M8 12h4", "m2 2 20 20"],
  merge: ["m8 6 4-4 4 4", "M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22", "m20 22-5-5"],
  split: ["M16 3h5v5", "M8 3H3v5", "M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3", "m15 9 6-6"],
  "rotate-ccw": ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  // Board settings (M3b-2), from Lucide's settings and user-plus.
  settings: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  ],
  "user-plus": ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "M19 8v6", "M22 11h-6"],
  // The speech bubble on cards, option headers, and the question (M3b-11, D-01), from Lucide 1.17.0's message-square.
  "message-square": ["M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"],
  // Your steelmen's search field (M3d-13, E-05), from Lucide's search, its circle drawn as a path.
  search: ["m21 21-4.34-4.34", "M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0"],
  history: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
  clock: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M12 6v6l4 2"],
  plus: ["M5 12h14", "M12 5v14"],
  // The sidebar's Home and its button on a narrow screen (M3d-19), from Lucide's house and menu.
  house: ["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  menu: ["M4 12h16", "M4 18h16", "M4 6h16"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  "trash-2": ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", "M10 11v6", "M14 11v6"],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4"],
  globe: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  "sliders-horizontal": ["M21 4h-7", "M10 4H3", "M21 12h-9", "M8 12H3", "M21 20h-5", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4"],
  ellipsis: ["M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0", "M18 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0", "M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0"],
  info: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M12 16v-4", "M12 8h.01"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  paperclip: ["m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"],
  "file-text": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8"],
  "chevron-right": ["m9 18 6-6-6-6"],
  // The tour's three votes (L-02), as the prototype's tour heads them.
  "arrow-up-down": ["m21 16-4 4-4-4", "M17 20V4", "m3 8 4-4 4 4", "M7 4v16"],
  "arrow-left-right": ["M8 3 4 7l4 4", "M4 7h16", "m16 21 4-4-4-4", "M20 17H4"],
  "file-check": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "m9 15 2 2 4-4"],
  // Your account's Sign out (L-04), as the prototype's account card has it.
  // "Back to …" (M3a-1), as the prototype's back link has it.
  "arrow-left": ["m12 19-7-7 7-7", "M19 12H5"],
  "log-out": ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],

  "triangle-alert": ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  pencil: ["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4"],
  "pen-line": ["M12 20h9", "M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"],
  "layout-grid": ["M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z", "M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z"],
  award: ["m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526", "M6 8a6 6 0 1 0 12 0a6 6 0 1 0-12 0"],
  "arrow-up-narrow-wide": ["m3 8 4-4 4 4", "M7 4v16", "M11 12h4", "M11 16h7", "M11 20h10"],
  layers: ["m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z", "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65", "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"],
  user: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0"],
  "fold-horizontal": ["M2 12h6", "M22 12h-6", "M12 2v2", "M12 8v2", "M12 14v2", "M12 20v2", "m19 9-3 3 3 3", "m5 15 3-3-3-3"],
  // Report and moderation (M2-3, M2-4), from lucide-static 0.460.0.
  flag: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
  "flag-off": ["M8 2c3 0 5 2 8 2s4-1 4-1v11", "M4 22V4", "M4 15s1-1 4-1 5 2 8 2", "m2 2 20 20"],
  ban: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "m4.9 4.9 14.2 14.2"],
  "shield-alert": [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "M12 8v4",
    "M12 16h.01",
  ],
  "move-right": ["M18 8L22 12L18 16", "M2 12H22"],
  "circle-help": ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
  "eye-off": [
    "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
    "M14.084 14.158a3 3 0 0 1-4.242-4.242",
    "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
    "m2 2 20 20",
  ],
  // Show only this column (M3d-6), as the prototype's menu draws it, from Lucide's maximize-2 (from memory).
  "maximize-2": ["M15 3h6v6", "m21 3-7 7", "m3 21 7-7", "M9 21H3v-6"],
  eye: ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`lucide lucide-${name}${className ? ` ${className}` : ""}`}
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
