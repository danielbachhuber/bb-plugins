import { describe, expect, it } from "vitest";
import { addComment, addFollowUp, applyReply, conversation, markAsked, nextOpen, ordered, setState, summarize } from "./store";
import type { Comment } from "./types";

const NOW = "2026-09-14T10:00:00.000Z";

function seed(): Comment[] {
  let comments: Comment[] = [];
  comments = addComment(comments, {
    threadId: "thr_1",
    path: "src/a.ts",
    side: "new",
    line: 10,
    anchor: { text: "const a = 1;", before: null, after: null },
    body: "first",
    now: NOW,
    id: "c1",
  });
  comments = addComment(comments, {
    threadId: "thr_1",
    path: "src/b.ts",
    side: "new",
    line: 3,
    anchor: { text: "const b = 2;", before: null, after: null },
    body: "second",
    now: NOW,
    id: "c2",
  });
  return comments;
}

describe("addComment", () => {
  it("numbers comments in the order they were written", () => {
    const comments = seed();
    expect(comments.map((c) => c.seq)).toEqual([1, 2]);
  });

  it("starts a comment open with no reply", () => {
    const [first] = seed();
    expect(first!.state).toBe("open");
    expect(first!.reply).toBeNull();
  });

  it("keeps numbering above the highest existing seq, not the count", () => {
    // A removed comment must not let a later one reuse its number, or
    // "work through them in order" stops being stable.
    const comments = seed().filter((c) => c.id === "c2");
    const next = addComment(comments, {
      threadId: "thr_1",
      path: "src/c.ts",
      side: "new",
      line: 1,
      anchor: { text: "x", before: null, after: null },
      body: "third",
      now: NOW,
      id: "c3",
    });
    expect(next.find((c) => c.id === "c3")!.seq).toBe(3);
  });
});

describe("nextOpen", () => {
  it("returns the lowest-seq open comment", () => {
    expect(nextOpen(seed())!.id).toBe("c1");
  });

  it("skips past comments that are already addressed", () => {
    const comments = applyReply(seed(), "c1", "done that", NOW);
    expect(nextOpen(comments)!.id).toBe("c2");
  });

  it("is null when nothing is open", () => {
    let comments = applyReply(seed(), "c1", "a", NOW);
    comments = applyReply(comments, "c2", "b", NOW);
    expect(nextOpen(comments)).toBeNull();
  });
});

describe("applyReply", () => {
  it("records the reply and moves the comment to addressed", () => {
    const comments = applyReply(seed(), "c1", "renamed it", NOW);
    const first = comments.find((c) => c.id === "c1")!;
    expect(first.reply).toBe("renamed it");
    expect(first.state).toBe("addressed");
  });

  it("leaves other comments alone", () => {
    const comments = applyReply(seed(), "c1", "renamed it", NOW);
    expect(comments.find((c) => c.id === "c2")!.state).toBe("open");
  });

  it("returns the list unchanged for an unknown id", () => {
    const before = seed();
    expect(applyReply(before, "nope", "x", NOW)).toEqual(before);
  });

  it("can re-reply to an addressed comment that was reopened", () => {
    let comments = applyReply(seed(), "c1", "first try", NOW);
    comments = setState(comments, "c1", "open", NOW);
    comments = applyReply(comments, "c1", "second try", NOW);
    const first = comments.find((c) => c.id === "c1")!;
    expect(first.reply).toBe("second try");
    expect(first.state).toBe("addressed");
  });
});

describe("setState", () => {
  it("resolves a comment", () => {
    const comments = setState(seed(), "c1", "resolved", NOW);
    expect(comments.find((c) => c.id === "c1")!.state).toBe("resolved");
  });

  it("keeps the agent's reply when a comment is resolved", () => {
    let comments = applyReply(seed(), "c1", "renamed it", NOW);
    comments = setState(comments, "c1", "resolved", NOW);
    expect(comments.find((c) => c.id === "c1")!.reply).toBe("renamed it");
  });

  it("stamps updatedAt", () => {
    const later = "2026-09-14T11:00:00.000Z";
    const comments = setState(seed(), "c1", "resolved", later);
    expect(comments.find((c) => c.id === "c1")!.updatedAt).toBe(later);
  });
});

describe("markAsked", () => {
  it("records when the comment was sent to the agent, and leaves it open", () => {
    const later = "2026-09-14T11:00:00.000Z";
    const comment = markAsked(seed(), "c1", later).find((c) => c.id === "c1")!;
    expect(comment.askedAt).toBe(later);
    expect(comment.state).toBe("open");
  });

  it("keeps the subthread answering it", () => {
    const comment = markAsked(seed(), "c1", NOW, "thr_2").find((c) => c.id === "c1")!;
    expect(comment.askThreadId).toBe("thr_2");
  });

  it("is cleared by reopening, so the comment can be asked again", () => {
    let comments = markAsked(seed(), "c1", NOW, "thr_2");
    comments = applyReply(comments, "c1", "renamed it", NOW);
    comments = setState(comments, "c1", "open", NOW);
    const comment = comments.find((c) => c.id === "c1")!;
    expect(comment.askedAt).toBeNull();
    expect(comment.askThreadId).toBeNull();
  });

  it("is kept when the comment is resolved", () => {
    let comments = markAsked(seed(), "c1", NOW);
    comments = setState(comments, "c1", "resolved", NOW);
    expect(comments.find((c) => c.id === "c1")!.askedAt).toBe(NOW);
  });
});

describe("ordered", () => {
  it("sorts by seq regardless of storage order", () => {
    const comments = seed().slice().reverse();
    expect(ordered(comments).map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("summarize", () => {
  it("counts each state", () => {
    let comments = seed();
    comments = applyReply(comments, "c1", "x", NOW);
    expect(summarize(comments)).toEqual({ open: 1, addressed: 1, resolved: 0, total: 2 });
  });
});

describe("addFollowUp", () => {
  it("adds your reply after the answer and reopens the comment for the agent", () => {
    let comments = markAsked(applyReply(seed(), "c1", "renamed it", NOW), "c1", NOW, "thr_2");
    comments = addFollowUp(comments, "c1", "Why that name?", NOW);
    const comment = comments.find((c) => c.id === "c1")!;
    expect(comment.state).toBe("open");
    expect(comment.askedAt).toBeNull();
    // The subthread is kept, so the reply goes back to it.
    expect(comment.askThreadId).toBe("thr_2");
    expect(conversation(comment).map((m) => [m.author, m.body])).toEqual([
      ["agent", "renamed it"],
      ["you", "Why that name?"],
    ]);
  });

  it("keeps the latest answer in reply as the conversation grows", () => {
    let comments = applyReply(seed(), "c1", "first", NOW);
    comments = addFollowUp(comments, "c1", "and?", NOW);
    comments = applyReply(comments, "c1", "second", NOW);
    const comment = comments.find((c) => c.id === "c1")!;
    expect(comment.reply).toBe("second");
    expect(comment.state).toBe("addressed");
    expect(conversation(comment)).toHaveLength(3);
  });
});

describe("conversation", () => {
  it("reads a comment stored before messages existed from its reply", () => {
    const legacy = { ...seed()[0]!, reply: "old answer", messages: undefined };
    expect(conversation(legacy)).toEqual([{ author: "agent", body: "old answer", at: legacy.updatedAt }]);
  });
});
