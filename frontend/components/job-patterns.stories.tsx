import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { useState } from "react";
import JobCardComponent from "./JobCard";
import JobCardSkeleton from "./JobCardSkeleton";
import JobFilterPanel, { DEFAULT_FILTERS, type JobFilters } from "./JobFilterPanel";
import StatusPill from "./StatusPill";
import type { Job } from "@/lib/types";

const meta = {
  title: "Domain/Jobs",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const baseJob: Job = {
  client: "GCLIENTABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQ",
  freelancer: null,
  amount: "2500000000",
  description_hash: "bafybeigdyrzt-representative-job-description",
  status: "Open",
  created_at: "1761120000",
  deadline: "1761724800",
  token: "CDLZFC3SYJYDZY2B4FKOM2CPCD7JQDO5KHVK7Y5LZJH5QXRQNF7JXABC",
  revision_count: 0,
  submitted_at: "0",
  title: "Build a Stellar escrow dashboard",
  category: "Development",
};

function JobFixture({ job = baseJob, isLoading = false }: { job?: Job; isLoading?: boolean }) {
  return (
    <DndContext>
      <SortableContext items={[42]}>
        <div className="max-w-md">
          <JobCardComponent
            id={42}
            job={job}
            wallet={job.client}
            role="client"
            isLoading={isLoading}
            onAction={async () => undefined}
            onRequestAction={() => undefined}
          />
        </div>
      </SortableContext>
    </DndContext>
  );
}

function FilterFixture({ initial = DEFAULT_FILTERS, resultCount = 0 }: { initial?: JobFilters; resultCount?: number }) {
  const [filters, setFilters] = useState(initial);
  return <JobFilterPanel filters={filters} onChange={setFilters} resultCount={resultCount} />;
}

export const JobCard: Story = { render: () => <JobFixture /> };

export const Loading: Story = { render: () => <JobCardSkeleton /> };

export const EmptyResults: Story = { render: () => <FilterFixture resultCount={0} /> };

export const LongContent: Story = {
  render: () => (
    <JobFixture
      job={{
        ...baseJob,
        title: "Design and implement a comprehensive cross-border escrow experience with extensive compliance requirements",
        token: "CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ2",
      }}
    />
  ),
};

export const Disputed: Story = {
  render: () => (
    <JobFixture
      job={{
        ...baseJob,
        status: "Disputed",
        freelancer: "GFREELANCER234567ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFG",
      }}
    />
  ),
};

export const DisabledAction: Story = {
  render: () => (
    <div className="space-y-3">
      <JobFixture job={{ ...baseJob, status: "SubmittedForReview" }} isLoading />
      <StatusPill status="SubmittedForReview" isLoading />
    </div>
  ),
};

export const ActiveFilters: Story = {
  render: () => (
    <FilterFixture
      resultCount={3}
      initial={{
        ...DEFAULT_FILTERS,
        minAmount: "100",
        dateRange: "7d",
        freelancerStatus: "unassigned",
      }}
    />
  ),
};
