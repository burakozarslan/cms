import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CredentialsForm } from "@/app/(auth)/credentials-form";
import type { AuthFormState } from "@/app/(auth)/actions";

function renderForm(action: (prev: AuthFormState, data: FormData) => Promise<AuthFormState>) {
  return render(
    <CredentialsForm
      title="Sign in"
      submitLabel="Sign in"
      action={action}
      passwordAutoComplete="current-password"
      footer={null}
    />,
  );
}

describe("CredentialsForm", () => {
  it("renders labelled email and password fields", () => {
    renderForm(async () => ({}));

    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the generic error the action returns", async () => {
    const user = userEvent.setup();
    renderForm(async () => ({ error: "Invalid email or password." }));

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "whatever");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
  });

  it("shows field-level validation errors and marks the field invalid", async () => {
    const user = userEvent.setup();
    renderForm(async () => ({
      fieldErrors: { email: ["Enter a valid email address."] },
    }));

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("passes the submitted values to the action", async () => {
    const user = userEvent.setup();
    const action = jest.fn(
      async (_prev: AuthFormState, _formData: FormData): Promise<AuthFormState> =>
        ({}),
    );
    renderForm(action);

    await user.type(screen.getByLabelText("Email"), "someone@example.com");
    await user.type(screen.getByLabelText("Password"), "a password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const formData = action.mock.calls[0][1];
    expect(formData.get("email")).toBe("someone@example.com");
    expect(formData.get("password")).toBe("a password");
  });
});
