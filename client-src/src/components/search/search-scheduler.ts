/** Shared timing for all search fields; composition updates never submit. */
export function createSearchScheduler(submit: (value: string) => void, delay = 200) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let composing = false;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const flush = (value: string) => { cancel(); if (!composing) submit(value.trim()); };
  const change = (value: string) => {
    cancel();
    if (composing) return;
    if (!value.trim()) { flush(value); return; }
    timer = setTimeout(() => flush(value), delay);
  };
  return {
    change, flush, cancel,
    compositionStart() { composing = true; cancel(); },
    compositionEnd(value: string) { composing = false; change(value); },
  };
}
