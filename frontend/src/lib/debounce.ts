/**
 * Debounce helper — collapses rapid calls into one, fired after the
 * caller stops calling for `wait` ms. Used to throttle noisy inputs
 * (e.g. markup % typed character-by-character) before POSTing to the
 * server.
 *
 * The returned function has a `.flush()` method that fires the
 * pending call immediately (useful for beforeunload).
 */

export interface DebouncedFn<A extends unknown[]> {
  (...args: A): void;
  flush: () => void;
  cancel: () => void;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): DebouncedFn<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const wrapped = ((...args: A) => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }, wait);
  }) as DebouncedFn<A>;

  wrapped.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }
  };

  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  return wrapped;
}
