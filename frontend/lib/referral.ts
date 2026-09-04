export interface ReferralLink {
  url: string;
  code: string;
}

/** Build a stable, user/job-scoped share link with UTM attribution. */
export function createReferralLink(baseUrl: string, jobId: string, userId: string): ReferralLink {
  const code = `${userId.slice(0, 8)}-${jobId.slice(0, 8)}`;
  const url = new URL(`/jobs/${encodeURIComponent(jobId)}`, baseUrl);
  url.searchParams.set('ref', code);
  url.searchParams.set('utm_source', 'job_share');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', `job_${jobId}`);
  return { url: url.toString(), code };
}
