/** The decisions of a visual test run, apart from the browser that takes its images. */

/** Shots alike in a row that show a page has settled: two can be one slow frame shot twice. */
const SETTLED_SHOTS = 3;

const trimmed = (filter: string) => filter.replace(/\/+$/, '');

const taking = (filter: string, name: string) => name === filter || name.startsWith(`${filter}/`);

/** Whether a name is among those `only` asks for: a name, or a folder; all of them without it. */
export const filterOf =
  (only: readonly string[] | undefined) =>
  (name: string): boolean =>
    !only || only.some((filter) => taking(trimmed(filter), name));

interface Settling {
  pause: () => Promise<void>;
  /** The further shots to take before giving up. */
  tries: number;
}

/** A shot once `SETTLED_SHOTS` in a row match: a frame may still be on its way to the canvas. */
export async function settled(
  shoot: () => Promise<Buffer>,
  { pause, tries }: Settling,
): Promise<Buffer> {
  const next = async (last: Buffer, alike: number, left: number): Promise<Buffer> => {
    if (alike === SETTLED_SHOTS) return last;
    if (left === 0) throw new Error('the scope did not settle');
    await pause();
    const shot = await shoot();
    return next(shot, shot.equals(last) ? alike + 1 : 1, left - 1);
  };
  return next(await shoot(), 1, tries);
}
