"use client";

import Tooltip from "@/components/Tooltip";
import { truncateAddress } from "@/lib/stellar";

type TruncatedAddressProps = {
  address: string;
  /** Chars kept on each end after the prefix offset used by truncateAddress. Default 4. */
  chars?: number;
  className?: string;
  /** Shown when address is empty. Default "N/A". */
  emptyLabel?: string;
  /** Pass false when nested inside a focusable control. Default true. */
  focusable?: boolean;
};

/**
 * Displays a truncated Stellar address with a tooltip revealing the full value
 * on hover (delayed) or keyboard focus.
 */
export default function TruncatedAddress({
  address,
  chars = 4,
  className = "font-mono text-xs",
  emptyLabel = "N/A",
  focusable = true,
}: TruncatedAddressProps) {
  if (!address) {
    return <span className={className}>{emptyLabel}</span>;
  }

  const truncated = truncateAddress(address, chars);

  if (truncated === address) {
    return <span className={className}>{address}</span>;
  }

  return (
    <Tooltip content={address} focusable={focusable}>
      <span className={`cursor-default ${className}`.trim()}>{truncated}</span>
    </Tooltip>
  );
}
