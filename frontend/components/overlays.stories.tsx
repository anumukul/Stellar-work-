import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import CancelJobConfirmModal from "./CancelJobConfirmModal";
import { ToastProvider, useToast } from "./ToastProvider";

const meta = {
  title: "Components/Overlays",
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const ConfirmDialog: StoryObj<typeof CancelJobConfirmModal> = {
  args: {
    jobId: "42",
    loading: false,
    onClose: () => undefined,
    onConfirm: () => undefined,
  },
  render: (args: Record<string, unknown>) => (
    <div className="min-h-[420px] bg-slate-100">
      <CancelJobConfirmModal
        jobId={args.jobId as string}
        loading={args.loading as boolean}
        onClose={args.onClose as () => void}
        onConfirm={args.onConfirm as () => void}
      />
    </div>
  ),
};

function ToastDemo({
  variant,
  message,
}: {
  variant: "success" | "error";
  message: string;
}) {
  const toast = useToast();

  useEffect(() => {
    if (variant === "success") {
      toast.showSuccess(message);
    } else {
      toast.showError(message);
    }
  }, [message, toast, variant]);

  return (
    <button
      type="button"
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      onClick={() =>
        variant === "success" ? toast.showSuccess(message) : toast.showError(message)
      }
    >
      Show {variant} toast
    </button>
  );
}

export const Toast: Story = {
  args: {
    variant: "success",
    message: "Job accepted. Escrow transaction submitted.",
  },
  argTypes: {
    variant: {
      control: "radio",
      options: ["success", "error"],
    },
    message: {
      control: "text",
    },
  },
  render: (args: Record<string, unknown>) => (
    <ToastProvider>
      <main className="min-h-[320px] bg-slate-50 p-8">
        <ToastDemo
          variant={args.variant as "success" | "error"}
          message={args.message as string}
        />
      </main>
    </ToastProvider>
  ),
};
