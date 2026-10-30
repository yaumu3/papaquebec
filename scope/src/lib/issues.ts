/** Where a document fails its schema: a path to the fault and what is wrong there. */
export interface Issue {
  path: readonly PropertyKey[];
  message: string;
}

const SHOWN_ISSUES = 3;

const pathOf = (path: readonly PropertyKey[]): string =>
  path.reduce<string>(
    (acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)),
    '',
  );

/** The first few issues with their paths, then how many more there are. */
export function describeIssues(issues: readonly Issue[]): string {
  const lines = issues
    .slice(0, SHOWN_ISSUES)
    .map((i) => (i.path.length ? `${pathOf(i.path)}: ${i.message}` : i.message));
  const more = issues.length - lines.length;
  return lines.join('; ') + (more > 0 ? `; and ${more} more` : '');
}
