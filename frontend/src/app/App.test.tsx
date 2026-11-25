import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("../services/supabase", () => ({
  getSupabaseClient: () => null,
}));

describe("App", () => {
  it("renders the learner game lobby", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "MtaaLab games" }),
    ).toBeInTheDocument();
  });
});
