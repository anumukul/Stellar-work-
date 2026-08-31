import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import JobCelebrationModal from "./JobCelebrationModal";
import { ToastProvider } from "./ToastProvider";

const meta = {
  title: "Components/JobCelebrationModal",
  component: JobCelebrationModal,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof JobCelebrationModal>;

export default meta;
type Story = StoryObj<typeof JobCelebrationModal>;

function CelebrationWrapper(args: React.ComponentProps<typeof JobCelebrationModal>) {
  const [open, setOpen] = useState(args.isOpen ?? true);

  return (
    <ToastProvider>
      <div className="flex min-h-[500px] flex-col items-center justify-center bg-slate-100 p-8 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-500"
        >
          Open Celebration Modal 🎉
        </button>

        <JobCelebrationModal
          {...args}
          isOpen={open}
          onClose={() => setOpen(false)}
        />
      </div>
    </ToastProvider>
  );
}

export const DefaultClientCelebration: Story = {
  args: {
    isOpen: true,
    jobId: "42",
    jobTitle: "Smart Contract Security Audit",
    amount: "5000000000",
    token: "XLM",
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 3, // 3 days ago
    completedAt: Math.floor(Date.now() / 1000),
    isClient: true,
    isFreelancer: false,
    initialRating: 5,
  },
  render: (args) => <CelebrationWrapper {...args} />,
};

export const FreelancerCelebration: Story = {
  args: {
    isOpen: true,
    jobId: "108",
    jobTitle: "DeFi Frontend DApp Implementation",
    amount: "12500000000",
    token: "XLM",
    createdAt: Math.floor(Date.now() / 1000) - 3600 * 5, // 5 hours ago
    completedAt: Math.floor(Date.now() / 1000),
    isClient: false,
    isFreelancer: true,
    onDownloadCertificate: () => alert("Downloading certificate..."),
  },
  render: (args) => <CelebrationWrapper {...args} />,
};

export const ReducedMotionMode: Story = {
  args: {
    isOpen: true,
    jobId: "77",
    jobTitle: "Rust Soroban Token Bridge",
    amount: "7500000000",
    token: "XLM",
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 7,
    completedAt: Math.floor(Date.now() / 1000),
    forceReducedMotion: true,
  },
  render: (args) => <CelebrationWrapper {...args} />,
};
