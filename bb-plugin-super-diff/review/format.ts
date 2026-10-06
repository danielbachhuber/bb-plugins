// What `bb super-diff hunks` prints. Pure.
import { isMechanical } from "./classify";
import { itemsOf } from "./items";
import { itemKey, type DiffFile } from "./types";

const STATUS_LETTER = { added: "A", deleted: "D", modified: "M", renamed: "R" } as const;

export function formatHunkList(files: DiffFile[], options: { full: boolean; base: string }): string {
  const lines = [`${files.length} files, ${itemsOf(files).length} items against ${options.base}. Hunks are numbered from 0.`, ""];
  for (const file of files) {
    const name = file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path;
    const notes: string[] = [];
    if (file.hunks.length > 0) notes.push(`${file.hunks.length} ${file.hunks.length === 1 ? "hunk" : "hunks"}`);
    else notes.push(file.binary ? "binary, whole file" : "whole file");
    if (isMechanical(file.path)) notes.push("mechanical");
    lines.push(`${STATUS_LETTER[file.status]}  ${name}  (${notes.join(", ")})`);
    for (const hunk of file.hunks) {
      if (options.full) lines.push(`### ${itemKey(file.path, hunk.index)}`, hunk.text);
      else lines.push(`${String(hunk.index).padStart(6)}: ${hunk.header}`);
    }
  }
  return lines.join("\n");
}
