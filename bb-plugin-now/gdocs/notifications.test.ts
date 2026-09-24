import { describe, expect, test } from "vitest";

import { newPosts, parseDocsEmail, postLine, shortHeadline, summarizeDocs, textOf } from "./notifications.js";

/** A post as Google lays it out: the author in an `<h3>`, a time, a New badge, the words. */
function post(author: string, text: string, isNew = false) {
  return (
    `<div style="margin-top: 0px;" class="non-tombstone-post"><table><tr><td><img src="avatar.png"></td><td>` +
    `<h3 style="display: inline-block;">${author}</h3> <span style="color: #5F6368;">• 10:25 AM, Sep 24 (PDT)</span>` +
    (isNew ? `<h4 style="background: #0B57D0;">New</h4>` : "") +
    `<div style="font: 400 14px Roboto;"><div style="margin-top: 6px;" class="notranslate">${text}</div></div></td></tr></table></div>`
  );
}

function discussion(anchor: string, posts: string[], disco: string) {
  return (
    `<div class="document-content-snippet" style="border: 1px solid #DADCE0;"><span class="notranslate" style="font: 400 14px Roboto;">${anchor}</span></div>` +
    posts.join("") +
    `<div class="posts-section-end"></div><a href="mailTo:Reply">Reply</a>` +
    `<a href="https://docs.google.com/document/d/doc123/edit?disco=${disco}&amp;usp=comment_email_discussion" class="material-button">Open</a>`
  );
}

function email(headline: string, discussions: string[], kind = "document") {
  return (
    `<html><body><h1 style="font: 400 20px Google Sans;">${headline}</h1>` +
    `<a href="https://docs.google.com/${kind}/d/doc123/edit?usp=comment_email_document"><div><span><img src="icon.png"></span>Widget launch plan</div></a>` +
    `<h2>${discussions.length} comments</h2>${discussions.join("")}</body></html>`
  );
}

describe("parseDocsEmail", () => {
  test("reads the document, each discussion's passage, and who wrote what", () => {
    const parsed = parseDocsEmail(
      email("Octocat (octocat@example.com) mentioned you in a comment in the following document", [
        discussion("Ship widgets in October", [post("Hubber", "Is October still right?"), post("Octocat", `@<a href="mailto:you@example.com">you@example.com</a> Fair to say this moved?`, true)], "AAA1"),
      ]),
    );
    expect(parsed).toEqual({
      headline: "Octocat mentioned you in a comment",
      mentioned: true,
      app: "docs",
      documentId: "doc123",
      title: "Widget launch plan",
      url: "https://docs.google.com/document/d/doc123/edit?usp=comment_email_document",
      discussions: [
        {
          anchor: "Ship widgets in October",
          posts: [
            { author: "Hubber", text: "Is October still right?", isNew: false },
            { author: "Octocat", text: "@you@example.com Fair to say this moved?", isNew: true },
          ],
          url: "https://docs.google.com/document/d/doc123/edit?disco=AAA1&usp=comment_email_discussion",
        },
      ],
    });
  });

  test("reads a comment on the whole document, which has no passage", () => {
    const whole = `<div class="non-tombstone-post"><h3>Hubber</h3> <span>• 8:30 AM, Sep 24 (PDT)</span><h4>New</h4><div class="notranslate">+ gadgets?</div></div><div class="posts-section-end"></div>`;
    const parsed = parseDocsEmail(email("Hubber added a comment to the following document", [whole]));
    expect(parsed?.discussions).toEqual([{ anchor: null, posts: [{ author: "Hubber", text: "+ gadgets?", isNew: true }], url: null }]);
  });

  test("tells Slides and Sheets from Docs by the link", () => {
    expect(parseDocsEmail(email("Hubber added a comment to the following document", [], "presentation"))?.app).toBe("slides");
    expect(parseDocsEmail(email("Hubber added a comment to the following document", [], "spreadsheets"))?.app).toBe("sheets");
  });

  test("is null for an email not laid out as one", () => {
    expect(parseDocsEmail("<html><body><p>Lunch?</p></body></html>")).toBeNull();
  });
});

describe("summarizeDocs", () => {
  test("gives the headline, then the new comments, and counts resolutions apart", () => {
    const parsed = parseDocsEmail(
      email("New activity in the following document", [
        discussion("Widgets", [post("Hubber", "Old"), post("Octocat", "Yes, updated!", true), post("Octocat", "<i>Marked as resolved</i>", true)], "A"),
        discussion("Gadgets", [post("Hubber", "Rejected suggestion", true)], "B"),
      ]),
    )!;
    const posts = newPosts([parsed]);
    expect(summarizeDocs(parsed, posts)).toBe("New activity · 1 new comment from Octocat · 1 resolved");
    expect(posts.map(postLine)).toEqual(["Yes, updated!", "resolved the comment", "rejected a suggestion"]);
    // Each keeps the link to its own discussion.
    expect(posts.map((post) => post.url?.match(/disco=(\w+)/)?.[1])).toEqual(["A", "A", "B"]);
  });

  test("does not repeat a post that two emails both call new", () => {
    const parsed = parseDocsEmail(email("New activity in the following document", [discussion("Widgets", [post("Octocat", "Hi", true)], "A")]))!;
    expect(newPosts([parsed, parsed])).toHaveLength(1);
  });
});

describe("textOf", () => {
  test("keeps inline markup's words together and drops a tag cut off at the end", () => {
    expect(textOf(`@<a href="x">octocat</a> hi<br>there <div style="word-break`)).toBe("@octocat hi there");
  });
});

describe("shortHeadline", () => {
  test("drops the address and the trailing 'the following document'", () => {
    expect(shortHeadline("Hubber added a comment to the following document")).toBe("Hubber added a comment");
    expect(shortHeadline("New activity in the following document")).toBe("New activity");
  });
});
