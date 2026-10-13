import { describe, expect, it, vi } from "vitest";

const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success } }));
vi.mock("@get-bb/plugin-sdk/app", () => ({}));

const { announceStartedThread } = await import("./start-thread");

describe("announceStartedThread", () => {
  it("toasts instead of navigating, and goes to the thread only from the toast", () => {
    const toThread = vi.fn();
    announceStartedThread({ toThread }, "thr_1", "Started a thread for acme/widgets#7");

    expect(toThread).not.toHaveBeenCalled();
    const [message, options] = success.mock.calls[0];
    expect(message).toBe("Started a thread for acme/widgets#7");
    expect(options.action.label).toBe("Go to thread");

    options.action.onClick();
    expect(toThread).toHaveBeenCalledWith("thr_1");
  });
});
