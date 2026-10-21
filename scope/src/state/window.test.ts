import { describe, expect, it } from 'bun:test';

import {
  contactOf,
  DEFAULT_WINDOW,
  goLive,
  holdWindow,
  type Interval,
  type LanesWindow,
  MIN_WINDOW_SEC,
  readsPast,
  panWindow,
  resolveWindow,
  selectWindow,
  timeAt,
  xOf,
  zoomWindow,
} from './window';

/** A contact of ten minutes. */
const CONTACT: Interval = { from: 1000, to: 1600 };

describe('resolveWindow', () => {
  it('shows the whole of a long contact by default', () => {
    // Arrange
    const long: Interval = { from: 0, to: 1600 };

    // Act
    const visible = resolveWindow(DEFAULT_WINDOW, long);

    // Assert
    expect(visible).toEqual(long);
  });

  it('shows the whole of a contact shorter than the window', () => {
    // Arrange
    const brief: Interval = { from: 1500, to: 1600 };

    // Act
    const visible = resolveWindow(live(300), brief);

    // Assert
    expect(visible).toEqual(brief);
  });

  it('shows the minimum window ending now for a contact shorter than that', () => {
    // Arrange
    const brief: Interval = { from: 1590, to: 1600 };

    // Act
    const visible = resolveWindow(DEFAULT_WINDOW, brief);

    // Assert
    expect(visible).toEqual({ from: 1600 - MIN_WINDOW_SEC, to: 1600 });
  });

  it('keeps an unbounded window whole as the contact grows', () => {
    // Arrange
    const whole: LanesWindow = { kind: 'live', sec: Infinity };
    const grown: Interval = { from: 1000, to: 1700 };

    // Act
    const visible = [resolveWindow(whole, CONTACT), resolveWindow(whole, grown)];

    // Assert
    expect(visible).toEqual([CONTACT, grown]);
  });

  it('keeps a held window inside the contact as it is', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 1100, to: 1300 };

    // Act
    const visible = resolveWindow(held, CONTACT);

    // Assert
    expect(visible).toEqual({ from: 1100, to: 1300 });
  });

  it('slides a held window the contact has moved past to the start of the contact, keeping its length', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 900, to: 1030 };

    // Act
    const visible = resolveWindow(held, CONTACT);

    // Assert
    expect(visible).toEqual({ from: 1000, to: 1130 });
  });
});

describe('xOf and timeAt', () => {
  it('map a time across the width and back', () => {
    // Arrange
    const visible: Interval = { from: 1000, to: 1200 };

    // Act
    const [x, t] = [xOf(1050, visible, 300), timeAt(75, visible, 300)];

    // Assert
    expect([x, t]).toEqual([75, 1050]);
  });
});

describe('readsPast', () => {
  it('reads the past while peeking or held, the present only live and not peeking', () => {
    // Arrange
    const live: LanesWindow = { kind: 'live', sec: 300 };
    const held: LanesWindow = { kind: 'held', from: 1000, to: 1300 };
    const rows = [
      { peeking: false, w: live },
      { peeking: true, w: live },
      { peeking: false, w: held },
      { peeking: true, w: held },
    ];

    // Act
    const past = rows.map((r) => readsPast(r.peeking, r.w));

    // Assert
    expect(past).toEqual([false, true, true, true]);
  });
});

describe('holdWindow', () => {
  it('holds the window where it stands', () => {
    // Arrange
    const visible: Interval = { from: 1300, to: 1600 };

    // Act
    const w = holdWindow(visible);

    // Assert
    expect(w).toEqual({ kind: 'held', from: 1300, to: 1600 });
  });
});

describe('goLive', () => {
  it('goes live keeping the length', () => {
    // Arrange
    const visible: Interval = { from: 1000, to: 1200 };

    // Act
    const w = goLive(visible);

    // Assert
    expect(w).toEqual({ kind: 'live', sec: 200 });
  });
});

describe('contactOf', () => {
  it('runs from the first sample to now, and is empty at now without samples', () => {
    // Arrange
    const samples = [{ t: 1000 }, { t: 1100 }];

    // Act
    const contacts = [contactOf(samples, 1600), contactOf([], 1600)];

    // Assert
    expect(contacts).toEqual([
      { from: 1000, to: 1600 },
      { from: 1600, to: 1600 },
    ]);
  });
});

const live = (sec: number): LanesWindow => ({ kind: 'live', sec });

describe('zoomWindow', () => {
  const contact: Interval = { from: 0, to: 3600 };

  it('scales a live window about its right edge, down to the minimum', () => {
    // Arrange
    const rows = [
      { w: live(300), factor: 2 },
      { w: live(300), factor: 0.5 },
      { w: live(40), factor: 0.5 },
    ];

    // Act
    const zoomed = rows.map((r) =>
      zoomWindow(r.w, resolveWindow(r.w, contact), r.factor, 3000, contact),
    );

    // Assert
    expect(zoomed).toEqual([live(600), live(150), live(MIN_WINDOW_SEC)]);
  });

  it('widens to the whole contact and no further', () => {
    // Arrange
    const brief: Interval = { from: 3200, to: 3600 };

    // Act
    const zoomed = zoomWindow(live(300), resolveWindow(live(300), brief), 2, 3500, brief);

    // Assert
    expect(zoomed).toEqual(live(Infinity));
  });

  it('narrows from the whole contact and from a contact shorter than the window', () => {
    // Arrange
    const brief: Interval = { from: 3500, to: 3600 };
    const rows = [
      { w: live(Infinity), c: { from: 3200, to: 3600 }, factor: 0.5 },
      { w: live(300), c: brief, factor: 0.5 },
    ];

    // Act
    const zoomed = rows.map((r) => zoomWindow(r.w, resolveWindow(r.w, r.c), r.factor, 3600, r.c));

    // Assert
    expect(zoomed).toEqual([live(200), live(50)]);
  });

  it('keeps the instant under the pointer in place for a held window', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 1000, to: 1200 };
    const rows = [
      { pivot: 1100, factor: 0.5 },
      { pivot: 1000, factor: 2 },
    ];

    // Act
    const zoomed = rows.map((r) =>
      zoomWindow(held, { from: 1000, to: 1200 }, r.factor, r.pivot, contact),
    );

    // Assert
    expect(zoomed).toEqual([
      { kind: 'held', from: 1050, to: 1150 },
      { kind: 'held', from: 1000, to: 1400 },
    ]);
  });

  it('goes live when a held window reaches now, keeping its length', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 3400, to: 3500 };

    // Act
    const zoomed = zoomWindow(held, { from: 3400, to: 3500 }, 2, 3400, contact);

    // Assert
    expect(zoomed).toEqual(live(200));
  });

  it('slides a held window that would start before the contact to its start', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 100, to: 200 };
    const early: Interval = { from: 90, to: 3600 };

    // Act
    const zoomed = zoomWindow(held, { from: 100, to: 200 }, 4, 150, early);

    // Assert
    expect(zoomed).toEqual({ kind: 'held', from: 90, to: 490 });
  });

  it('goes live over the whole contact when a held window widens past it', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 1000, to: 1200 };
    const brief: Interval = { from: 900, to: 1300 };

    // Act
    const zoomed = zoomWindow(held, { from: 1000, to: 1200 }, 4, 1100, brief);

    // Assert
    expect(zoomed).toEqual(live(Infinity));
  });
});

describe('panWindow', () => {
  const contact: Interval = { from: 90, to: 3600 };

  it('leaves a live window as it is when asked to move toward now', () => {
    // Arrange
    const w: LanesWindow = { kind: 'live', sec: 300 };

    // Act
    const panned = panWindow(w, { from: 3300, to: 3600 }, 60, contact);

    // Assert
    expect(panned).toBe(w);
  });

  it('holds a live window that moves back', () => {
    // Arrange
    const w: LanesWindow = { kind: 'live', sec: 300 };

    // Act
    const panned = panWindow(w, { from: 3300, to: 3600 }, -60, contact);

    // Assert
    expect(panned).toEqual({ kind: 'held', from: 3240, to: 3540 });
  });

  it('moves a held window, live once it reaches now, held short of it', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 3300, to: 3500 };
    const visible: Interval = { from: 3300, to: 3500 };

    // Act
    const panned = [panWindow(held, visible, 50, contact), panWindow(held, visible, 200, contact)];

    // Assert
    expect(panned).toEqual([
      { kind: 'held', from: 3350, to: 3550 },
      { kind: 'live', sec: 200 },
    ]);
  });

  it('stops a held window at the start of the contact', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 100, to: 300 };

    // Act
    const panned = panWindow(held, { from: 100, to: 300 }, -50, contact);

    // Assert
    expect(panned).toEqual({ kind: 'held', from: 90, to: 290 });
  });
});

const heldWindow = (from: number, to: number): LanesWindow => ({ kind: 'held', from, to });

describe('selectWindow', () => {
  const contact: Interval = { from: 0, to: 2000 };
  const visible: Interval = { from: 1000, to: 1500 };

  it('holds the band between its ends, whichever way it was dragged', () => {
    // Arrange
    const rows = [
      { t0: 1100, t1: 1200 },
      { t0: 1200, t1: 1100 },
    ];

    // Act
    const windows = rows.map((r) => selectWindow(r.t0, r.t1, visible, contact));

    // Assert
    expect(windows).toEqual([heldWindow(1100, 1200), heldWindow(1100, 1200)]);
  });

  it('grows a band shorter than the minimum from its earlier end', () => {
    // Arrange
    const rows = [
      { t0: 1100, t1: 1110 },
      { t0: 1110, t1: 1100 },
    ];

    // Act
    const windows = rows.map((r) => selectWindow(r.t0, r.t1, visible, contact));

    // Assert
    expect(windows).toEqual([
      heldWindow(1100, 1100 + MIN_WINDOW_SEC),
      heldWindow(1100, 1100 + MIN_WINDOW_SEC),
    ]);
  });

  it('stays held to the right edge of a held window, and live to the right edge of a live one', () => {
    // Arrange
    const nowWindow: Interval = { from: 1700, to: 2000 };

    // Act
    const windows = [
      selectWindow(1300, 1500, visible, contact),
      selectWindow(1800, 2000, nowWindow, contact),
    ];

    // Assert
    expect(windows).toEqual([heldWindow(1300, 1500), { kind: 'live', sec: 200 }]);
  });

  it('goes live when a grown band reaches now', () => {
    // Arrange
    const nowWindow: Interval = { from: 1700, to: 2000 };

    // Act
    const w = selectWindow(1990, 2000, nowWindow, contact);

    // Assert
    expect(w).toEqual({ kind: 'live', sec: MIN_WINDOW_SEC });
  });

  it('keeps the band inside the visible window', () => {
    // Arrange
    const early = 900;

    // Act
    const w = selectWindow(early, 1100, visible, contact);

    // Assert
    expect(w).toEqual(heldWindow(1000, 1100));
  });
});
