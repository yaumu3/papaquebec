import type { Notice, Tone } from './feedLine';
import type { QnhStatus } from './qnhStatus';
import { INFO_PAGES, type InfoPage } from './settingsDefaults';

/** What the pages read from. */
export interface Readouts {
  qnh: QnhStatus;
  tracks: number;
  rate: number;
}

/** The second line of the nav bar's info block. */
export interface InfoLine {
  /** What the line shows; the line rolls when this changes. */
  key: InfoPage | 'notice';
  /** A label before the value; may be empty. */
  label: string;
  value: string;
  /** A unit after the value; may be empty. */
  unit: string;
  /** The value's tone. */
  cls: Tone | null;
  /** The lamp's tone: the feed notice's, or none. */
  lamp: Tone | null;
  /** The line for assistive tech, values spelled out. */
  spoken: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const NO_TONE = { cls: null, lamp: null };

function pageLine(page: InfoPage, r: Readouts): InfoLine {
  const base = { key: page, label: '', unit: '', ...NO_TONE };
  if (page === 'qnh') {
    const { value, cls } = r.qnh;
    return { ...base, label: 'QNH', value, cls, spoken: `QNH ${value} inches` };
  }
  if (page === 'tracks') {
    return {
      ...base,
      value: String(r.tracks),
      unit: 'TRK',
      spoken: plural(r.tracks, 'track', 'tracks'),
    };
  }
  return {
    ...base,
    value: String(r.rate),
    unit: 'msg/s',
    spoken: `${plural(r.rate, 'message', 'messages')} per second`,
  };
}

/** The line for a page; while there is a feed notice, the notice in place of the page's value. */
export function infoLine(page: InfoPage, r: Readouts, notice: Notice | null): InfoLine {
  if (!notice) return pageLine(page, r);
  return {
    key: 'notice',
    label: '',
    value: notice.text,
    unit: '',
    cls: notice.cls,
    lamp: notice.cls,
    spoken: notice.text,
  };
}

/** The page after this one; the first after the last. */
export function nextInfoPage(page: InfoPage): InfoPage {
  return INFO_PAGES[(INFO_PAGES.indexOf(page) + 1) % INFO_PAGES.length] ?? INFO_PAGES[0];
}

/** What a tap on the info block leaves the page as: the next, unless a notice holds the line. */
export function tapInfoBlock(page: InfoPage, notice: Notice | null): InfoPage {
  return notice ? page : nextInfoPage(page);
}

export function infoBlockLabel(clock: string, line: InfoLine): string {
  return `${clock}, ${line.spoken}`;
}
