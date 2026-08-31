import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EmptyState from "./EmptyState";
import ErrorBanner from "./ErrorBanner";
import InfoTooltip from "./InfoTooltip";
import LoadingState from "./LoadingState";
import NetworkBadge from "./NetworkBadge";
import NoResultsState from "./NoResultsState";
import SectionCard from "./SectionCard";
import Spinner from "./Spinner";
import StatusPill from "./StatusPill";
import type { JobStatus } from "@/lib/types";

const meta = {
  title: "Components/Feedback",
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const StatusBadges: Story = {
  render: () => {
    const statuses: JobStatus[] = [
      "Open",
      "InProgress",
      "SubmittedForReview",
      "Completed",
      "Cancelled",
      "Disputed",
    ];

    return (
      <div className="flex flex-wrap gap-3">
        {statuses.map((status) => (
          <StatusPill key={status} status={status} />
        ))}
      </div>
    );
  },
};

export const SectionCardStory: StoryObj<typeof SectionCard> = {
  name: "Section Card",
  args: {
    title: "Escrow summary",
    description: "Reusable panel for dashboard and job detail sections.",
    children: (
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Budget</dt>
          <dd className="font-semibold text-slate-900">125 XLM</dd>
        </div>
        <div>
          <dt className="text-slate-500">Deadline</dt>
          <dd className="font-semibold text-slate-900">7 days</dd>
        </div>
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd>
            <StatusPill status="Open" />
          </dd>
        </div>
      </dl>
    ),
  },
  render: (args) => <SectionCard {...args} />,
};

export const ErrorBannerStory: StoryObj<typeof ErrorBanner> = {
  name: "Error Banner",
  args: {
    message: "Unable to load the latest jobs from the Stellar contract.",
    onDismiss: () => undefined,
    onRetry: () => undefined,
  },
  render: (args) => <ErrorBanner {...args} />,
};

export const EmptyStateStory: StoryObj<typeof EmptyState> = {
  name: "Empty State",
  args: {
    title: "No jobs posted yet",
    description: "When clients post work, open jobs appear here.",
  },
  render: (args) => <EmptyState {...args} />,
};

export const NoResultsStateStory: StoryObj<typeof NoResultsState> = {
  name: "No Results State",
  args: {
    title: "No matching jobs",
    description: "Try clearing filters or searching by another job id.",
    actionLabel: "Clear filters",
    onAction: () => undefined,
  },
  render: (args) => <NoResultsState {...args} />,
};

export const LoadingStateStory: StoryObj<typeof LoadingState> = {
  name: "Loading State",
  args: {
    text: "Loading jobs...",
  },
  render: (args) => <LoadingState {...args} />,
};

export const SpinnerSizes: Story = {
  name: "Spinner",
  render: () => (
    <div className="flex items-center gap-6 text-slate-700">
      <Spinner size="sm" label="Small spinner" />
      <Spinner size="md" label="Medium spinner" />
      <Spinner size="lg" label="Large spinner" />
      <Spinner size={40} color="#0f766e" label="Custom spinner" />
    </div>
  ),
};

export const TooltipAndNetwork: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <NetworkBadge />
      <span className="inline-flex items-center gap-2 text-sm text-slate-700">
        Job status
        <InfoTooltip
          label="Explain job status"
          content="Status changes are read from the contract and may take a moment to update."
        />
      </span>
    </div>
  ),
};
