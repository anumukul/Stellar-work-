# Frontend Components Documentation

This guide provides documentation for the core reusable frontend components in the StellarWork application, including design rationale, TypeScript definitions, and example usage.

---

## 1. Navigation

The `Navigation` component is the primary responsive header for the application. It includes main routing links, network status, the wallet connection menu, theming toggles, and voice navigation. 

**Design Rationale:** 
Designed to be responsive and highly accessible, providing shortcuts for power users (e.g. `⌘K`, or `n` for new job) while gracefully degrading to a hamburger menu on smaller screens. It maintains a consistent layout regardless of authentication state, injecting the admin or profile routes when appropriate.

**TypeScript Types:**
The `Navigation` component does not accept any props as it pulls its state entirely from `usePathname`, `useWallet`, and `useMessaging`.

```tsx
export const Navigation = memo(function Navigation(): JSX.Element);
```

**Example Usage:**
Typically rendered once inside the root layout:

```tsx
import { Navigation } from "@/app/navigation";

export default function RootLayout({ children }) {
  return (
    <body>
      <Navigation />
      <main>{children}</main>
    </body>
  );
}
```

---

## 2. WalletButton

The `WalletButton` provides a quick UI to connect or disconnect a user's Freighter wallet. It operates seamlessly with the `useWallet` context.

**Design Rationale:**
Provides a compact and easily identifiable entry point for Web3 functionality. Changes state dynamically from "Connect Wallet" to showing the truncated wallet address and a disconnect option when authenticated.

**TypeScript Types:**
```tsx
export function WalletButton(): JSX.Element;
```

**Example Usage:**
```tsx
import { WalletButton } from "@/lib/wallet-context";

export function MobileMenu() {
  return (
    <div className="mobile-nav">
      {/* Other links */}
      <WalletButton />
    </div>
  );
}
```

---

## 3. JobCard

The `JobCard` is a complex component used to display a summary of a job, its current status, associated actions (e.g., funding, cancelling, resolving), and selection state for bulk actions.

**Design Rationale:**
Designed as a robust, information-dense card that remains readable. It highlights the most important aspects: Job title, status, and financial amount. Call-to-actions (CTAs) are dynamically rendered based on the user's role (Client vs Freelancer) and the current job status.

**TypeScript Types:**
```tsx
import type { Job, NotificationEvent, PendingDashAction } from "@/lib/types";

export interface JobCardProps {
  id: number;
  job: Job;
  wallet: string;
  role: "client" | "freelancer";
  isLoading: boolean;
  onAction: (
    fn: () => Promise<unknown>, 
    jobId: number, 
    notification?: { event: NotificationEvent; message: string }
  ) => Promise<void>;
  onRequestCancel: (jobId: number) => void;
  onRequestAction: (type: PendingDashAction["type"], jobId: number, amountXlm: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
}
```

**Example Usage:**
```tsx
import { JobCard } from "@/app/dashboard/page"; // Note: ensure this is exported if used outside dashboard

<JobCard
  id={123}
  job={jobData}
  wallet="GABC...WXYZ"
  role="client"
  isLoading={false}
  onAction={async (actionFn, id) => { await actionFn(); }}
  onRequestCancel={(id) => console.log('Cancel', id)}
  onRequestAction={(type, id, amount) => console.log(type, id, amount)}
  isSelected={false}
  onToggleSelect={(id) => console.log('Toggle', id)}
/>
```

---

## 4. StatusPill (Status Badges)

The `StatusPill` renders a visual indicator for a `JobStatus`. It uses distinct colors and icons from `lucide-react` to make job states instantly recognizable.

**Design Rationale:**
Color-coding statuses reduces cognitive load. Using both icons and text ensures accessibility (for color-blind users) and reinforces the state meaning.
- Blue: Open
- Yellow: In Progress
- Purple: Submitted for Review
- Green: Completed
- Red: Cancelled
- Orange: Disputed

**TypeScript Types:**
```tsx
import type { JobStatus } from "@/lib/types";

export interface StatusPillProps {
  status: JobStatus;
  className?: string;
}

export default function StatusPill(props: StatusPillProps): JSX.Element;
```

**Example Usage:**
```tsx
import StatusPill from "@/components/StatusPill";

export function JobSummary({ status }) {
  return (
    <div className="flex justify-between items-center">
      <h3>Job Title</h3>
      <StatusPill status="InProgress" className="shadow-sm" />
    </div>
  );
}
```
