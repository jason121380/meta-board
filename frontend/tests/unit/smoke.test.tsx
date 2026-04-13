import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "@/App";

describe("App scaffold", () => {
  it("renders the LoginView while FB SDK is loading (checking state)", () => {
    render(<App />);
    // Both the dark brand panel AND the right login card say METADASH,
    // so use getAllByText and assert on the count.
    const headings = screen.getAllByText(/METADASH/i);
    expect(headings.length).toBeGreaterThanOrEqual(2);
    // Tagline renders only in the auth-checking state
    expect(screen.getByText(/META 廣告管理平台/)).toBeInTheDocument();
  });
});
