import { describe, expect, it } from "vitest";
import {
  countChecked,
  groupAccountsByBusiness,
  reorderByDrop,
  sortAccountsByOrder,
} from "@/views/settings/settingsData";
import type { FbAccount } from "@/types/fb";

const mkAcct = (id: string, name: string, business?: { id: string; name: string }): FbAccount => ({
  id,
  name,
  account_status: 1,
  ...(business !== undefined ? { business } : {}),
});

describe("groupAccountsByBusiness", () => {
  it("groups accounts by business id", () => {
    const accounts = [
      mkAcct("act_1", "A", { id: "biz_1", name: "Alpha BM" }),
      mkAcct("act_2", "B", { id: "biz_1", name: "Alpha BM" }),
      mkAcct("act_3", "C", { id: "biz_2", name: "Beta BM" }),
    ];
    const groups = groupAccountsByBusiness(accounts);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.accounts).toHaveLength(2);
    expect(groups[1]?.accounts).toHaveLength(1);
  });

  it('accounts without business fall into "其他" group at the end', () => {
    const accounts = [
      mkAcct("act_1", "A"),
      mkAcct("act_2", "B", { id: "biz_1", name: "Alpha BM" }),
    ];
    const groups = groupAccountsByBusiness(accounts);
    expect(groups.map((g) => g.name)).toEqual(["Alpha BM", "其他"]);
    expect(groups[groups.length - 1]?.accounts.map((a) => a.id)).toEqual(["act_1"]);
  });

  it("sorts named BM groups alphabetically in zh-TW locale", () => {
    const accounts = [
      mkAcct("act_1", "A", { id: "biz_c", name: "Charlie BM" }),
      mkAcct("act_2", "B", { id: "biz_a", name: "Alpha BM" }),
      mkAcct("act_3", "C", { id: "biz_b", name: "Beta BM" }),
    ];
    const groups = groupAccountsByBusiness(accounts);
    expect(groups.map((g) => g.name)).toEqual(["Alpha BM", "Beta BM", "Charlie BM"]);
  });
});

describe("countChecked", () => {
  it("counts checked accounts in a group", () => {
    const group = {
      key: "biz_1",
      name: "Alpha BM",
      accounts: [mkAcct("a", "A"), mkAcct("b", "B"), mkAcct("c", "C")],
    };
    expect(countChecked(group, new Set(["a", "c"]))).toBe(2);
  });
  it("returns 0 when nothing is checked", () => {
    const group = { key: "biz_1", name: "Alpha BM", accounts: [mkAcct("a", "A")] };
    expect(countChecked(group, new Set())).toBe(0);
  });
});

describe("sortAccountsByOrder", () => {
  it("custom-ordered ids come first in their order", () => {
    const accounts = [
      mkAcct("a", "Alpha"),
      mkAcct("b", "Bravo"),
      mkAcct("c", "Charlie"),
      mkAcct("d", "Delta"),
    ];
    const sorted = sortAccountsByOrder(accounts, ["c", "a"]);
    expect(sorted.map((a) => a.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("unordered accounts fall back to zh-TW alphabetical", () => {
    const accounts = [mkAcct("a", "Zeta"), mkAcct("b", "Alpha"), mkAcct("c", "Mango")];
    expect(sortAccountsByOrder(accounts, []).map((a) => a.name)).toEqual([
      "Alpha",
      "Mango",
      "Zeta",
    ]);
  });
});

describe("reorderByDrop", () => {
  it("moves movingId to immediately before targetId", () => {
    expect(reorderByDrop(["a", "b", "c", "d"], "c", "a")).toEqual(["c", "a", "b", "d"]);
  });
  it("does nothing when moving onto itself", () => {
    expect(reorderByDrop(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });
  it("appends movingId when targetId missing", () => {
    expect(reorderByDrop(["a", "b"], "c", "z")).toEqual(["a", "b", "c"]);
  });
  it("moving forward works", () => {
    expect(reorderByDrop(["a", "b", "c"], "a", "c")).toEqual(["b", "a", "c"]);
  });
});
