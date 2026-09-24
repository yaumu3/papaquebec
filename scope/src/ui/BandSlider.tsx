import { withLower, withUpper } from '../state/band';

import s from './BandSlider.module.css';

/** Two overlapped range inputs; the moving thumb pushes the other so they never cross. */
export function BandSlider(props: {
  min: number;
  max: number;
  step: number;
  lower: number;
  upper: number;
  gap: number;
  onChange: (lower: number, upper: number) => void;
}) {
  const pct = (v: number) => ((v - props.min) / (props.max - props.min)) * 100;
  const band = () => ({ lower: props.lower, upper: props.upper });
  const limits = () => ({ min: props.min, max: props.max, gap: props.gap });
  const emit = (b: { lower: number; upper: number }) => props.onChange(b.lower, b.upper);
  return (
    <div class={s.slider}>
      <div class={s.track} />
      <div
        class={s.fill}
        style={{ left: `${pct(props.lower)}%`, width: `${pct(props.upper) - pct(props.lower)}%` }}
      />
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
