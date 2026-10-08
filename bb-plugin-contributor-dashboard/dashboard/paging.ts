// Where one page of a long list starts and ends.

/** Rows per page of a person's pull requests. */
export const PAGE_SIZE = 25;

export interface Page {
  /** The page actually shown, clamped into range. */
  page: number;
  pages: number;
  /** The first and last row numbers on it, counting from 1; 0 when empty. */
  from: number;
  to: number;
  offset: number;
}

/**
 * The page to show. `wanted` is clamped, because the period picker can
 * shorten the list under a reader who is on its last page.
 */
export function pageOf(total: number, wanted: number, size = PAGE_SIZE): Page {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(0, Math.trunc(wanted)), pages - 1);
  const offset = page * size;
  return {
    page,
    pages,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(total, offset + size),
    offset,
  };
}
