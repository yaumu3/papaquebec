import { createMemo, For, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { LAYER_NAMES, type ScopeLayer } from '../../lib/layers';
import { itemsIn, type TreeItem } from '../../lib/treeItems';
import { isItemShown, type LayerState } from '../../lib/visibility';
import { listedItems, tapItem, treeItems } from '../../state/layerTree';
import { layerState } from '../../state/layerVisibility';
import { Marked } from './Marked';

import s from './LayerTree.module.css';

function ItemRow(props: {
  itemKey: string;
  byKey: () => ReadonlyMap<string, TreeItem>;
  state: () => LayerState;
}) {
  const item = () => props.byKey().get(props.itemKey);
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
