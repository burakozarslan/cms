import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImagePicker } from "@/app/dashboard/[projectId]/[collectionId]/image-picker";
import { ValueInput } from "@/app/dashboard/[projectId]/[collectionId]/value-input";
import { parseFieldConfig, type StoredFieldRow } from "@/lib/widgets";

const uploadImageAction = jest.fn();
jest.mock("@/app/dashboard/[projectId]/[collectionId]/image-upload-actions", () => ({
  uploadImageAction: (...args: unknown[]) => uploadImageAction(...args),
}));

function imageField(overrides: Partial<StoredFieldRow> = {}) {
  const parsed = parseFieldConfig({
    id: "f1",
    collection_id: "c1",
    key: "cover",
    label: "Cover",
    widget: "image",
    required: 0,
    position: 0,
    config: "{}",
    ...overrides,
  });
  if (!parsed.ok) throw new Error("fixture field failed to parse");
  return parsed;
}

const asset = {
  secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg",
  publicId: "sample",
  width: 800,
  height: 600,
  format: "jpg",
  bytes: 12345,
};

function pickFile(input: HTMLElement) {
  const file = new File(["fake"], "photo.jpg", { type: "image/jpeg" });
  return userEvent.upload(input, file);
}

beforeEach(() => {
  uploadImageAction.mockReset();
});

describe("ImagePicker", () => {
  it("renders a local file picker and no remote URL input", () => {
    render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={undefined}
      />,
    );

    expect(screen.getByLabelText("Cover")).toHaveAttribute("type", "file");
    expect(screen.queryByRole("textbox", { name: /url/i })).toBeNull();
  });

  it("shows no upload button and no warning before a file is picked", () => {
    render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(uploadImageAction).not.toHaveBeenCalled();
  });

  it("shows the Upload button once a file is picked, still with no warning yet", async () => {
    render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={undefined}
      />,
    );

    await pickFile(screen.getByLabelText("Cover"));

    expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(uploadImageAction).not.toHaveBeenCalled();
  });

  it("shows a warning when upload is clicked and Cloudinary isn't configured", async () => {
    uploadImageAction.mockResolvedValue({ ok: false, reason: "NOT_CONFIGURED" });

    render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={undefined}
      />,
    );

    await pickFile(screen.getByLabelText("Cover"));
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/isn't configured/i);
    });
  });

  it("shows an error when the live connection check fails", async () => {
    uploadImageAction.mockResolvedValue({ ok: false, reason: "CONNECTION_FAILED" });

    render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={undefined}
      />,
    );

    await pickFile(screen.getByLabelText("Cover"));
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/connection/i);
    });
  });

  it("shows a generic error when the upload itself fails", async () => {
    uploadImageAction.mockResolvedValue({ ok: false, reason: "UPLOAD_FAILED" });

    render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={undefined}
      />,
    );

    await pickFile(screen.getByLabelText("Cover"));
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/failed/i);
    });
  });

  it("renders a thumbnail and fills the hidden input on a successful upload", async () => {
    uploadImageAction.mockResolvedValue({ ok: true, value: asset });

    const { container } = render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={undefined}
      />,
    );

    await pickFile(screen.getByLabelText("Cover"));
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Cover" })).toHaveAttribute(
        "src",
        asset.secureUrl,
      );
    });

    const hidden = container.querySelector(
      'input[type="hidden"][name="value:f1"]',
    ) as HTMLInputElement;
    expect(JSON.parse(hidden.value)).toEqual(asset);
  });

  it("passes the current publicId when replacing an existing image", async () => {
    uploadImageAction.mockResolvedValue({
      ok: true,
      value: { ...asset, publicId: "new-photo" },
    });

    render(
      <ImagePicker
        fieldId="f1"
        label="Cover"
        required={false}
        config={{}}
        value={asset}
      />,
    );

    await pickFile(screen.getByLabelText("Cover"));
    await userEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(uploadImageAction).toHaveBeenCalledWith(
        {},
        expect.any(File),
        asset.publicId,
      );
    });
  });
});

describe("ValueInput — image dispatch", () => {
  it("mounts the image picker for an image field", () => {
    render(<ValueInput field={imageField()} value={undefined} />);
    expect(screen.getByLabelText("Cover")).toHaveAttribute("type", "file");
  });

  it("does not mount a file picker for a non-image field", () => {
    const stringField = parseFieldConfig({
      id: "f2",
      collection_id: "c1",
      key: "title",
      label: "Title",
      widget: "string",
      required: 0,
      position: 0,
      config: "{}",
    });
    if (!stringField.ok) throw new Error("fixture field failed to parse");

    render(<ValueInput field={stringField} value="" />);
    expect(screen.queryByRole("textbox")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
