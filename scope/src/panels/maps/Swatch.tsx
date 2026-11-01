import type { JSX } from 'solid-js';

import { CHART_COLORS } from '../../design/palette';
import {
  isHoldStyle,
  isPointStyle,
  type LineLayerStyle,
  type PointLayerStyle,
  DEFAULT_LINE_WIDTH,
  LAYER_TABLE,
} from '../../lib/layers';
import { type ScopeLayer, isChartLayer } from '../../lib/mapsetFormat';

const STROKE = 1.2;

const svg = (inner: JSX.Element) => (
  <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
    {inner}
  </svg>
);

const triangle = (scale: number) =>
  `12,${5 - 4 * scale} ${12 + 3.5 * scale},${5 + 2.5 * scale} ${12 - 3.5 * scale},${5 + 2.5 * scale}`;

function marker(form: PointLayerStyle['marker'], size: number, color: string) {
  if (form === 'ring') {
    return <circle cx="12" cy="5" r="3.5" fill="none" stroke={color} stroke-width={STROKE} />;
  }
  const points = form === 'navaid' ? '12,1 15.5,3 15.5,7 12,9 8.5,7 8.5,3' : triangle(size / 8);
  return <polygon points={points} fill="none" stroke={color} stroke-width={STROKE} />;
}

const racetrack = (color: string) => (
  <rect x="3.5" y="2.5" width="17" height="5" rx="2.5" fill="none" stroke={color} />
);

function stroke(style: LineLayerStyle) {
  return (
    <line
      x1="0"
      y1="5"
      x2="24"
      y2="5"
      stroke={style.color}
      stroke-width={style.width ?? DEFAULT_LINE_WIDTH}
      stroke-dasharray={style.dash?.join(' ')}
    />
  );
}

/** A small drawing of how a layer looks on the scope, from the style the scope draws it with. */
export function Swatch(props: { layer: ScopeLayer }) {
  const layer = props.layer;
  if (isChartLayer(layer)) {
    const style = LAYER_TABLE[layer].style;
    if (isHoldStyle(style)) return svg(racetrack(style.rnavColor));
    return svg(isPointStyle(style) ? marker(style.marker, style.size, style.color) : stroke(style));
  }
  if (layer === 'rings') {
    return svg(<path d="M2 9 A 12 12 0 0 1 22 9" fill="none" stroke={CHART_COLORS.ringEdge} />);
  }
  return svg(<line x1="0" y1="5" x2="24" y2="5" stroke={CHART_COLORS.coast} />);
}
