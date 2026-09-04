import { describe, expect, it } from 'vitest';
import { createReferralLink } from './referral';

describe('createReferralLink', () => {
  it('creates a user/job-scoped link with UTM attribution', () => {
    const link = createReferralLink('https://lernza.test', 'job-42', 'user-abc');
    expect(link.code).toBe('user-ab-job-42');
    expect(link.url).toContain('/jobs/job-42');
    expect(link.url).toContain('utm_source=job_share');
  });
});
