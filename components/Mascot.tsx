// Pebble, the product mascot: a smooth, friendly oval stone with a small AI sparkle. Same four moods as before
// (idle, thinking, happy, surprised); the mood classes are styled in globals.css (.mascot .eyes, .happy-eyes, .dots).
// Colours are fixed on purpose so Pebble looks the same on the navy top bar, white panels and the intro.
export type MascotState = "idle" | "thinking" | "happy" | "surprised";

export default function Mascot({ className = "", state = "idle", sparkle = true }: { className?: string; state?: MascotState; sparkle?: boolean }) {
  const id = "pebble";
  return (
    <svg viewBox="0 0 64 64" className={`mascot ${state} ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#EEF3FA" />
          <stop offset="0.55" stopColor="#CFDCEC" />
          <stop offset="1" stopColor="#A9BCD6" />
        </linearGradient>
      </defs>
      {/* soft ground shadow */}
      <ellipse cx="32" cy="56" rx="20" ry="3" fill="#16325A" opacity="0.14" />
      {/* the pebble: a smooth oval, wider than tall */}
      <ellipse cx="32" cy="34" rx="24" ry="18" fill={`url(#${id}-body)`} stroke="#16325A" strokeOpacity="0.18" strokeWidth="1.2" />
      {/* shine */}
      <ellipse cx="21" cy="23.5" rx="7.5" ry="3.2" transform="rotate(-18 21 23.5)" fill="#fff" opacity="0.75" />
      {/* eyes (idle / thinking / surprised) */}
      <g className="eyes">
        <ellipse cx="25.5" cy="33" rx="3" ry="3.6" fill="#253247" />
        <ellipse cx="39.5" cy="33" rx="3" ry="3.6" fill="#253247" />
        <circle cx="26.5" cy="31.6" r="1" fill="#fff" />
        <circle cx="40.5" cy="31.6" r="1" fill="#fff" />
      </g>
      {/* happy eyes */}
      <g className="happy-eyes" fill="none" stroke="#253247" strokeWidth="2.4" strokeLinecap="round">
        <path d="M22.5 34q3-4.5 6 0" />
        <path d="M36.5 34q3-4.5 6 0" />
      </g>
      {/* cheeks + smile */}
      <ellipse cx="20" cy="40" rx="3.4" ry="2" fill="#F2A7A7" opacity="0.55" />
      <ellipse cx="45" cy="40" rx="3.4" ry="2" fill="#F2A7A7" opacity="0.55" />
      <path d="M29 40.5q3.5 3 7 0" fill="none" stroke="#253247" strokeWidth="2" strokeLinecap="round" />
      {/* AI sparkle */}
      {sparkle && <path d="M54 6.5l1.6 4.2 4.2 1.6-4.2 1.6L54 18.1l-1.6-4.2-4.2-1.6 4.2-1.6z" fill="#6655CC" />}
      {/* thinking dots */}
      <g className="dots" fill="#6655CC">
        <circle cx="32" cy="2" r="2.2" />
        <circle cx="44" cy="7" r="2" opacity="0.75" />
        <circle cx="20" cy="7" r="2" opacity="0.5" />
      </g>
    </svg>
  );
}
