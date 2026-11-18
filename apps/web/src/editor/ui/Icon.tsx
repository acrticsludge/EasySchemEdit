// apps/web/src/editor/ui/Icon.tsx
// Local 16px stroke icon set for editor chrome. No emoji, no icon dependency.

import type { ReactNode } from 'react';

export type IconName =
  | 'undo'
  | 'redo'
  | 'import'
  | 'export'
  | 'bake'
  | 'save'
  | 'projects'
  | 'select'
  | 'move'
  | 'box'
  | 'layers'
  | 'conflict'
  | 'history'
  | 'agent'
  | 'eye'
  | 'eyeOff'
  | 'lock'
  | 'unlock'
  | 'duplicate'
  | 'trash'
  | 'rotate'
  | 'flip'
  | 'grid'
  | 'close'
  | 'check'
  | 'warning'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronUp';

export interface IconProps {
  name: IconName;
  size?: number;
}

function glyph(name: IconName): ReactNode {
  switch (name) {
    case 'undo':
      return (
        <>
          <path d="M6 4.5 2.5 8 6 11.5" />
          <path d="M2.5 8H9a3.5 3.5 0 0 1 0 7H7" />
        </>
      );
    case 'redo':
      return (
        <>
          <path d="M10 4.5 13.5 8 10 11.5" />
          <path d="M13.5 8H7a3.5 3.5 0 0 0 0 7H9" />
        </>
      );
    case 'import':
      return (
        <>
          <path d="M8 2.5v7" />
          <path d="M5.5 7 8 9.5 10.5 7" />
          <path d="M3 10.5V13h10v-2.5" />
        </>
      );
    case 'export':
      return (
        <>
          <path d="M8 10.5v-8" />
          <path d="M5.5 5 8 2.5 10.5 5" />
          <path d="M3 10.5V13h10v-2.5" />
        </>
      );
    case 'bake':
      return (
        <>
          <path d="M2.5 13.5h11" />
          <path d="M4 13.5V7.5h8V13.5" />
          <path d="M6 5.5c0-1 .5-1.5.5-2.5M8 5.5c0-1 .5-1.5.5-2.5M10 5.5c0-1 .5-1.5.5-2.5" />
        </>
      );
    case 'save':
      return (
        <>
          <path d="M3 2.5h8L13.5 5v8.5h-10.5z" />
          <path d="M5.5 2.5V6.5h5V2.5" />
          <path d="M5.5 13.5V10h5v3.5" />
        </>
      );
    case 'projects':
      return (
        <>
          <rect x="5" y="2.5" width="8.5" height="9" rx="1" />
          <path d="M11 11.5v2H3.5a1 1 0 0 1-1-1V5h2" />
        </>
      );
    case 'select':
      return <rect x="2.5" y="2.5" width="11" height="11" strokeDasharray="2.5 2" />;
    case 'move':
      return (
        <>
          <path d="M8 2v12M2 8h12" />
          <path d="m5.5 4.5 2.5-2.5 2.5 2.5M5.5 11.5 8 14l2.5-2.5M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5" />
        </>
      );
    case 'box':
      return (
        <>
          <path d="M8 1.8 14 5v6l-6 3.2L2 11V5z" />
          <path d="M2 5l6 3.2L14 5M8 8.2v6" />
        </>
      );
    case 'layers':
      return (
        <>
          <path d="M8 2 14 5l-6 3L2 5z" />
          <path d="m2 8 6 3 6-3" />
          <path d="m2 11 6 3 6-3" />
        </>
      );
    case 'conflict':
      return (
        <>
          <rect x="2.5" y="4" width="7" height="7" />
          <rect x="6.5" y="5" width="7" height="7" />
          <path d="M3 3l10 10" />
        </>
      );
    case 'history':
      return (
        <>
          <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" />
          <path d="M2.5 2.5v3.5H6" />
          <path d="M8 5v3.2l2.2 1.5" />
        </>
      );
    case 'agent':
      return (
        <>
          <rect x="3" y="5" width="10" height="8" rx="1.5" />
          <path d="M8 5V3" />
          <circle cx="8" cy="2.2" r=".8" />
          <circle cx="6" cy="9" r=".8" />
          <circle cx="10" cy="9" r=".8" />
          <path d="M1.5 8v2M14.5 8v2" />
        </>
      );
    case 'eye':
      return (
        <>
          <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z" />
          <circle cx="8" cy="8" r="1.8" />
        </>
      );
    case 'eyeOff':
      return (
        <>
          <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z" />
          <circle cx="8" cy="8" r="1.8" />
          <path d="M2 2l12 12" />
        </>
      );
    case 'lock':
      return (
        <>
          <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          <path d="M8 9.5v2" />
        </>
      );
    case 'unlock':
      return (
        <>
          <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1" />
          <path d="M8 9.5v2" />
        </>
      );
    case 'duplicate':
      return (
        <>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
          <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
        </>
      );
    case 'trash':
      return (
        <>
          <path d="M3 4.5h10" />
          <path d="M6 4.5V3h4v1.5" />
          <path d="M4.5 4.5l.7 9h5.6l.7-9" />
          <path d="M6.7 7v4M9.3 7v4" />
        </>
      );
    case 'rotate':
      return (
        <>
          <path d="M13 6a5.5 5.5 0 1 0 .3 4" />
          <path d="M13 2.5V6H9.5" />
        </>
      );
    case 'flip':
      return (
        <>
          <path d="M8 2v12" strokeDasharray="2 2" />
          <path d="M6.5 4 3 8l3.5 4V4z" />
          <path d="M9.5 4 13 8l-3.5 4V4z" />
        </>
      );
    case 'grid':
      return (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
          <path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" />
        </>
      );
    case 'close':
      return <path d="M4 4l8 8M12 4l-8 8" />;
    case 'check':
      return <path d="m3 8.5 3.2 3.2L13 5" />;
    case 'warning':
      return (
        <>
          <path d="M8 2.3 14.5 13h-13z" />
          <path d="M8 6v3.4M8 11.3v.2" />
        </>
      );
    case 'chevronLeft':
      return <path d="M10 3.5 5.5 8l4.5 4.5" />;
    case 'chevronRight':
      return <path d="M6 3.5 10.5 8 6 12.5" />;
    case 'chevronDown':
      return <path d="M3.5 6 8 10.5 12.5 6" />;
    case 'chevronUp':
      return <path d="M3.5 10 8 5.5l4.5 4.5" />;
  }
}

export function Icon({ name, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph(name)}
    </svg>
  );
}
