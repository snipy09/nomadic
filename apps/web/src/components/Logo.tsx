interface LogoProps {
  /** `light` is the full-colour logo for pale grounds. `dark` is the reversed one for ink and ultramarine. */
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * The Nomadic wordmark, drawn from the brand files in /public (logo.svg and logo-reverse.svg).
 * Inline so it takes the page's colours and never waits on a second request.
 */
export default function Logo({ tone = 'light', className = 'h-7' }: LogoProps) {
  const ink = tone === 'dark' ? '#fff' : '#0A0F2C';
  const mark = tone === 'dark' ? '#fff' : '#2338E0';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="18 23 456 82"
      role="img"
      aria-label="Nomadic"
      className={`w-auto ${className}`}
    >
      <path d="M24 29H50V99H24ZM78 29H104V99H78Z" fill={mark} />
      <path d="M24 29H50L104 99H78Z" fill="#FFC21A" />
      <g transform="translate(128 99)" fill="none" stroke={ink} strokeWidth="14">
        <path d="M7 0V-44M37 0V-22A15 15 0 0 0 7 -22" />
        <circle cx="72" cy="-22" r="15" />
        <path d="M107 0V-44M137 0V-22A15 15 0 0 0 107 -22M167 0V-22A15 15 0 0 0 137 -22" />
        <circle cx="202" cy="-22" r="15" />
        <path d="M217 0V-44" />
        <circle cx="252" cy="-22" r="15" />
        <path d="M267 0V-70" />
        <path d="M288 0V-44" />
        <path d="M335.15 -32.04A15 15 0 1 0 335.15 -11.96" />
        <circle cx="288" cy="-59" r="8" fill="#FFC21A" stroke="none" />
      </g>
    </svg>
  );
}
