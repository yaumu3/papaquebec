import { For } from 'solid-js';

import { markedPieces } from '../../lib/tree';
import { terms } from '../../state/layerTree';

/** A text with the part the search matched marked. */
export function Marked(props: { text: string }) {
  return (
    <For each={markedPieces(props.text, terms())}>
      {(piece) => (piece.marked ? <mark>{piece.text}</mark> : piece.text)}
    </For>
  );
}
