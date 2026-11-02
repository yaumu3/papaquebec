import { markedPieces } from '../../lib/tree';
import { terms } from '../../state/layerTree';

/** A text with the part the search matched marked; a plain map, for a list of 1,300 rows. */
export function Marked(props: { text: string }) {
  return (
    <>
      {markedPieces(props.text, terms()).map((piece) =>
        piece.marked ? <mark>{piece.text}</mark> : piece.text,
      )}
    </>
  );
}
