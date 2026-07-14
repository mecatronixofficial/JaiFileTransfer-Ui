import { SharedLink, Transfer } from "@/types";

type TransferListPayload = {
  data?: unknown;
  transfers?: unknown;
  items?: unknown;
};

export function getTransfersFromResponse(payload: unknown): Transfer[] {
  const root = payload as TransferListPayload;
  const inner = (root?.data ?? root) as TransferListPayload;
  const nested = (inner?.data ?? inner) as TransferListPayload;

  const data = Array.isArray(nested?.transfers)
    ? nested.transfers
    : Array.isArray(nested?.items)
      ? nested.items
      : Array.isArray(nested)
        ? nested
        : [];

  return data as Transfer[];
}

export function getLinksFromResponse(payload: unknown): SharedLink[] {
  const root = payload as TransferListPayload;
  const inner = (root?.data ?? root) as TransferListPayload;
  const nested = (inner?.data ?? inner) as TransferListPayload;

  const data = Array.isArray(nested?.transfers)
    ? nested.transfers
    : Array.isArray((nested as TransferListPayload & { links?: unknown })?.links)
      ? (nested as TransferListPayload & { links?: unknown }).links
      : Array.isArray(nested?.items)
        ? nested.items
        : Array.isArray(nested)
          ? nested
          : [];

  return data as SharedLink[];
}

export function getLinkStatusCounts(links: SharedLink[]) {
  const uniqueLinks = new Map<string, SharedLink>();

  links.forEach((link) => {
    uniqueLinks.set(link.id || link.shortCode || link.url, link);
  });

  return Array.from(uniqueLinks.values()).reduce(
    (counts, link) => {
      if (link.status === "active") counts.active += 1;
      else if (link.status === "expired") counts.expired += 1;
      else if (link.status === "disabled") counts.disabled += 1;
      return counts;
    },
    { active: 0, expired: 0, disabled: 0 },
  );
}

export function getTransferFileCount(transfer: Transfer): number {
  return transfer.fileCount ?? transfer.files?.length ?? 0;
}

export function getTransferTotalSize(transfer: Transfer): number {
  return (
    transfer.totalSize ??
    transfer.files?.reduce((sum, file) => sum + (file.size ?? 0), 0) ??
    0
  );
}

export function getTransferLink(transfer: Transfer): string {
  if (transfer.link?.url) return transfer.link.url;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/t/${transfer.link?.shortCode ?? transfer.id}`;
}

export function getTransferSenderLabel(transfer: Transfer): string {
  return (
    transfer.sender?.name ??
    transfer.sender?.email ??
    "Unknown sender"
  );
}

export function getTransferSenderEmail(transfer: Transfer): string | undefined {
  return transfer.sender?.email;
}
