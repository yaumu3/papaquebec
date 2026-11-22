import { cycle } from '../lib/cycle';
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
  /** The line for assistive tech, values spelled out. */
  spoken: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function pageLine(page: InfoPage, r: Readouts): InfoLine {
  const base = { key: page, label: '', unit: '', cls: null };
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
    spoken: notice.text,
  };
}

/** What a tap on the info block leaves the page as: the next, unless a notice holds the line. */
export function tapInfoBlock(page: InfoPage, notice: Notice | null): InfoPage {
  return notice ? page : cycle(INFO_PAGES, page);
}

export function infoBlockLabel(clock: string, line: InfoLine): string {
  return `${clock}, ${line.spoken}`;
}

/** The line showing and the one it took over from, which rolls away. */
export interface Roll {
  now: InfoLine;
  was: InfoLine | null;
}

/** The roll after a new line: the old line rolls away only when what the line shows has changed. */
export function rolled(prev: Roll | undefined, line: InfoLine): Roll {
  if (!prev) return { now: line, was: null };
  return { now: line, was: prev.now.key === line.key ? prev.was : prev.now };
}
