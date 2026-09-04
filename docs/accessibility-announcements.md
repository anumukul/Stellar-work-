# Screen Reader Announcement Patterns

This document outlines the patterns used for screen reader announcements in the application, ensuring that dynamic state changes are communicated effectively to users relying on assistive technologies like NVDA and VoiceOver.

## 1. ARIA Live Regions

We use ARIA live regions to announce dynamic content changes that happen without a page reload (e.g., job status updates, toast notifications, form validation errors).

- `aria-live="polite"`: Used for most announcements (e.g., job status changes, success messages). This politely waits until the screen reader finishes its current sentence before announcing the new content.
- `aria-live="assertive"`: Used for critical, time-sensitive alerts (e.g., destructive action confirmations, critical errors). This interrupts the screen reader immediately.

### Example: Job Status Changes

When a job's status changes (e.g., via a WebSocket update or user action), we announce the transition using a hidden `aria-live` region.

```tsx
<p aria-live="polite" aria-atomic="true" className="sr-only">
  {statusAnnouncement}
</p>
```

We map raw status values to human-readable context to provide better understanding:
- `Open` ➔ "Job is now open and accepting freelancers."
- `InProgress` ➔ "Job is now in progress."
- `SubmittedForReview` ➔ "Work has been submitted for review."
- `Completed` ➔ "Job has been completed and payment released."
- `Cancelled` ➔ "Job has been cancelled."

## 2. Best Practices

1. **Visually Hidden but Accessible**: Use utility classes like `sr-only` to hide the live region from sighted users while keeping it accessible to screen readers.
2. **Contextual Messaging**: Do not just announce "Status: InProgress". Provide a full, descriptive sentence so the user understands the implication of the change.
3. **Avoid Overuse**: Only announce significant changes. Flooding the live region with too many updates can overwhelm the user.
4. **Use `aria-atomic="true"`**: This ensures the entire content of the live region is read out when it changes, rather than just the appended text.

## 3. Testing Announcements

When implementing new live regions, always verify their behavior using standard screen readers:
- **Windows**: Use NVDA (NonVisual Desktop Access).
- **macOS/iOS**: Use VoiceOver.

### Testing Checklist:
- [ ] Trigger the state change.
- [ ] Verify the screen reader announces the change.
- [ ] Ensure the announcement is clear and provides sufficient context.
- [ ] For `polite` regions, ensure it does not interrupt critical navigation speech.
- [ ] For `assertive` regions, ensure it interrupts immediately for critical errors.
