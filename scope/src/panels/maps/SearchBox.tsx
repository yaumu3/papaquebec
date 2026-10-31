import { Show } from 'solid-js';

import { query, setQuery, typeQuery } from '../../state/layerTree';

import s from './SearchBox.module.css';

/** The box that filters the tree; a composition in progress does not filter until it ends. */
export function SearchBox(props: {
  ref?: (node: HTMLInputElement) => void;
  /** Down was pressed in the box: on to the first row. */
  onDown: () => void;
}) {
  let input: HTMLInputElement | undefined;
  const clear = () => {
    setQuery('');
    input?.focus();
  };
  return (
    <div class={s.search}>
      <input
        ref={(node) => {
          input = node;
          props.ref?.(node);
        }}
        type="search"
        class={s.box}
        placeholder="SEARCH"
        aria-label="Search layers"
        spellcheck={false}
        autocomplete="off"
        autocapitalize="characters"
        value={query()}
        onInput={(e) => typeQuery(e.currentTarget.value, e.isComposing)}
        onCompositionEnd={(e) => typeQuery(e.currentTarget.value, false)}
        on:keydown={(e) => {
          if (e.isComposing) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            props.onDown();
          } else if (e.key === 'Escape' && e.currentTarget.value) {
            e.preventDefault();
            e.stopPropagation();
            setQuery('');
          }
        }}
      />
      <Show when={query()}>
        <button type="button" class={s.clear} aria-label="Clear search" onClick={clear}>
          ×
        </button>
      </Show>
    </div>
  );
}
