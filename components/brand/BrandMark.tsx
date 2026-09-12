type BrandMarkProps = {
  size?: number;
  className?: string;
};

export default function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    <svg
      aria-label="TradeJournal"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="64" height="64" rx="14" fill="#F4F0E7" />
      <rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="#151515" strokeOpacity="0.1" />
      <g transform="translate(4.8 4.8) scale(.85)">
        <path
          d="M15.8 16.3 43 3.4c2.4-1.1 5 .6 5 3.3v21.9c0 1.7-.9 3.2-2.4 4L16 49.3c-2 1.1-4.5-.3-4.5-2.7V22c0-2.4 1.7-4.7 4.3-5.7Z"
          fill="#171719"
        />
        <path
          d="m37.1 37.5 10.9-6.1v12.4c0 2.7-2.9 4.3-5.2 2.9l-7.2-4.3c-2-1.2-1.8-3.8 1.5-4.9Z"
          fill="#E8A820"
        />
        <path
          d="m16.3 47.8 11.2-5.9a4.2 4.2 0 0 1 4 .1l24.8 13.5c1.4.8 2.2 2.2 2.2 3.8 0 2.9-2.8 5-5.6 4.2L15.7 53.2c-2.7-.8-3.1-4.1.6-5.4Z"
          fill="#171719"
        />
      </g>
    </svg>
  );
}
