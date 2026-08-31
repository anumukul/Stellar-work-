import { getJobCount, getJob, getDescriptionCid } from "@/lib/contract";
import { fetchFromIpfs } from "@/lib/ipfs-service";
import { toXlm } from "@/lib/format";
import type { Job } from "@/lib/types";

export const revalidate = 300; // 5 minutes cache TTL

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || url.origin;

  let count = 0;
  try {
    count = await getJobCount();
  } catch (e) {
    count = 0;
  }

  const MAX_JOBS = 50;
  const startId = Math.max(1, count - MAX_JOBS + 1);
  const idsToFetch = [];
  for (let i = count; i >= startId; i--) {
    idsToFetch.push(i.toString());
  }

  const results = await Promise.all(
    idsToFetch.map(async (id) => {
      try {
        const job = await getJob(id);
        if (job && job.status === "Open") {
          return { id, job };
        }
      } catch {
        return null;
      }
      return null;
    })
  );

  const openJobs = results.filter(
    (item): item is { id: string; job: Job } => item !== null
  );

  const jobsWithDesc = await Promise.all(
    openJobs.map(async (item) => {
      let description = "Description unavailable";
      try {
        const cid = await getDescriptionCid(item.job.description_hash);
        if (cid) {
          const text = await fetchFromIpfs(cid);
          if (text) {
            description = text;
          }
        }
      } catch {
        // Fallback
      }
      return { ...item, description };
    })
  );

  function escapeXml(unsafe: string) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<": return "&lt;";
        case ">": return "&gt;";
        case "&": return "&amp;";
        case "'": return "&apos;";
        case "\"": return "&quot;";
        default: return c;
      }
    });
  }

  const buildRSSItem = (item: { id: string; job: Job; description: string }) => {
    const jobUrl = `${baseUrl}/job/${item.id}`;
    const amountXlm = toXlm(item.job.amount);
    const pubDate = new Date(Number(item.job.created_at) * 1000).toUTCString();
    const deadlineDate = new Date(Number(item.job.deadline) * 1000).toUTCString();
    
    const client = item.job.client;
    const clientShort = client ? `${client.substring(0, 6)}...${client.substring(client.length - 4)}` : "Unknown";

    const content = `Amount: ${amountXlm} XLM\nDeadline: ${deadlineDate}\nClient: ${clientShort}\n\n${item.description}`;

    return `
    <item>
      <title>${escapeXml(item.job.title || "Untitled Job")}</title>
      <link>${jobUrl}</link>
      <guid>${jobUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(content)}</description>
    </item>`;
  };

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>StellarWork Open Jobs</title>
    <link>${baseUrl}</link>
    <description>Latest open freelance jobs on StellarWork</description>
    <language>en-us</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />${jobsWithDesc.map(buildRSSItem).join("")}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
