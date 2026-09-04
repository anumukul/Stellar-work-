"use client";

import React from "react";
import type { Job, JobStatus } from "@/lib/types";
import Tooltip from "@/components/Tooltip";

interface JobStatusTimelineProps {
  job: Job;
}

const DEFAULT_FLOW: JobStatus[] = ["Open", "InProgress", "SubmittedForReview", "Completed"];

function formatTimeDiff(startMs: number, endMs: number): string {
  const diffMs = endMs - startMs;
  if (diffMs < 0) return "0s";
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export default function JobStatusTimeline({ job }: JobStatusTimelineProps) {
  const currentStatus = job.status;
  let flow = [...DEFAULT_FLOW];
  
  if (currentStatus === "Cancelled") {
    flow = ["Open", "Cancelled"];
  } else if (currentStatus === "Disputed") {
    flow = ["Open", "InProgress", "Disputed"];
  }

  const currentIndex = flow.indexOf(currentStatus);
  const activeIndex = currentIndex === -1 ? flow.length - 1 : currentIndex;

  const timestamps: Partial<Record<JobStatus, number>> = {};
  if (job.created_at) {
    timestamps["Open"] = Number(job.created_at) * 1000;
  }
  if (job.submitted_at && Number(job.submitted_at) > 0) {
    timestamps["SubmittedForReview"] = Number(job.submitted_at) * 1000;
  }

  return (
    <div className="w-full py-6 px-4">
      <div className="flex items-center justify-between relative max-w-2xl mx-auto">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded"></div>
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-500 rounded transition-all duration-500"
          style={{ width: `${(activeIndex / (flow.length - 1)) * 100}%` }}
        ></div>

        {flow.map((status, index) => {
          const isPast = index < activeIndex;
          const isCurrent = index === activeIndex;
          const isFuture = index > activeIndex;
          const timestamp = timestamps[status];
          
          let timeSpent = null;
          if (isPast && timestamp && timestamps[flow[index + 1]]) {
             timeSpent = formatTimeDiff(timestamp, timestamps[flow[index + 1]]!);
          } else if (isCurrent && timestamp) {
             timeSpent = formatTimeDiff(timestamp, Date.now());
          }
          
          let bgColor = isFuture ? "bg-white border-slate-300" : "bg-blue-500 border-blue-500";
          if (isCurrent) bgColor = "bg-blue-600 border-blue-600 ring-4 ring-blue-100";
          if (status === "Cancelled" || status === "Disputed") {
            bgColor = isCurrent ? "bg-red-500 border-red-500 ring-4 ring-red-100" : "bg-red-500 border-red-500";
          }

          const dateStr = timestamp ? new Date(timestamp).toLocaleString() : "Pending";
          const tooltipContent = (
            <div className="text-xs">
              <p className="font-semibold mb-1">{status}</p>
              <p className="text-slate-200">{dateStr}</p>
              {timeSpent && <p className="mt-1 text-slate-300">Time spent: {timeSpent}</p>}
            </div>
          );

          // Custom formatting for display
          let displayStatus: string = status;
          if (status === "InProgress") displayStatus = "In Progress";
          if (status === "SubmittedForReview") displayStatus = "Review";

          return (
            <Tooltip key={status} content={tooltipContent} placement="top">
              <div className="relative flex flex-col items-center group cursor-help">
                <div className={`w-5 h-5 rounded-full border-2 z-10 transition-colors duration-300 ${bgColor}`} />
                <div className={`absolute top-8 whitespace-nowrap text-xs font-medium transition-colors duration-300 ${isCurrent ? 'text-blue-700' : isPast ? 'text-slate-700' : 'text-slate-400'}`}>
                  {displayStatus}
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
