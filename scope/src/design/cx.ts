/** Joins the class names that are set; CSS module lookups may be undefined under strict indexing. */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');
