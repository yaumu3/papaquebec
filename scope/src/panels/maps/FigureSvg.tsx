import { For } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import type { Figure } from '../../lib/figure';
import type { Vec2 } from '../../lib/geo';

const pointsOf = (points: readonly Vec2[]) => points.map(({ x, y }) => `${x},${y}`).join(' ');

/** A figure in one colour, drawn as the scope draws it. */
export function FigureSvg(props: {
  figure: Figure;
  color: string;
  width: number;
  height: number;
  viewBox: string;
}) {
  return (
    <svg
      width={props.width}
      height={props.height}
      viewBox={props.viewBox}
      overflow="visible"
      aria-hidden="true"
    >
      <For each={props.figure.strokes}>
        {({ points, closed, width, dash }) => (
          <Dynamic
            component={closed ? 'polygon' : 'polyline'}
            points={pointsOf(points)}
            fill="none"
            stroke={props.color}
            stroke-width={width}
            stroke-dasharray={dash?.join(' ')}
          />
        )}
      </For>
      <For each={props.figure.discs}>
        {({ at, radius }) => <circle cx={at.x} cy={at.y} r={radius} fill={props.color} />}
      </For>
    </svg>
  );
}
