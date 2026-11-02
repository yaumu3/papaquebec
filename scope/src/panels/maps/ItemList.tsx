import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';

import { isMouse } from '../../canvas/input/devices/mouse';
import { cx } from '../../design/cx';
import { itemKind } from '../../lib/chart';
import { LAYER_TABLE } from '../../lib/layers';
import type { ScopeLayer } from '../../lib/mapsetFormat';
import { itemsIn, type TreeItem } from '../../lib/tree';
import { isItemShown, type LayerState } from '../../lib/visibility';
import { layerState } from '../../state/drawn';
import {
  blurRow,
  enterRow,
  focusRow,
  leaveRow,
  listedItems,
  tapItem,
  treeItems,
} from '../../state/layerTree';
import { scrollView } from '../lanes/scroll';
import { Marked } from './Marked';
import { NavaidSymbol } from './NavaidSymbol';

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
              <span class={s.swatch}>
                <Show when={row().layer === 'navaid'}>
                  <NavaidSymbol kind={itemKind(row())} />
                </Show>
              </span>
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

/**
 * A layer's items, at most eight rows tall, scrolling on their own; the last row fades while
 * there is more below.
 */
export function ItemList(props: { layer: ScopeLayer }) {
  const state = createMemo(() => layerState(props.layer));
  const byKey = createMemo(
    () => new Map(itemsIn(treeItems(), props.layer).map((item) => [item.key, item])),
  );
  const keys = createMemo(() => listedItems(props.layer).map((item) => item.key));
  const [more, setMore] = createSignal(false);
  let list: HTMLDivElement | undefined;
  const measure = () => {
    if (list) setMore(scrollView(list.scrollTop, list.clientHeight, list.scrollHeight).cutBottom);
  };
  // At the frame: read here it would lay out every list's rows once more, for each list.
  // A hidden list has no size and fades nothing.
  createEffect(() => {
    keys();
    requestAnimationFrame(measure);
  });
  onMount(() => {
    if (!list) return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    onCleanup(() => observer.disconnect());
  });
  return (
    <div
      role="group"
      aria-label={`${LAYER_TABLE[props.layer].name} items`}
      class={cx(s.items, more() && s.more)}
      ref={(node) => {
        list = node;
      }}
      onScroll={measure}
    >
      <For each={keys()}>{(key) => <ItemRow itemKey={key} byKey={byKey} state={state} />}</For>
    </div>
  );
}
