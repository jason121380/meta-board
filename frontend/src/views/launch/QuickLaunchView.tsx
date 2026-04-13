import { ApiError, api } from "@/api/client";
import { useAccounts } from "@/api/hooks/useAccounts";
import { Button } from "@/components/Button";
import { Topbar } from "@/layout/Topbar";
import { cn } from "@/lib/cn";
import { useAccountsStore } from "@/stores/accountsStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

/**
 * Quick Launch wizard — three-step form.
 *
 * Step 1: select an account (from the visible accounts).
 * Step 2: fill in name / objective / daily budget / initial status.
 * Step 3: success screen with returned campaign id.
 *
 * Matches dashboard.html lines 1089–1163 layout and styling.
 * Uses react-hook-form + zod for validation so the inputs get
 * live error messages without per-field state management.
 */

const FB_OBJECTIVES = [
  { value: "OUTCOME_TRAFFIC", label: "流量" },
  { value: "OUTCOME_AWARENESS", label: "品牌知名度" },
  { value: "OUTCOME_ENGAGEMENT", label: "互動" },
  { value: "OUTCOME_LEADS", label: "開發潛在顧客" },
  { value: "OUTCOME_SALES", label: "銷售" },
  { value: "OUTCOME_APP_PROMOTION", label: "推廣應用程式" },
] as const;

const launchSchema = z.object({
  accountId: z.string().min(1, "請選擇廣告帳戶"),
  name: z.string().trim().min(1, "請輸入行銷活動名稱"),
  objective: z.string().min(1),
  dailyBudget: z.coerce.number().int().min(1, "最低 NT$1"),
  status: z.enum(["PAUSED", "ACTIVE"]),
});

type LaunchFormValues = z.infer<typeof launchSchema>;

export function QuickLaunchView() {
  const queryClient = useQueryClient();
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visible = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [resultText, setResultText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<LaunchFormValues>({
    defaultValues: {
      accountId: "",
      name: "",
      objective: "OUTCOME_TRAFFIC",
      dailyBudget: 500,
      status: "PAUSED",
    },
  });
  const accountId = watch("accountId");

  const mutation = useMutation({
    mutationFn: async (values: LaunchFormValues) => {
      const parsed = launchSchema.parse(values);
      return api.launch.campaign({
        account_id: parsed.accountId,
        name: parsed.name,
        objective: parsed.objective,
        daily_budget: parsed.dailyBudget,
        status: parsed.status,
      });
    },
    onSuccess: (data, values) => {
      setResultText(`行銷活動 ID：${data.id}，名稱：${values.name}`);
      setStep(3);
      // Invalidate the target account's campaigns so dashboard sees the new row
      queryClient.invalidateQueries({ queryKey: ["campaigns", values.accountId] });
    },
    onError: (err) => {
      if (err instanceof ApiError) setSubmitError(err.detail);
      else setSubmitError(err instanceof Error ? err.message : String(err));
    },
  });

  const onSubmit = (values: LaunchFormValues) => {
    setSubmitError(null);
    mutation.mutate(values);
  };

  const restart = () => {
    reset();
    setResultText("");
    setSubmitError(null);
    setStep(1);
  };

  return (
    <>
      <Topbar title="快速上架" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[560px]">
          <h2 className="mb-1 text-xl font-bold tracking-[-0.3px]">快速建立廣告</h2>
          <p className="mb-6 text-[13px] text-gray-500">三步驟完成廣告上架</p>

          <Steps step={step} />

          <form onSubmit={handleSubmit(onSubmit)}>
            {step === 1 && (
              <div>
                <div className="mb-4">
                  <label
                    className="mb-1.5 block text-[13px] font-semibold text-ink"
                    htmlFor="launch-account"
                  >
                    廣告帳戶
                  </label>
                  <select
                    id="launch-account"
                    className="h-[38px] w-full rounded-lg border border-border bg-white px-2.5 text-sm outline-none focus:border-orange"
                    {...register("accountId", { required: true })}
                  >
                    <option value="">— 選擇廣告帳戶 —</option>
                    {visible
                      .filter((a) => a.account_status === 1)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <div className="mt-1 text-[11px] text-gray-300">選擇要上架廣告的帳戶</div>
                  {errors.accountId && (
                    <div className="mt-1 text-[11px] text-red">{errors.accountId.message}</div>
                  )}
                </div>
                <div className="mt-5 flex gap-2.5">
                  <Button
                    variant="primary"
                    type="button"
                    disabled={!accountId}
                    onClick={() => setStep(2)}
                  >
                    下一步 →
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <Field label="行銷活動名稱" error={errors.name?.message}>
                  <input
                    {...register("name")}
                    placeholder="例：2026 春季活動"
                    className="h-[38px] w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-orange"
                  />
                </Field>
                <Field label="廣告目標">
                  <select
                    {...register("objective")}
                    className="h-[38px] w-full rounded-lg border border-border bg-white px-2.5 text-sm outline-none focus:border-orange"
                  >
                    {FB_OBJECTIVES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="日預算（TWD）" error={errors.dailyBudget?.message}>
                  <input
                    type="number"
                    {...register("dailyBudget", { valueAsNumber: true })}
                    placeholder="500"
                    className="h-[38px] w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-orange"
                  />
                  <div className="mt-1 text-[11px] text-gray-300">最低 NT$1，建議 NT$300 以上</div>
                </Field>
                <Field label="初始狀態">
                  <select
                    {...register("status")}
                    className="h-[38px] w-full rounded-lg border border-border bg-white px-2.5 text-sm outline-none focus:border-orange"
                  >
                    <option value="PAUSED">暫停（建議先暫停，確認後再開啟）</option>
                    <option value="ACTIVE">立即執行</option>
                  </select>
                </Field>
                {submitError && (
                  <div className="mb-3 rounded-lg bg-red-bg px-3 py-2 text-xs text-red">
                    {submitError}
                  </div>
                )}
                <div className="mt-5 flex gap-2.5">
                  <Button variant="ghost" type="button" onClick={() => setStep(1)}>
                    ← 返回
                  </Button>
                  <Button variant="primary" type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "上架中..." : "立即上架"}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="py-10 text-center">
                <div className="mb-4 text-[32px] font-bold text-orange">完成</div>
                <div className="mb-2 text-xl font-bold">上架成功！</div>
                <div className="mb-6 text-[13px] text-gray-500">{resultText}</div>
                <div className="flex justify-center gap-2">
                  <Button variant="primary" type="button" onClick={restart}>
                    再次上架
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  );
}

function Steps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-7 flex gap-0">
      {[
        { n: 1, label: "① 選擇帳戶" },
        { n: 2, label: "② 廣告設定" },
        { n: 3, label: "③ 完成" },
      ].map((s) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <div
            key={s.n}
            className={cn(
              "flex-1 border-b-2 px-3 py-2 text-center text-xs font-semibold",
              done && "border-green text-green",
              active && "border-orange text-orange",
              !done && !active && "border-border text-gray-300",
            )}
          >
            {s.label}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[13px] font-semibold text-ink">{label}</div>
      {children}
      {error && <div className="mt-1 text-[11px] text-red">{error}</div>}
    </div>
  );
}
