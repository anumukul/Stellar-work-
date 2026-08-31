import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

import VoiceNav from "@/components/VoiceNav";

function makeMockRecognition() {
  return {
    continuous: false,
    interimResults: false,
    lang: "",
    start: vi.fn(),
    stop: vi.fn(),
    onresult: null as ((e: unknown) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    onend: null as (() => void) | null,
  };
}

describe("VoiceNav", () => {
  let mockRecognition: ReturnType<typeof makeMockRecognition>;

  beforeEach(() => {
    mockRecognition = makeMockRecognition();
    const Ctor = vi.fn(() => mockRecognition);
    Object.defineProperty(window, "SpeechRecognition", {
      value: Ctor,
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).SpeechRecognition;
  });

  it("renders microphone button when speech recognition is supported", () => {
    render(<VoiceNav />);
    expect(
      screen.getByRole("button", { name: /start voice navigation/i }),
    ).toBeInTheDocument();
  });

  it("does not render when speech recognition is unavailable", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).SpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webkitSpeechRecognition;
    const { container } = render(<VoiceNav />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts recognition and shows stop button on click", () => {
    render(<VoiceNav />);
    fireEvent.click(screen.getByRole("button", { name: /start voice navigation/i }));
    expect(mockRecognition.start).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: /stop voice navigation/i }),
    ).toBeInTheDocument();
  });

  it("navigates home on 'go home' command", () => {
    render(<VoiceNav />);
    fireEvent.click(screen.getByRole("button", { name: /start voice navigation/i }));

    mockRecognition.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        item: () => ({ isFinal: true, 0: { transcript: "go home" } }),
        0: { isFinal: true, 0: { transcript: "go home" } },
      },
    });

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("navigates to dashboard on 'go to dashboard' command", () => {
    render(<VoiceNav />);
    fireEvent.click(screen.getByRole("button", { name: /start voice navigation/i }));

    mockRecognition.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        item: () => ({ isFinal: true, 0: { transcript: "go to dashboard" } }),
        0: { isFinal: true, 0: { transcript: "go to dashboard" } },
      },
    });

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("shows status feedback after recognized command", () => {
    render(<VoiceNav />);
    fireEvent.click(screen.getByRole("button", { name: /start voice navigation/i }));

    // State updates fire inside the raw SpeechRecognition callback, which is
    // outside React's event system — wrap in act() so the render flushes.
    act(() => {
      mockRecognition.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          item: () => ({ isFinal: true, 0: { transcript: "post job" } }),
          0: { isFinal: true, 0: { transcript: "post job" } },
        },
      });
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows error message on microphone denial", () => {
    render(<VoiceNav />);
    fireEvent.click(screen.getByRole("button", { name: /start voice navigation/i }));

    act(() => {
      mockRecognition.onerror?.({ error: "not-allowed" });
    });

    expect(screen.getByRole("status")).toHaveTextContent("Microphone access denied");
  });

  it("button has aria-pressed=true while listening", () => {
    render(<VoiceNav />);
    const btn = screen.getByRole("button", { name: /start voice navigation/i });
    fireEvent.click(btn);
    expect(
      screen.getByRole("button", { name: /stop voice navigation/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
