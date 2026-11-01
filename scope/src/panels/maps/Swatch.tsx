import type { ScopeLayer } from '../../lib/mapsetFormat';
import { SWATCH_HEIGHT, SWATCH_WIDTH, swatchOf } from '../../lib/swatch';
import { FigureSvg } from './FigureSvg';

/** A small drawing of how a layer looks on the scope. */
export function Swatch(props: { layer: ScopeLayer }) {
  const swatch = () => swatchOf(props.layer);
  return (
    <FigureSvg
      figure={swatch().figure}
      color={swatch().color}
      width={SWATCH_WIDTH}
      height={SWATCH_HEIGHT}
      viewBox={`0 0 ${SWATCH_WIDTH} ${SWATCH_HEIGHT}`}
    />
  );
}
