// The parts of the start-thread dialog with no React or bb in them, so a test
// can import them alone.

/**
 * Marks a composer whose environment the plugin has already decided. A content
 * script hides the pickers inside it; see `FIXED_ENVIRONMENT_CSS`.
 */
export const FIXED_ENVIRONMENT_ATTRIBUTE = "data-sweep-fixed-environment";

/**
 * The composer's project, environment, machine and branch pickers, matched by
 * their accessible labels, which are the only stable handles bb gives them.
 */
export const BB_PICKER_SELECTORS = [
  'button[aria-label^="Project"]',
  'button[aria-label="Environment"]',
  'button[aria-label="Machine"]',
  'button[aria-label="Branch"]',
] as const;

export const FIXED_ENVIRONMENT_CSS = `[${FIXED_ENVIRONMENT_ATTRIBUTE}] :is(${BB_PICKER_SELECTORS.join(", ")}) { display: none !important; }`;

/**
 * A 32-bit digest of the seeded text, as a short base-36 string. Not a
 * checksum anyone depends on, just enough to tell one seeding from another.
 */
function digest(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * The key bb persists the dialog's draft under.
 *
 * Per row, so editing one row's steer does not leak into the next row's. Per
 * seeding as well, because `initialPrompt` only seeds a draft that is still
 * empty: without the digest, a draft saved from an earlier open shadows the
 * seed forever, and a row whose prompt has changed keeps showing the old text
 * with no way back. So an edit survives reopening the same row while the seed
 * is the same, and is dropped once it is not.
 */
export function draftKeyFor(row: string, seededPrompt: string | undefined): string {
  return seededPrompt ? `${row}:${digest(seededPrompt)}` : row;
}
