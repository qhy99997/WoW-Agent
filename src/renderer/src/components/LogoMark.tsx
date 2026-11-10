export function LogoMark({ size = 24 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="30" height="30" rx="9.5" fill="currentColor" />
      <path
        d="M8.2 11.4 11.5 21.2 15.9 14.2 20.3 21.2 23.6 11.4"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.9" cy="8.4" r="2.1" fill="var(--bg)" />
    </svg>
  )
}
