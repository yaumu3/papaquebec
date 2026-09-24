import { Show } from 'solid-js';

import { cx } from '../design/cx';
import { bannerText } from '../state/banner';
import {
  feedStatus,
  hintVisible,
  modeText,
  receiverAnswered,
  renderError,
  site,
} from '../state/scope';
import { HINT } from './hint';

import s from './Overlays.module.css';

const banner = () => bannerText(renderError(), feedStatus(), site(), receiverAnswered());

/** Mode badge, keyboard hint and the honest banner for a scope that cannot draw. */
export function Overlays() {
  return (
    <>
      <div class={cx(s.mode, modeText() !== null && s.show)}>{modeText()}</div>
      <div class={cx(s.hint, hintVisible() && s.show)}>{HINT}</div>
      <Show when={banner()}>
        <div class={s.banner}>{banner()}</div>
      </Show>
    </>
  );
}
