import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LibraryView from "@/components/library/LibraryView";
import * as api from "@/lib/api";
import type { TrackListResponse } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, listTracks: vi.fn() };
});

function fixture(overrides: Partial<TrackListResponse> = {}): TrackListResponse {
  return {
    items: [
      {
        id: "t1",
        title: "Suite in A Major",
        artist: "Antonin Dvorak",
        album: "Unknown",
        type: "song",
        duration: 189,
        artworkUrl: null,
        tags: ["classical"],
      },
    ],
    page: 1,
    pageSize: 15,
    total: 1,
    counts: { all: 35, song: 29, jingle: 6, commercial: 0 },
    totalSizeMb: 418,
    ...overrides,
  };
}

describe("LibraryView — filters & search wire to the Phase 1 API", () => {
  beforeEach(() => {
    (api.listTracks as ReturnType<typeof vi.fn>).mockResolvedValue(fixture());
  });

  it("loads tracks on mount and shows type counts + rows", async () => {
    render(<LibraryView />);
    await waitFor(() => expect(api.listTracks).toHaveBeenCalled());
    expect(await screen.findByText("Suite in A Major")).toBeInTheDocument();
    // Type-count chips from the API response.
    expect(screen.getByText("29")).toBeInTheDocument(); // songs
    expect(screen.getByText("6")).toBeInTheDocument(); // jingles
  });

  it("filtering by type calls the API with that type", async () => {
    render(<LibraryView />);
    await waitFor(() => expect(api.listTracks).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Jingles/ }));

    await waitFor(() => {
      const calls = (api.listTracks as ReturnType<typeof vi.fn>).mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.type).toBe("jingle");
    });
  });

  it("typing in search calls the API with the debounced query", async () => {
    render(<LibraryView />);
    await waitFor(() => expect(api.listTracks).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Search library"), {
      target: { value: "bach" },
    });

    await waitFor(
      () => {
        const calls = (api.listTracks as ReturnType<typeof vi.fn>).mock.calls;
        const last = calls[calls.length - 1][0];
        expect(last.q).toBe("bach");
      },
      { timeout: 2000 }
    );
  });

  it("sorting by a column toggles sort/order params", async () => {
    render(<LibraryView />);
    await waitFor(() => expect(api.listTracks).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Artist/ }));
    await waitFor(() => {
      const calls = (api.listTracks as ReturnType<typeof vi.fn>).mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.sort).toBe("artist");
      expect(last.order).toBe("ASC");
    });
  });
});
