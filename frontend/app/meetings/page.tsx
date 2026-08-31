"use client";
import TruncatedAddress from "@/components/TruncatedAddress";
import { useMeetings, type Meeting, type MeetingStatus } from "@/lib/meetings-context";
import { useWallet } from "@/lib/wallet-context";
import Link from "next/link";
import { useState } from "react";

const STATUS_LABELS: Record<MeetingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

const STATUS_COLORS: Record<MeetingStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-600",
  completed: "bg-blue-100 text-blue-800",
};

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(start: string, end: string) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function generateIcsContent(meeting: Meeting): string {
  const start = meeting.selectedSlot?.start ?? meeting.proposedSlots[0]?.start ?? "";
  const end = meeting.selectedSlot?.end ?? meeting.proposedSlots[0]?.end ?? "";
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dtStart = new Date(start).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dtEnd = new Date(end).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StellarWork//Meetings//EN",
    "BEGIN:VEVENT",
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${meeting.title}`,
    `UID:${meeting.id}@stellarwork.app`,
    `DTSTAMP:${now}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(meeting: Meeting) {
  const blob = new Blob([generateIcsContent(meeting)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `meeting-${meeting.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MeetingsPage() {
  const { meetings, confirmSlot, cancelMeeting, completeMeeting, rescheduleProposal } = useMeetings();
  const { wallet } = useWallet();
  const [filter, setFilter] = useState<MeetingStatus | "all">("all");
  const [actionMeetingId, setActionMeetingId] = useState<string | null>(null);

  const filteredMeetings = filter === "all" ? meetings : meetings.filter((m) => m.status === filter);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
          {(["all", "confirmed", "pending", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "All" : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {filteredMeetings.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">No meetings found.</p>
          <p className="mt-1 text-xs text-slate-400">Propose a meeting from a job detail page to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              wallet={wallet}
              onConfirm={(slot) => confirmSlot(meeting.id, slot)}
              onCancel={() => cancelMeeting(meeting.id)}
              onComplete={() => completeMeeting(meeting.id)}
              onReschedule={(slots) => rescheduleProposal(meeting.id, slots)}
              onDownloadIcs={() => downloadIcs(meeting)}
              actionMeetingId={actionMeetingId}
              setActionMeetingId={setActionMeetingId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MeetingCard({
  meeting,
  wallet,
  onConfirm,
  onCancel,
  onComplete,
  onReschedule,
  onDownloadIcs,
  actionMeetingId,
  setActionMeetingId,
}: {
  meeting: Meeting;
  wallet: string | null;
  onConfirm: (slot: { start: string; end: string }) => void;
  onCancel: () => void;
  onComplete: () => void;
  onReschedule: (slots: { start: string; end: string }[]) => void;
  onDownloadIcs: () => void;
  actionMeetingId: string | null;
  setActionMeetingId: (id: string | null) => void;
}) {
  const isOpen = actionMeetingId === meeting.id;
  const isParticipant = wallet && (wallet === meeting.proposer || wallet === meeting.otherParty);
  const canConfirm = isParticipant && meeting.status === "pending" && meeting.proposedSlots.length > 0;
  const canCancel = isParticipant && meeting.status !== "cancelled" && meeting.status !== "completed";
  const isPastConfirmed = meeting.status === "confirmed" && meeting.selectedSlot && new Date(meeting.selectedSlot.end) < new Date();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-medium text-slate-900">{meeting.title}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[meeting.status]}`}>
              {STATUS_LABELS[meeting.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Job <Link href={`/job/${meeting.jobId}`} className="text-blue-600 hover:underline">#{meeting.jobId}</Link>
            {" "}· {meeting.proposer === wallet ? "You proposed" : (
              <>
                Proposed by <TruncatedAddress address={meeting.proposer} />
              </>
            )}
          </p>
          {meeting.selectedSlot && (
            <p className="mt-1 text-xs text-slate-700">
              {formatDateTime(meeting.selectedSlot.start)} ({formatDuration(meeting.selectedSlot.start, meeting.selectedSlot.end)})
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {meeting.status === "confirmed" && (
            <button
              type="button"
              onClick={onDownloadIcs}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Export calendar file"
            >
              .ics
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Cancel
            </button>
          )}
          {isPastConfirmed && meeting.status === "confirmed" && (
            <button
              type="button"
              onClick={onComplete}
              className="rounded-md border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              Mark done
            </button>
          )}
          {canConfirm && (
            <button
              type="button"
              onClick={() => setActionMeetingId(isOpen ? null : meeting.id)}
              className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              Pick slot
            </button>
          )}
        </div>
      </div>

      {isOpen && canConfirm && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-600">Select a time slot:</p>
          {meeting.proposedSlots.map((slot, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onConfirm(slot);
                setActionMeetingId(null);
              }}
              className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-xs hover:border-blue-300 hover:bg-blue-50"
            >
              {formatDateTime(slot.start)} ({formatDuration(slot.start, slot.end)})
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActionMeetingId(null)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
