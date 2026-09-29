// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { NoteBox, NoteField } from "./note";

afterEach(cleanup);

describe("NoteField", () => {
  it("saves the trimmed text on Enter", () => {
    const onSave = vi.fn(async () => true);
    render(<NoteField initial="" onSave={onSave} onCancel={() => {}} />);
    const field = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(field, { target: { value: "  Check the hinge  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("Check the hinge");
  });

  it("cancels on Escape", () => {
    const onSave = vi.fn(async () => true);
    const onCancel = vi.fn();
    render(<NoteField initial="Old" onSave={onSave} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Note" }), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves an emptied field as the empty string, which deletes the note", () => {
    const onSave = vi.fn(async () => true);
    render(<NoteField initial="Old" onSave={onSave} onCancel={() => {}} />);
    const field = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("");
  });
});

describe("NoteBox", () => {
  it("draws nothing without a note", () => {
    const { container } = render(<NoteBox note={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts the note with Next", () => {
    render(<NoteBox note="Ask about the hinge" />);
    expect(screen.getByText("Ask about the hinge").textContent).toBe("Next Ask about the hinge");
  });
});
