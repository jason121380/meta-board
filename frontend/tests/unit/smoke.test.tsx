import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "@/App";

describe("App scaffold", () => {
  it("renders the METADASH brand header", () => {
    render(<App />);
    expect(screen.getByText(/METADASH/i)).toBeInTheDocument();
    expect(screen.getByText(/by LURE/i)).toBeInTheDocument();
  });
});
