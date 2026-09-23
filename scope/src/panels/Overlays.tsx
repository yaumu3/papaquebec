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

import s from './Overlays.module.css';

const HINT = `[ ]  RANGE         R  RBL          ?  HINT
T    TRAIL CYCLE   V  VECTOR CYCLE  L  LIST
RIGHT-DRAG  RANGE CURSOR       DRAG  PAN
HOME RESET PAN     WHEEL   ZOOM   ESC CANCEL
DEL  LAST RBL      SHIFT-DEL  ALL RBL`;

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
