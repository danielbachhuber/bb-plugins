// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { NoteBox, NoteField } from "./note";

afterEach(cleanup);

describe("NoteField", () => {
  it("saves the trimmed text on Enter", () => {
    const onSave = vi.fn(async () => true);
    render(<NoteField initial="" onSave={onSave} onCancel={() => {}} />);
    const field = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(field, { target: { value: "  Check the hinge  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("Check the hinge", false);
  });

  it("cancels on Escape", () => {
    const onSave = vi.fn(async () => true);
    const onCancel = vi.fn();
    render(<NoteField initial="Old" onSave={onSave} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Note" }), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves from the Save button and cancels from the Cancel button", async () => {
    const onSave = vi.fn(async () => true);
    const onCancel = vi.fn();
    render(<NoteField initial="Old" onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("New", false);
    // Cancel waits out the save it would otherwise race.
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("saves an emptied field as the empty string, which deletes the note", () => {
    const onSave = vi.fn(async () => true);
    render(<NoteField initial="Old" onSave={onSave} onCancel={() => {}} />);
    const field = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("", false);
  });
});

describe("NoteField's On hold box", () => {
  it("draws no checkbox unless asked", () => {
    render(<NoteField initial="" onSave={async () => true} onCancel={() => {}} />);
    expect(screen.queryByRole("checkbox", { name: "On hold" })).toBeNull();
  });

  it("starts as given and saves what it was changed to", () => {
    const onSave = vi.fn(async () => true);
    render(<NoteField initial="Waiting on #31" initialOnHold={false} onSave={onSave} onCancel={() => {}} />);
    const box = screen.getByRole("checkbox", { name: "On hold" });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Waiting on #31", true);
  });

  it("can be cleared to take an issue off hold", () => {
    const onSave = vi.fn(async () => true);
    render(<NoteField initial="" initialOnHold onSave={onSave} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "On hold" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("", false);
  });
});

describe("NoteBox", () => {
  it("says On hold before the note of a held row", () => {
    render(<NoteBox note="Waiting on #31" onHold />);
    expect(screen.getByRole("paragraph").textContent).toBe("On hold · Waiting on #31");
  });

  it("draws no clear button unless asked", () => {
    render(<NoteBox note="Waiting on #31" />);
    expect(screen.queryByRole("button", { name: "Clear note" })).toBeNull();
  });

  it("calls onClear from its clear button", () => {
    const onClear = vi.fn();
    render(<NoteBox note="Waiting on #31" onHold onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear note" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("says On hold alone for a held row with no note", () => {
    render(<NoteBox note={null} onHold />);
    expect(screen.getByRole("paragraph").textContent).toBe("On hold");
  });

  it("draws nothing without a note", () => {
    const { container } = render(<NoteBox note={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the note as written, with no label before it", () => {
    render(<NoteBox note="Ask about the hinge" />);
    expect(screen.getByText("Ask about the hinge").textContent).toBe("Ask about the hinge");
  });
});
