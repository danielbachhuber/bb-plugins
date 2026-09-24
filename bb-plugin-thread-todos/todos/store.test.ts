import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, TodoStore } from "./store.js";

function makeStore(now = 1_000) {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return { db, store: new TodoStore(db, { now: () => now }) };
}

describe("TodoStore", () => {
  it("exports every item, grouped by thread in position order", () => {
    const { db, store } = makeStore();
    const insert = db.prepare(
      `INSERT INTO todos (id, threadId, text, status, source, position, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, 2)`,
    );
    insert.run("b", "t1", "Second", "done", "agent", 2);
    insert.run("a", "t1", "First", "open", "user", 1);
    insert.run("c", "t2", "Other", "open", "agent", 1);

    expect(store.all().map((todo) => [todo.threadId, todo.id, todo.status, todo.source])).toEqual([
      ["t1", "a", "open", "user"],
      ["t1", "b", "done", "agent"],
      ["t2", "c", "open", "agent"],
    ]);
  });

  it("remembers the last forwarded call", () => {
    const { store } = makeStore(5_000);
    expect(store.lastUsed()).toBeNull();
    store.markUsed("t1", "add");
    store.markUsed("t2", "todo_complete");
    expect(store.lastUsed()).toEqual({ at: 5_000, threadId: "t2", via: "todo_complete" });
  });
});
