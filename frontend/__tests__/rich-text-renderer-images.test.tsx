import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RichTextRenderer from "@/components/RichTextRenderer";

describe("RichTextRenderer images", () => {
  it("normalizes embedded headings so descriptions cannot add page h1s", () => {
    render(<RichTextRenderer html="<h1>Overview</h1><h3>Details</h3>" />);

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
  });

  it("renders sanitized rich text images with lazy loading attributes", async () => {
    const { container } = render(
      <RichTextRenderer
        html='<p>Preview</p><img src="https://example.com/job.png" alt="Job attachment" onerror="alert(1)" />'
      />,
    );

    const image = await screen.findByAltText("Job attachment");

    expect(image).toHaveAttribute("src", "https://example.com/job.png");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("width", "800");
    expect(image).toHaveAttribute("height", "450");
    expect(image).not.toHaveAttribute("onerror");
    expect(container).toHaveTextContent("Preview");
  });

  it("shows a fallback when an embedded image fails to load", async () => {
    render(
      <RichTextRenderer html='<img src="https://example.com/missing.png" alt="Wireframe" />' />,
    );

    fireEvent.error(await screen.findByAltText("Wireframe"));

    expect(screen.getByText("Image unavailable: Wireframe")).toBeInTheDocument();
  });
});
