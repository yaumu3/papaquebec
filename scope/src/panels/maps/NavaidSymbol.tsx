import { For } from 'solid-js';

import type { Vec2 } from '../../lib/geo';
import { navaidSymbol } from '../../lib/navaidSymbol';
import { LAYER_STYLES } from '../../render/scene/layerStyles';

const { size, color } = LAYER_STYLES.navaid;

const pointsOf = (points: readonly Vec2[]) => points.map(({ x, y }) => `${x},${y}`).join(' ');

/**
 * The symbol the scope draws for a navaid of `kind`, at the size it draws it, in the navaid
 * colour.
 */
export function NavaidSymbol(props: { kind: string | undefined }) {
  const figure = () => navaidSymbol(props.kind, size);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      overflow="visible"
      aria-hidden="true"
    >
      <For each={figure().strokes}>
        {({ points, closed, width }) =>
          closed ? (
            <polygon points={pointsOf(points)} fill="none" stroke={color} stroke-width={width} />
          ) : (
            <polyline points={pointsOf(points)} fill="none" stroke={color} stroke-width={width} />
          )
        }
      </For>
      <For each={figure().discs}>
        {({ at, radius }) => <circle cx={at.x} cy={at.y} r={radius} fill={color} />}
      </For>
    </svg>
  );
}
