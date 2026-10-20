/** The shortest a scroll thumb gets, so that it stays in sight. */
const MIN_THUMB_PX = 16;
/** Less than this short of an end is at it, for a scroll that stops a fraction of a pixel off. */
const END_PX = 0.5;

/** How scrolled lanes show it: the thumb along the view, if they scroll, and which edges cut a lane. */
export interface ScrollView {
  thumb: { top: number; height: number } | null;
  cutTop: boolean;
  cutBottom: boolean;
}

/** The view of lanes `height` tall, `client` of them in view, scrolled `top` down. */
export function scrollView(top: number, client: number, height: number): ScrollView {
  const room = height - client;
  if (room <= END_PX) return { thumb: null, cutTop: false, cutBottom: false };
  const thumbHeight = Math.max(MIN_THUMB_PX, (client * client) / height);
  return {
    thumb: { top: ((client - thumbHeight) * top) / room, height: thumbHeight },
    cutTop: top > END_PX,
    cutBottom: top < room - END_PX,
  };
}
