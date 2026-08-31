import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StatusPill from "./StatusPill";

const meta = {
  title: "Domain/Jobs",
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const JobCard: Story = {
  args: {
    title: "Build a Stellar escrow dashboard",
    amount: "250 XLM",
    client: "GCLIE...7Q4A",
    deadline: "7 days",
  },
  argTypes: {
    title: { control: "text" },
    amount: { control: "text" },
    client: { control: "text" },
    deadline: { control: "text" },
  },
  render: (args: Record<string, unknown>) => (
    <article className="interactive-card max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Job #{42}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {args.title as string}
          </h3>
        </div>
        <StatusPill status="Open" />
      </div>
      <dl className="mt-4 grid gap-3 text-sm text-slate-600">
        <div className="flex justify-between gap-3">
          <dt>Escrow</dt>
          <dd className="font-semibold text-slate-900">{args.amount as string}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Client</dt>
          <dd className="font-mono text-xs text-slate-900">{args.client as string}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Deadline</dt>
          <dd className="font-medium text-slate-900">{args.deadline as string}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          View details
        </button>
        <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
          Bookmark
        </button>
      </div>
    </article>
  ),
};

export const ActivityTimeline: Story = {
  render: () => {
    const events = [
      ["Posted", "Client funded escrow and published the job."],
      ["Accepted", "Freelancer accepted the work on-chain."],
      ["Submitted", "Work was submitted for review."],
      ["Completed", "Client released escrow to the freelancer."],
    ];

    return (
      <ol className="w-full max-w-xl space-y-4">
        {events.map(([title, description], index) => (
          <li key={title} className="flex gap-3">
            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {index + 1}
            </span>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  },
};

export const AnnouncementBanner: Story = {
  args: {
    message: "3 new open jobs are available.",
  },
  argTypes: {
    message: { control: "text" },
  },
  render: (args: Record<string, unknown>) => (
    <div
      role="status"
      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
    >
      {args.message as string}
    </div>
  ),
};
