import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Job, NotificationEvent } from '@/lib/types';
import { getActions, PendingDashAction } from '@/app/dashboard/page'; // adjust import if needed
import StatusPill from '@/components/StatusPill';
import { toXlm } from '@/lib/format';

type JobCardProps = {
  id: number;
  job: Job;
  wallet: string;
  role: 'client' | 'freelancer';
  isLoading: boolean;
  onAction: (fn: () => Promise<unknown>, jobId: number, notification?: { event: NotificationEvent; message: string }) => Promise<void>;
  onRequestAction: (type: PendingDashAction['type'], jobId: number, amountXlm: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
};

export default function JobCard({
  id,
  job,
  wallet,
  role,
  isLoading,
  onAction,
  onRequestAction,
  isSelected = false,
  onToggleSelect,
}: JobCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const actions = getActions(id, job, wallet, role);
  const amountXlm = `${toXlm(job.amount)} XLM`;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`interactive-card h-full p-4 ${isSelected ? 'ring-2 ring-emerald-400' : ''}`}
    >
      {/* Drag handle – visible on hover */}
      <span
        {...attributes}
        {...listeners}
        className="drag-handle mr-2 hidden group-hover:inline-block"
        aria-label="Drag to reorder"
      >
        ≡
      </span>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {onToggleSelect && job.status === 'SubmittedForReview' && (
            <input
              type="checkbox"
              checked={isSelected ?? false}
              onChange={() => onToggleSelect(id)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              aria-label={`Select Job #${id} for batch approval`}
            />
          )}
          {onToggleSelect && job.status === 'Open' && role === 'client' && (
            <input
              type="checkbox"
              aria-label={`Select Job #${id} for bulk cancellation`}
              checked={isSelected}
              onChange={() => onToggleSelect(id)}
              className="h-4 w-4 rounded border-slate-300 accent-red-600 cursor-pointer"
            />
          )}
          <h3 className="font-medium">Job #{id}</h3>
          <StatusPill status={job.status} />
        </div>
        {/* Action buttons omitted for brevity; reuse existing logic elsewhere */}
      </div>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        <p className="flex min-w-0 items-baseline gap-1">
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap tabular-nums">
            {toXlm(job.amount)}
          </span>
          <span className="shrink-0">XLM</span>
        </p>
        <p>{job.token ? `Token: ${job.token.slice(0, 8)}...${job.token.slice(-4)}` : 'Token: N/A'}</p>
        {/* Deadline rendering could be added similar to original component */}
      </div>
    </article>
  );
}
