import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import QueuePanel from "@/components/studio/QueuePanel";
import * as api from "@/lib/api";
import type { AutoDjQueueItem, QueueItem } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    reorderQueue: vi.fn().mockResolvedValue({ items: [], nowPlaying: null }),
    removeFromQueue: vi.fn().mockResolvedValue({ items: [], nowPlaying: null }),
  };
});

function item(id: string, title: string): QueueItem {
  return {
    id,
    track: { id: `tr-${id}`, title, artist: "X", album: null, type: "song", duration: 100, artworkUrl: null },
    requestedBy: null,
    status: "pending",
    position: 0,
    addedAt: new Date().toISOString(),
  };
}

function autodjItem(id: string, title: string): AutoDjQueueItem {
  return {
    id,
    source: "autodj",
    kind: "song",
    track: {
      id: `tr-${id}`,
      title,
      artist: "Auto",
      album: null,
      type: "song",
      duration: 120,
      artworkUrl: null,
    },
    position: 0,
  };
}

describe("QueuePanel — drag reorder & remove call the Phase 3 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drag-reordering posts the new order to reorderQueue", async () => {
    const items = [item("a", "Alpha"), item("b", "Beta"), item("c", "Gamma")];
    render(<QueuePanel items={items} onChanged={() => {}} />);

    const first = screen.getByTestId("queue-item-a");
    const third = screen.getByTestId("queue-item-c");

    fireEvent.dragStart(first);
    fireEvent.dragOver(third);
    fireEvent.drop(third);

    await waitFor(() => expect(api.reorderQueue).toHaveBeenCalledTimes(1));
    expect(api.reorderQueue).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("removing an item calls removeFromQueue with its id", async () => {
    const items = [item("a", "Alpha"), item("b", "Beta")];
    render(<QueuePanel items={items} onChanged={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Remove Beta/ }));
    await waitFor(() => expect(api.removeFromQueue).toHaveBeenCalledWith("b"));
  });

  it("renders source badges (USER for songs, BREAK for jingles)", () => {
    const song = item("a", "Song");
    const jingle = item("b", "Jingle");
    jingle.track!.type = "jingle";
    render(<QueuePanel items={[song, jingle]} onChanged={() => {}} />);
    expect(screen.getByText("USER")).toBeInTheDocument();
    expect(screen.getByText("BREAK")).toBeInTheDocument();
  });

  it("renders AutoDJ preview items when autopilot is on", () => {
    render(
      <QueuePanel
        items={[]}
        autodjItems={[autodjItem("auto-a", "Rotation A")]}
        autopilot
      />
    );
    expect(screen.getByText("AutoDJ rotation")).toBeInTheDocument();
    expect(screen.getByText("Rotation A")).toBeInTheDocument();
    expect(screen.getByText("AUTO")).toBeInTheDocument();
    expect(screen.queryByText(/Queue is empty/)).not.toBeInTheDocument();
  });
});
