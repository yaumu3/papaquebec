/** The widths, CSS px, that decide where the detail header's advisory stands. */
export interface HeaderWidths {
  /** The flight's line as wide as its text, which is never cut. */
  flight: number;
  /** The gap between the flight and the advisory. */
  gap: number;
  /** The advisory, 0 when there is none. */
  advisory: number;
  /** The width of the header. */
  room: number;
}

/** Whether the advisory moves to the second line: the first has no room for it beside the flight. */
export function advisoryBelow({ flight, gap, advisory, room }: HeaderWidths): boolean {
  return advisory > 0 && flight + gap + advisory > room;
}
