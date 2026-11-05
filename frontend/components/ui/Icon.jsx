"use client";

const paths = {
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l1 13H4L5 8Z" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  truck: (
    <>
      <path d="M2 5h12v12H2zM14 9h4l4 4v4h-8" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C6 2 1 11 7 17s15 1 13-14Z" />
      <path d="M4 21 16 9" />
    </>
  ),
  droplet: (
    <path d="M12 3c3.3 4.3 6.5 7.5 6.5 11a6.5 6.5 0 0 1-13 0c0-3.5 3.2-6.7 6.5-11Z" />
  ),
  repeat: (
    <path d="M20 5v5h-5M4 19v-5h5M20 10a8 8 0 0 0-13.5-4M4 14a8 8 0 0 0 13.5 4" />
  ),
  hanger: <path d="M9 6a3 3 0 1 1 4 3v3l9 6v2H2v-2l10-6" />,
  flag: <path d="M5 22V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0" />,
  box: (
    <>
      <path d="m3 7 9-4 9 4v11l-9 4-9-4V7Z" />
      <path d="m3 7 9 4 9-4M12 11v11" />
    </>
  ),
  shield: (
    <>
      <path d="m12 2 8 4v6c0 6-8 10-8 10S4 18 4 12V6l8-4Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  file: <path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  logout: <path d="M9 4H3v16h6M10 12h11m-5-5 5 5-5 5" />,
  upload: <path d="M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5" />,
};

export function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.info}
    </svg>
  );
}
