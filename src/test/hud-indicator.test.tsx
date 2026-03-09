import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HudIndicator from "@/components/HudIndicator";

describe("HudIndicator", () => {
  it("renders accessible status without visible state label", () => {
    render(<HudIndicator state="idle" />);
    expect(
      screen.getByRole("status", { name: /HUD EM ESPERA/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/EM ESPERA/i)).not.toBeInTheDocument();
  });
});
