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
  const setLower = (v: number) =>
    props.onChange(v, Math.max(props.upper, Math.min(props.max, v + props.gap)));
  const setUpper = (v: number) =>
    props.onChange(Math.min(props.lower, Math.max(props.min, v - props.gap)), v);
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
        onInput={(e) => setLower(Number(e.currentTarget.value))}
        aria-label="Lower altitude"
      />
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.upper}
        onInput={(e) => setUpper(Number(e.currentTarget.value))}
        aria-label="Upper altitude"
      />
    </div>
  );
}
