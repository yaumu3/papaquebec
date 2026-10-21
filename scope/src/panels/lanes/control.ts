import type { LanesWindow } from '../../state/window';

const SEC_PER_MIN = 60;

/** How long as it is spoken: minutes and seconds, a zero part left out unless both are. */
function spoken(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const min = Math.floor(total / SEC_PER_MIN);
  const rest = total % SEC_PER_MIN;
  return [min > 0 && `${min} min`, (rest > 0 || min === 0) && `${rest} s`]
    .filter(Boolean)
    .join(' ');
}

/** What the window control does when pressed, `lagSec` being how far back the window ends. */
export const controlLabel = (w: LanesWindow, lagSec: number): string =>
  w.kind === 'live' ? 'Live; press to hold' : `Held ${spoken(lagSec)} back; press to go live`;
