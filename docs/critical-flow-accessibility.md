# Critical Flow Accessibility Suite

This suite protects the screen-reader experience for four critical journeys:

1. Post a job
2. Accept work
3. Approve submitted work
4. Raise a dispute

## Automated checks

The browser suite is [critical-flows-a11y.spec.ts](../frontend/e2e/critical-flows-a11y.spec.ts).
It runs in Chromium with deterministic wallet and contract stubs, so it does not
need funded accounts, a wallet extension, or a live Stellar network. Each flow
checks the controls a screen-reader user needs to discover, the announcement or
error produced by the action, and an axe scan of the relevant form or dialog.

Run it locally:

```bash
cd frontend
npm run test:e2e:a11y-critical
```

The `Accessibility Tests / Critical flow screen-reader checks` GitHub Actions
job runs the same suite on pushes and pull requests. The HTML Playwright report
is uploaded as `critical-flow-accessibility-report` for 30 days, including when
the job fails. The workflow check itself is the pass/fail gate.

## Manual NVDA walkthrough

Use Windows 11 with NVDA and Chrome. Start Speech Viewer, then complete each
flow with the keyboard only. Record the browser, NVDA version, date, and result
in the issue or release test record.

### Post a job

- Navigate to `/post-job` and use `H` to find the `Post Job` heading.
- Tab through the form. NVDA must announce useful names and required state for
  amount, description, deadline, and token controls.
- Submit an empty form. Validation must be announced without moving focus
  unexpectedly, and each invalid control must expose its error text.
- Enter valid values and submit. Confirm the success or failure announcement is
  spoken and focus remains usable.

### Accept work

- On an open job, locate `Accept Job` by button navigation.
- Activate it and confirm the cover-letter dialog announces its heading,
  textarea, preview checkbox, cancel button, and accept button.
- Complete acceptance and verify the success announcement and updated status.

### Approve submitted work

- On a submitted job as the client, locate `Approve Work`.
- Activate it and verify the confirmation dialog announces consequences and the
  `Yes, approve & pay` and cancel actions.
- Confirm the action and verify payment release and completed status are spoken.

### Raise a dispute

- On `/disputes`, locate `Raise Dispute` and open it.
- Verify focus enters the modal, its heading is announced, and Job, Reason, and
  Supporting Evidence are associated with their controls.
- Submit with an empty reason. The error must be announced and focus must remain
  inside the modal.
- Enter a reason, submit, and verify the success announcement and active count.

Repeat each flow once with VoiceOver on macOS Safari. Use `VO+U` for headings,
forms, and landmarks, `Tab` for controls, and `VO+Space` to activate controls.
Confirm announcements do not depend on color, visual position, or hover state.

## Adding a flow

1. Add a test to `frontend/e2e/critical-flows-a11y.spec.ts` using
   `installFlowMocks`. Keep it deterministic and never add real credentials or
   live-network calls.
2. Assert roles and accessible names, not CSS selectors. Include the expected
   live region, alert, dialog, or status transition.
3. Add an axe scan for the active form or dialog.
4. Add the journey to both the NVDA and VoiceOver checklists above.
5. Run `npm run test:e2e:a11y-critical` and attach the HTML report when changing
   an accessibility contract or investigating a CI failure.