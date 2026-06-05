// Move an item within an array from index `from` to index `to`, returning a new
// array. Used by the queue panel's drag-reorder before calling the reorder API.
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (
    from < 0 ||
    from >= next.length ||
    to < 0 ||
    to >= next.length ||
    from === to
  ) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
