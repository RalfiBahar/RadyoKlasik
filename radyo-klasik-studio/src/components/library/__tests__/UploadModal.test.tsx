import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UploadModal from "@/components/library/UploadModal";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, uploadTrack: vi.fn() };
});

describe("UploadModal — drag-drop upload wires to Phase 1 ingest", () => {
  beforeEach(() => {
    (api.uploadTrack as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "t1",
      title: "Test",
      type: "song",
      artworkUrl: null,
      artist: null,
      album: null,
      duration: 3,
    });
  });

  it("uploads a selected file with the chosen type + tags and calls onUploaded", async () => {
    const onUploaded = vi.fn();
    render(<UploadModal onClose={() => {}} onUploaded={onUploaded} />);

    const file = new File(["abc"], "tone.mp3", { type: "audio/mpeg" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText("tone.mp3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Upload/ }));

    await waitFor(() => expect(api.uploadTrack).toHaveBeenCalledTimes(1));
    const fd = (api.uploadTrack as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
    expect(fd.get("type")).toBe("song");
    expect((fd.get("file") as File).name).toBe("tone.mp3");

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("ignores non-audio files dropped on the dropzone", () => {
    render(<UploadModal onClose={() => {}} onUploaded={() => {}} />);
    const dropzone = screen.getByTestId("dropzone");
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });
});
