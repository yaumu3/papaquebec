import { For, Show } from 'solid-js';

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
import { HINT, type HintBlock } from './hint';

import s from './Overlays.module.css';

const banner = () => bannerText(renderError(), feedStatus(), site(), receiverAnswered());

/** Every binding on one grid so keycaps and actions align across the blocks. */
function Hint() {
  const columns = Math.max(...HINT.map((b) => b.columns.length));
  const rows = (block: HintBlock) =>
    Array.from({ length: Math.max(...block.columns.map((c) => c.length)) }, (_, r) =>
      Array.from({ length: columns }, (_unused, c) => block.columns[c]?.[r]),
    );
  return (
    <div
      class={cx(s.hint, hintVisible() && s.show)}
      style={{ 'grid-template-columns': `repeat(${columns}, auto auto)` }}
    >
      <For each={HINT}>
        {(block) => (
          <>
            <div class={s.title}>{block.title}</div>
            <For each={rows(block)}>
              {(row) => (
                <For each={row}>
                  {(binding, c) => (
                    <>
                      <span class={cx(s.keys, c() > 0 && s.next)}>
                        <For each={binding?.keys ?? []}>
                          {(cap, i) => (
                            <>
                              <Show when={i() > 0}>
                                <span class={s.sep}>{binding?.sep ?? '+'}</span>
                              </Show>
                              <span class={s.key}>{cap}</span>
                            </>
                          )}
                        </For>
                      </span>
                      <span class={s.action}>{binding?.action}</span>
                    </>
                  )}
                </For>
              )}
            </For>
          </>
        )}
      </For>
    </div>
  );
}

/** Mode badge, keyboard hint and the honest banner for a scope that cannot draw. */
export function Overlays() {
  return (
    <>
      <div class={cx(s.mode, modeText() !== null && s.show)}>{modeText()}</div>
      <Hint />
      <Show when={banner()}>
        <div class={s.banner}>{banner()}</div>
      </Show>
    </>
  );
}
