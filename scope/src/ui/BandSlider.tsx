import { cx } from '../design/cx';
import { fraction, withLower, withUpper } from '../state/band';

import s from './BandSlider.module.css';

/** Where a thumb's centre sits along the axis: the thumb itself is never clipped at a stop. */
export const thumbPosition = (f: number) => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${f})`;

/**
 * Two overlapped range inputs; the moving thumb pushes the other so they never cross.
 * Vertical puts the maximum at the top.
 */
export function BandSlider(props: {
  min: number;
  max: number;
  step: number;
  lower: number;
  upper: number;
  gap: number;
  vertical?: boolean;
  onChange: (lower: number, upper: number) => void;
}) {
  const band = () => ({ lower: props.lower, upper: props.upper });
  const limits = () => ({ min: props.min, max: props.max, gap: props.gap });
  const emit = (b: { lower: number; upper: number }) => props.onChange(b.lower, b.upper);
  const lo = () => fraction(props.lower, limits());
  const hi = () => fraction(props.upper, limits());
  const fill = () =>
    props.vertical
      ? { bottom: thumbPosition(lo()), height: `calc((100% - var(--thumb)) * ${hi() - lo()})` }
      : { left: `${lo() * 100}%`, width: `${(hi() - lo()) * 100}%` };
  return (
    <div class={cx(s.slider, props.vertical && s.vertical)}>
      <div class={s.track} />
      <div class={s.fill} style={fill()} />
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.lower}
        onInput={(e) => emit(withLower(band(), Number(e.currentTarget.value), limits()))}
        aria-label="Lower altitude"
      />
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.upper}
        onInput={(e) => emit(withUpper(band(), Number(e.currentTarget.value), limits()))}
        aria-label="Upper altitude"
      />
    </div>
  );
}
