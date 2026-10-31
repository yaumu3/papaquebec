import { createMemo, For, onCleanup, Show } from 'solid-js';

import { isMouse } from '../../canvas/input/devices/mouse';
import { cx } from '../../design/cx';
import { LAYER_NAMES, type ScopeLayer } from '../../lib/layers';
import { itemsIn, type TreeItem } from '../../lib/treeItems';
import { isItemShown, type LayerState } from '../../lib/visibility';
import {
  blurRow,
  enterRow,
  focusRow,
  leaveRow,
  listedItems,
  tapItem,
  treeItems,
} from '../../state/layerTree';
import { layerState } from '../../state/layerVisibility';
import { Marked } from './Marked';

import s from './LayerTree.module.css';

function ItemRow(props: {
  itemKey: string;
  byKey: () => ReadonlyMap<string, TreeItem>;
  state: () => LayerState;
}) {
  const item = () => props.byKey().get(props.itemKey);
  // A removed row fires no leave or blur, so its key is cleared with it.
  onCleanup(() => {
    leaveRow(props.itemKey);
    blurRow(props.itemKey);
  });
  return (
    <Show when={item()}>
      {(row) => {
        const shown = () => isItemShown(props.state(), row().key);
        return (
          <div role="treeitem" class={s.item}>
            <button
              type="button"
              data-head
              class={cx(s.itemRow, !shown() && s.off)}
              aria-pressed={shown()}
              aria-label={row().tag ? `${row().name} ${row().tag}` : row().name}
              onClick={() => tapItem(row())}
              onPointerEnter={(e) => isMouse(e) && enterRow(row().key)}
              onPointerLeave={(e) => isMouse(e) && leaveRow(row().key)}
              onFocus={() => focusRow(row().key)}
              onBlur={() => blurRow(row().key)}
            >
              <span class={s.drawing} aria-hidden="true" />
              <span class={s.guide} aria-hidden="true" />
              <span class={s.guide} aria-hidden="true" />
              <span />
              <span class={s.name}>
                <Marked text={row().name} />
              </span>
              <span class={s.tag}>
                <Marked text={row().tag} />
              </span>
            </button>
          </div>
        );
      }}
    </Show>
  );
}

/** A layer's items, at most eight rows tall, scrolling on their own. */
export function ItemList(props: { layer: ScopeLayer }) {
  const state = createMemo(() => layerState(props.layer));
  const byKey = createMemo(
    () => new Map(itemsIn(treeItems(), props.layer).map((item) => [item.key, item])),
  );
  return (
    <div role="group" aria-label={`${LAYER_NAMES[props.layer]} items`} class={s.items}>
      <For each={listedItems(props.layer).map((item) => item.key)}>
        {(key) => <ItemRow itemKey={key} byKey={byKey} state={state} />}
      </For>
    </div>
  );
}
