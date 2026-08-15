import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmDialog } from "@frontend/ui/confirm-dialog";

// jsdom does not implement the native <dialog> element's showModal()/close(),
// so they are stubbed on the prototype and observed directly.
function stubDialogMethods() {
  const showModal = jest.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  const close = jest.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
  return { showModal, close };
}

function renderDialog(action = jest.fn()) {
  render(
    <ConfirmDialog
      trigger={<button type="button">Delete</button>}
      title="Delete field?"
      confirmLabel="Delete field"
      destructive
      action={action}
      hidden={{ fieldId: "field-1" }}
    >
      This cannot be undone.
    </ConfirmDialog>,
  );
  return document.querySelector("dialog") as HTMLDialogElement;
}

describe("ConfirmDialog", () => {
  it("stays hidden until the trigger is clicked", () => {
    stubDialogMethods();
    const dialog = renderDialog();

    expect(dialog.className).toBe("hidden");
    expect(dialog).not.toHaveAttribute("open");
  });

  it("opens as a real modal when the trigger is clicked", async () => {
    const { showModal } = stubDialogMethods();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(showModal).toHaveBeenCalledTimes(1);
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.className).not.toBe("hidden");
    expect(dialog).toHaveAttribute("open");
  });

  it("closes on Cancel without submitting the action", async () => {
    const { close } = stubDialogMethods();
    const user = userEvent.setup();
    const action = jest.fn();
    renderDialog(action);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(close).toHaveBeenCalledTimes(1);
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.className).toBe("hidden");
    expect(action).not.toHaveBeenCalled();
  });
});
