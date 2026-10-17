import { describe, expect, it } from 'bun:test';

import { scrollView } from './scroll';

describe('scrollView', () => {
  it('has no thumb and cuts nothing when the lanes fit', () => {
    // Arrange
    const fits = { top: 0, client: 340, height: 340 };

    // Act
    const view = scrollView(fits.top, fits.client, fits.height);

    // Assert
    expect(view).toEqual({ thumb: null, cutTop: false, cutBottom: false });
  });

  it('sizes the thumb as the share in view, at the top, the middle and the end', () => {
    // Arrange
    const tops = [0, 150, 300];

    // Act
    const views = tops.map((top) => scrollView(top, 300, 600));

    // Assert
    expect(views).toEqual([
      { thumb: { top: 0, height: 150 }, cutTop: false, cutBottom: true },
      { thumb: { top: 75, height: 150 }, cutTop: true, cutBottom: true },
      { thumb: { top: 150, height: 150 }, cutTop: true, cutBottom: false },
    ]);
  });

  it('keeps the thumb long enough to see, however much there is to scroll, its end at the end', () => {
    // Arrange
    const tall = { top: 9900, client: 100, height: 10_000 };

    // Act
    const view = scrollView(tall.top, tall.client, tall.height);

    // Assert
    expect(view.thumb).toEqual({ top: 84, height: 16 });
  });
});
