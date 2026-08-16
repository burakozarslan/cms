import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dropdown, DropdownItem } from "@frontend/ui/dropdown";

describe("Dropdown", () => {
  it("stays closed by default", () => {
    render(
      <Dropdown trigger={<button type="button">Account</button>}>
        <DropdownItem>
          <a href="/settings">Settings</a>
        </DropdownItem>
      </Dropdown>,
    );

    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("opens menu when trigger is clicked and closes on outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outside</button>
        <Dropdown trigger={<span>Account</span>}>
          <DropdownItem>
            <a href="/settings">Settings</a>
          </DropdownItem>
        </Dropdown>
      </div>,
    );

    await user.click(screen.getByText("Account"));
    expect(screen.getByText("Settings")).toBeInTheDocument();

    await user.click(screen.getByText("Outside"));
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("closes on Escape key press", async () => {
    const user = userEvent.setup();
    render(
      <Dropdown trigger={<span>Account</span>}>
        <DropdownItem>
          <a href="/settings">Settings</a>
        </DropdownItem>
      </Dropdown>,
    );

    await user.click(screen.getByText("Account"));
    expect(screen.getByText("Settings")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });
});
