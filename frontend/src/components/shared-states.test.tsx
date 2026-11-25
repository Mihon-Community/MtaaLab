import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessibleButton } from "./AccessibleButton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { OfflineBanner } from "./OfflineBanner";

describe("shared states", () => {
  it("announces loading text and hides the shimmer from assistive tech", () => {
    render(<LoadingState message="Checking your class assignments…" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your class assignments…",
    );
  });

  it("offers a retry action with an icon and accessible name", () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        message="We couldn't load your missions. Check your connection and try again."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check your connection and try again",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables the retry button while retrying", () => {
    render(<ErrorState message="Still offline" onRetry={() => {}} retrying />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  });

  it("renders an empty state with its action", () => {
    render(
      <EmptyState
        title="No missions are assigned to your class yet."
        description="When your teacher shares a mission, it will appear here."
        action={<button type="button">Refresh</button>}
      />,
    );

    expect(
      screen.getByText("No missions are assigned to your class yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("labels offline content as last confirmed instead of an error", () => {
    render(<OfflineBanner onRetry={() => {}} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Offline — showing last confirmed state",
    );
    expect(
      screen.getByRole("button", { name: /Reconnect/ }),
    ).toBeInTheDocument();
  });

  it("keeps the button label while substituting the pending text", () => {
    render(
      <AccessibleButton isLoading loadingLabel="Submitting…">
        Confirm decision & advance
      </AccessibleButton>,
    );

    const button = screen.getByRole("button", { name: /Submitting…/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
