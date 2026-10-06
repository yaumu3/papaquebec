/** Puts the text on the clipboard where the browser allows; silently nowhere else. */
export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}
