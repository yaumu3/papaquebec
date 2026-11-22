import type { JSX } from 'solid-js';

import type { PanelId } from '../state/settingsDefaults';

const Icon = (props: { children: JSX.Element }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="square"
    stroke-linejoin="miter"
  >
    {props.children}
  </svg>
);

/** The drawing on each panel's nav bar button. */
export const NAV_ICONS: Record<PanelId, () => JSX.Element> = {
  display: () => (
    <Icon>
      <path d="M3 5h14" />
      <path d="M3 10h14" />
      <path d="M3 15h14" />
      <circle cx="7" cy="5" r="2" />
      <circle cx="13" cy="10" r="2" />
      <circle cx="8" cy="15" r="2" />
    </Icon>
  ),
  maps: () => (
    <Icon>
      <path d="M10 3l7 4-7 4-7-4z" />
      <path d="M3 11l7 4 7-4" />
    </Icon>
  ),
  list: () => (
    <Icon>
      <path d="M7 5h10" />
      <path d="M7 10h10" />
      <path d="M7 15h10" />
      <path d="M3 5h1" />
      <path d="M3 10h1" />
      <path d="M3 15h1" />
    </Icon>
  ),
  detail: () => (
    <Icon>
      <rect x="7" y="7" width="6" height="6" />
      <path d="M10 2v3" />
      <path d="M10 15v3" />
      <path d="M2 10h3" />
      <path d="M15 10h3" />
    </Icon>
  ),
};
