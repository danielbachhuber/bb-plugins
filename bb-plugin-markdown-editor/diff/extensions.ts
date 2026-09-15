// Which files this plugin claims.
//
// The `fileOpener` registration and the diff-header content script both need
// this list, and they must never disagree: a pencil on a file the opener does
// not claim would open bb's own preview instead of this editor, which looks
// like the button is broken.
export const EDITABLE_EXTENSIONS = ["md", "mdx", "markdown", "txt"] as const;

/**
 * The extension of a path, lowercased, or null when it has none.
 *
 * A leading dot is not an extension: `.gitignore` is a whole filename, and
 * treating `gitignore` as its type is how a dotfile ends up claimed by a
 * plugin that cannot render it.
 */
export function extensionOf(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return name.slice(dot + 1).toLowerCase();
}

/** Whether this plugin's `fileOpener` would claim `path`. */
export function isEditablePath(path: string): boolean {
  const extension = extensionOf(path);
  return (
    extension !== null &&
    (EDITABLE_EXTENSIONS as readonly string[]).includes(extension)
  );
}
