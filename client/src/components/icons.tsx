import type { SVGProps } from 'react'

export type IconName =
  | 'dashboard'
  | 'bills'
  | 'plus'
  | 'users'
  | 'percent'
  | 'logout'
  | 'menu'
  | 'search'
  | 'close'
  | 'check-circle'
  | 'alert-circle'
  | 'chevron-right'
  | 'print'
  | 'cash'
  | 'upi'
  | 'ban'
  | 'key'
  | 'pencil'
  | 'clock'
  | 'inbox'
  | 'settings'
  | 'receipt'
  | 'shield'
  | 'globe'
  | 'wallet'
  | 'user'
  | 'pill'

const PATHS: Record<IconName, string> = {
  dashboard:
    'M4 4h6v7H4V4Zm10 0h6v4h-6V4ZM4 14h6v6H4v-6Zm10-4h6v10h-6V10Z',
  bills:
    'M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 9H9m6 4H9m3-8H9',
  plus: 'M12 5v14M5 12h14',
  users:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5M14.5 14.9c2.6.3 4.5 2.5 4.5 5.1',
  percent: 'M6 18 18 6M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9',
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm9 2-4.35-4.35',
  close: 'M6 6l12 12M18 6 6 18',
  'check-circle':
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-4-10 3 3 5-6',
  'alert-circle': 'M12 8v5m0 3.5h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  'chevron-right': 'm9 18 6-6-6-6',
  print:
    'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M6 14h12v7H6v-7Z',
  cash: 'M3 7h18v10H3V7Zm9 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6 9v0M18 15v0',
  upi: 'M4 4h16v16H4V4Zm4 4h8M8 12h8M8 16h4',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM5.5 5.5l13 13',
  key: 'M14.5 9.5a4 4 0 1 0-4.9 3.9L4 19v2h2l1-1v-1.5H8.5V17H10v-1.6l1.7-1.7a4 4 0 0 0 2.8-4.2Zm0 0a4 4 0 0 1 0 .01Z',
  pencil: 'm4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3.5 2',
  inbox:
    'M3 12h4.5l1.5 3h6l1.5-3H21M3 12v7a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-7M3 12l3-7h12l3 7',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.4 4a7.4 7.4 0 0 1-.1 1.3l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-2.2 1.3L15 22H9l-.7-2.4a7.6 7.6 0 0 1-2.2-1.3l-2.4 1-2-3.4 2-1.6A7.4 7.4 0 0 1 3.6 12a7.4 7.4 0 0 1 .1-1.3l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 2.2-1.3L9 2h6l.7 2.4a7.6 7.6 0 0 1 2.2 1.3l2.4-1 2 3.4-2 1.6c.07.4.1.87.1 1.3Z',
  receipt:
    'M6 2h12v20l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V2Zm3 5h6M9 11h6M9 15h4',
  shield: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Z',
  globe:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c2.5 2.5 4 6 4 10s-1.5 7.5-4 10c-2.5-2.5-4-6-4-10s1.5-7.5 4-10ZM2.5 9h19M2.5 15h19',
  wallet:
    'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm14 6h-3a2 2 0 1 0 0 4h3',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-7 9c0-3.9 3.1-7 7-7s7 3.1 7 7',
  pill: 'M4.93 19.07a6 6 0 0 1 0-8.49l7.65-7.65a6 6 0 0 1 8.49 8.49l-7.65 7.65a6 6 0 0 1-8.49 0Z M9 15l6-6',
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
