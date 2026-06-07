type AndromedaMarkProps = {
  size?: number;
  className?: string;
};

/**
 * The Andromeda symbol: a coral sun rising over calm waves, encircled by a
 * tilted orbit. Ink elements use `currentColor` so the mark adapts to light and
 * dark themes; the sun stays the fixed brand coral.
 */
export default function AndromedaMark({ size = 32, className }: AndromedaMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="24" cy="26" r="9.4" fill="var(--brand)" />
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      >
        <g transform="rotate(-24 24 23)">
          <ellipse cx="24" cy="21" rx="16" ry="5.4" />
        </g>
      </g>
      <g transform="rotate(-24 24 23)">
        <circle cx="40" cy="21" r="1.9" fill="currentColor" />
      </g>
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M9 33 Q16 29 23 33 T37 33" />
        <path d="M11 38 Q18 34.6 25 38 T39 38" />
      </g>
    </svg>
  );
}
