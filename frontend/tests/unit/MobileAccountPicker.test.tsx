import { MobileAccountPicker } from "@/components/MobileAccountPicker";
import type { FbAccount } from "@/types/fb";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * Component test for MobileAccountPicker — verifies the trigger →
 * modal → row-select → close flow that powers the mobile sidebar
 * replacement on alerts/dashboard/finance views.
 *
 * Uses Radix Dialog under the hood, which renders into a portal, so
 * we query through screen.* (not container.*).
 */

const ACCOUNTS: FbAccount[] = [
  { id: "act_111", name: "A 公司 - 月結", account_status: 1 },
  { id: "act_222", name: "B 公司 - 預付", account_status: 1 },
  { id: "act_333", name: "C 公司 - 已停用", account_status: 2 },
];

describe("MobileAccountPicker", () => {
  it("shows current selection in the trigger label (single account)", () => {
    render(
      <MobileAccountPicker accounts={ACCOUNTS} selectedId="act_222" onSelect={() => {}} />,
    );
    const trigger = screen.getByRole("button", { name: /B 公司 - 預付/ });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  });

  it('shows "全部帳戶" when selectedId is null and includeAllOption is true', () => {
    render(
      <MobileAccountPicker accounts={ACCOUNTS} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /全部帳戶/ })).toBeInTheDocument();
  });

  it("opens a dialog with every account when the trigger is tapped", async () => {
    const user = userEvent.setup();
    render(
      <MobileAccountPicker accounts={ACCOUNTS} selectedId="act_111" onSelect={() => {}} />,
    );

    // Dialog should not exist yet
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: /A 公司 - 月結/ }));

    // Dialog should appear
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // All three accounts + the "全部帳戶" entry should be tappable.
    // Scope queries to the dialog because the trigger label outside
    // the dialog also contains the active account name.
    const inDialog = within(dialog);
    expect(inDialog.getByText("全部帳戶")).toBeInTheDocument();
    expect(inDialog.getByText("A 公司 - 月結")).toBeInTheDocument();
    expect(inDialog.getByText("B 公司 - 預付")).toBeInTheDocument();
    expect(inDialog.getByText("C 公司 - 已停用")).toBeInTheDocument();
  });

  it("calls onSelect and closes the dialog when a row is tapped", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MobileAccountPicker accounts={ACCOUNTS} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /選擇廣告帳戶/ }));
    const dialog = await screen.findByRole("dialog");

    // Pick "B 公司 - 預付" — the second account row inside the dialog
    await user.click(within(dialog).getByText("B 公司 - 預付"));

    expect(onSelect).toHaveBeenCalledWith("act_222");
    // Dialog should be torn down
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it('returns null on the "全部帳戶" row when includeAllOption is true', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MobileAccountPicker accounts={ACCOUNTS} selectedId="act_111" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /A 公司 - 月結/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("全部帳戶"));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('omits the "全部帳戶" row when includeAllOption is false', async () => {
    const user = userEvent.setup();
    render(
      <MobileAccountPicker
        accounts={ACCOUNTS}
        selectedId="act_111"
        onSelect={() => {}}
        includeAllOption={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /A 公司 - 月結/ }));
    const dialog = await screen.findByRole("dialog");

    // Dialog opened but the all-accounts row is absent. Scope the
    // text queries to the dialog to avoid collision with the trigger.
    const inDialog = within(dialog);
    expect(inDialog.queryByText("全部帳戶")).toBeNull();
    expect(inDialog.getByText("A 公司 - 月結")).toBeInTheDocument();
  });

  it("renders the empty state when accounts is empty", async () => {
    const user = userEvent.setup();
    render(
      <MobileAccountPicker
        accounts={[]}
        selectedId={null}
        onSelect={() => {}}
        includeAllOption={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /選擇廣告帳戶/ }));
    await screen.findByRole("dialog");
    expect(screen.getByText(/尚無帳戶/)).toBeInTheDocument();
  });
});
