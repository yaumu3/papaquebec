import { createMemo, For, type JSX, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { LAYER_GROUPS, LAYER_TABLE } from '../../lib/layers';
import type { ScopeLayer } from '../../lib/mapsetFormat';
import { itemsIn } from '../../lib/treeItems';
import {
  groupCount,
  layerSummary,
  layerTitle,
  type RowState,
  rowStateOf,
} from '../../lib/treeRows';
import { layerState } from '../../state/drawn';
import {
  found,
  groupLeaves,
  isLayerListed,
  isOpen,
  leavesOf,
  tapDot,
  toggleOpen,
  treeItems,
} from '../../state/layerTree';
import { SectionTitle } from '../../ui/Section';
import { ItemList } from './ItemList';
import { Marked } from './Marked';
import { SearchBox } from './SearchBox';
import { Swatch } from './Swatch';
import { onTreeKey } from './treeKeys';

import s from './LayerTree.module.css';

type Group = (typeof LAYER_GROUPS)[number];

const PRESSED: Record<RowState, 'true' | 'false' | 'mixed'> = {
  on: 'true',
  off: 'false',
  mixed: 'mixed',
};

const Chevron = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
    <path d="M2.5 1 L6 4 L2.5 7" fill="none" stroke="currentColor" stroke-width="1.3" />
  </svg>
);

const stateClass = (state: RowState) => cx(state === 'off' && s.off, state === 'mixed' && s.mixed);

/** The dot that shows or hides what is under a row. */
function Dot(props: { state: RowState; label: string; onTap: () => void }) {
  return (
    <button
      type="button"
      class={cx(s.dot, stateClass(props.state))}
      aria-pressed={PRESSED[props.state]}
      aria-label={`Show or hide ${props.label}`}
      onClick={() => props.onTap()}
    >
      <span class={s.drawing} aria-hidden="true" />
    </button>
  );
}

function LayerBranch(props: { layer: ScopeLayer }) {
  const leaves = createMemo(() => leavesOf(props.layer));
  const hasItems = () => leaves().present.length > 0;
  const state = createMemo(() => rowStateOf([leaves()], layerState));
  const summary = createMemo(() =>
    layerSummary(props.layer, itemsIn(treeItems(), props.layer), layerState(props.layer)),
  );
  const open = () => hasItems() && isOpen('openLayers', props.layer);
  const expanded = () => (hasItems() ? open() : undefined);
  const onHead = () => (hasItems() ? toggleOpen('openLayers', props.layer) : tapDot([leaves()]));
  return (
    <Show when={isLayerListed(props.layer)}>
      <div role="treeitem" aria-expanded={expanded()}>
        <div class={cx(s.row, stateClass(state()), summary()?.tone === 'none' && s.noData)}>
          <Dot
            state={state()}
            label={LAYER_TABLE[props.layer].name}
            onTap={() => tapDot([leaves()])}
          />
          <button
            type="button"
            data-head
            class={s.layerHead}
            aria-expanded={expanded()}
            title={layerTitle(props.layer, hasItems())}
            onClick={onHead}
          >
            <span class={s.guide} aria-hidden="true" />
            <span class={s.chevron}>
              <Show when={hasItems()}>
                <Chevron />
              </Show>
            </span>
            <span class={s.swatch}>
              <Swatch layer={props.layer} />
            </span>
            <span class={s.name}>
              <Marked text={LAYER_TABLE[props.layer].name} />
            </span>
            <Show when={summary()}>
              {(text) => (
                <span class={cx(s.summary, text().tone === 'subset' && s.subset)}>
                  {text().text}
                </span>
              )}
            </Show>
          </button>
        </div>
        <Show when={open()}>
          <ItemList layer={props.layer} />
        </Show>
      </div>
    </Show>
  );
}

function GroupBranch(props: { group: Group }) {
  const leaves = createMemo(() => groupLeaves(props.group));
  const state = createMemo(() => rowStateOf(leaves(), layerState));
  const count = createMemo(() => groupCount(leaves(), layerState));
  const open = () => isOpen('openGroups', props.group.title);
  return (
    <Show when={leaves().length > 0}>
      <div role="treeitem" aria-expanded={open()} class={s.group}>
        <div class={cx(s.row, stateClass(state()))}>
          <Dot state={state()} label={props.group.title} onTap={() => tapDot(leaves())} />
          <button
            type="button"
            data-head
            class={s.groupHead}
            aria-expanded={open()}
            onClick={() => toggleOpen('openGroups', props.group.title)}
          >
            <span class={s.chevron}>
              <Chevron />
            </span>
            <span class={s.name}>
              <Marked text={props.group.title} />
            </span>
            <Show when={count().on < count().all}>
              <span class={s.summary}>{`${count().on}/${count().all}`}</span>
            </Show>
          </button>
        </div>
        <Show when={open()}>
          <div role="group">
            <For each={props.group.layers}>{(layer) => <LayerBranch layer={layer} />}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

/** The LAYERS section: groups of layers of items, each shown or hidden from its dot. */
export function LayerTree(): JSX.Element {
  let tree: HTMLDivElement | undefined;
  let box: HTMLInputElement | undefined;
  return (
    <>
      <div class={s.titleLine}>
        <SectionTitle>LAYERS</SectionTitle>
        <SearchBox
          ref={(node) => {
            box = node;
          }}
          onDown={() => tree?.querySelector<HTMLElement>('[data-head]')?.focus()}
        />
      </div>
      <div
        role="tree"
        aria-label="Layers"
        class={s.tree}
        ref={(node) => {
          tree = node;
        }}
        onKeyDown={(e) => tree && onTreeKey(e, tree, box)}
      >
        <For each={LAYER_GROUPS}>{(group) => <GroupBranch group={group} />}</For>
      </div>
      <Show when={found()?.layers.size === 0}>
        <div class={s.none}>NOTHING MATCHES</div>
      </Show>
    </>
  );
}
