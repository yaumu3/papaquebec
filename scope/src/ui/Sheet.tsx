import { createSignal, type JSX, onCleanup } from 'solid-js';

import { cx } from '../design/cx';
import {
  closeSheet,
  cycleSheet,
  type Detent,
  type Detents,
  largestDetent,
  setSheetDetent,
  sheetDetent,
  sheetSlides,
} from '../state/layout';
import { dragFromContent } from './contentDrag';
import { trackPull } from './pull';
import { grabberShown, type SheetStop, settle, sheetFrame, sheetStops } from './sheetMotion';

import s from './Sheet.module.css';

/** The share of the screen's height a sheet fills at its medium detent. */
const MEDIUM_SHARE = 0.33;

/** The height of each detent, within the room the sheet may fill. */
const DETENT_HEIGHT: Record<Detent, string> = {
  medium: `min(${MEDIUM_SHARE * 100}dvh, 100%)`,
  large: '100%',
};

type Frame = ReturnType<typeof sheetFrame>;

/** What a drag needs to know of the sheet when it starts: how much of it shows, and where it may rest. */
function measure(sheet: Element, detents: Detents) {
  const room = sheet.parentElement?.getBoundingClientRect() ?? sheet.getBoundingClientRect();
  const heights = { medium: Math.min(MEDIUM_SHARE * innerHeight, room.height), large: room.height };
  return {
    shown: room.bottom - sheet.getBoundingClientRect().top,
    smallest: heights[detents[0]],
    largest: heights[largestDetent(detents)],
    stops: sheetStops(detents, heights),
  };
}

/**
 * A drag on a sheet: it measures the sheet where the pointer lands, moves it with the pointer,
 * and lets it settle where the flick carries it. A tap takes it to its next detent.
 */
function dragSheet(detents: () => Detents, onFrame: (frame: Frame | null) => void) {
  let start = { shown: 0, smallest: 0, largest: 0, stops: [] as SheetStop[] };
  let extent = 0;
  const pull = trackPull({
    tap: cycleSheet,
    drag: (travel) => {
      extent = start.shown + travel;
      onFrame(sheetFrame(extent, start.smallest, start.largest));
    },
    release: (velocity) => {
      const detent = settle(extent, velocity, start.stops);
      onFrame(null);
      if (detent === null) closeSheet();
      else setSheetDetent(detent);
    },
  });
  return {
    ...pull,
    down(sheet: Element, y: number, t: number): void {
      start = measure(sheet, detents());
      pull.down(y, t);
    },
  };
}

type SheetDrag = ReturnType<typeof dragSheet>;

/** The grabber, which a tap or a drag works. */
function Grip(props: { drag: SheetDrag }) {
  return (
    <button
      type="button"
      class={s.grip}
      aria-label="Resize the sheet"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const sheet = e.currentTarget.parentElement;
        if (sheet) props.drag.down(sheet, e.clientY, e.timeStamp);
      }}
      onPointerMove={(e) => props.drag.move(e.clientY, e.timeStamp)}
      onPointerUp={(e) => props.drag.up(e.clientY, e.timeStamp)}
      onPointerCancel={(e) => props.drag.up(e.clientY, e.timeStamp)}
      onClick={() => props.drag.click()}
    >
      <span class={s.handle} />
    </button>
  );
}

/**
 * On a phone, a bottom sheet that rests at its detents, as SwiftUI's presentation detents: it
 * slides up when shown and down when hidden, its grabber drags it, and so does its content where
 * the content would not scroll, and it settles at the detent its flick carries it to. Elsewhere a
 * plain box.
 */
export function Sheet(props: {
  detents: Detents;
  shown: boolean;
  class?: string | undefined;
  children: JSX.Element;
}) {
  const [frame, setFrame] = createSignal<Frame | null>(null);
  const drag = dragSheet(() => props.detents, setFrame);
  const atLargest = () => sheetDetent() === largestDetent(props.detents);
  const grabber = () => grabberShown(props.detents);
  const style = () => {
    const f = frame();
    return f
      ? { '--sheet-height': `${f.height}px`, '--sheet-shift': `${f.shift}px` }
      : { '--sheet-height': DETENT_HEIGHT[sheetDetent()] };
  };
  return (
    <div
      ref={(node) => onCleanup(dragFromContent(node, drag, atLargest))}
      class={cx(
        s.sheet,
        props.class,
        !props.shown && s.hidden,
        sheetSlides() && s.slides,
        !grabber() && s.bare,
        frame() && s.dragging,
      )}
      style={style()}
    >
      {grabber() && <Grip drag={drag} />}
      {props.children}
    </div>
  );
}
