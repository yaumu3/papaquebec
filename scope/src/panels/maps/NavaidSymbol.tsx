import { LAYER_TABLE } from '../../lib/layers';
import { navaidSymbol } from '../../lib/navaidSymbol';
import { FigureSvg } from './FigureSvg';

const { size, color } = LAYER_TABLE.navaid.style;

/**
 * The symbol the scope draws for a navaid of `kind`, at the size it draws it, in the navaid
 * colour.
 */
export function NavaidSymbol(props: { kind: string | undefined }) {
  return (
    <FigureSvg
      figure={navaidSymbol(props.kind, size)}
      color={color}
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
    />
  );
}
