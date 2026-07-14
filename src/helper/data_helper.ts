export interface NavItem {
  name: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { name: 'Origin',   href: '#hero' },
  { name: 'Team',     href: '/team' },
  { name: 'Partners', href: '/partners' },
  { name: 'Contact',  href: '/contact' },
  { name: 'Careers',  href: '/careers' },
];

/** Storage quota tiers shown in the UI (bytes). */
export const STORAGE_TIERS = {
  FREE:  10  * 1024 ** 3,  // 10 GB
  BASIC: 100 * 1024 ** 3,  // 100 GB
  PRO:   500 * 1024 ** 3,  // 500 GB
} as const;

export type StorageTier = keyof typeof STORAGE_TIERS;

/** Upload limits. */
export const UPLOAD_LIMITS = {
  /** Max size per uploaded file. */
  MAX_FILE_BYTES:       100 * 1024 ** 3,   // 100 GB per file
  /** Max combined size for one multi-file upload batch. */
  MAX_BATCH_BYTES:      500 * 1024 ** 3,   // 500 GB per batch
  /** Max size per file for a simple server-side upload. */
  SIMPLE_MAX_BYTES:     4 * 1024 * 1024,   // 4 MB, below Vercel Function 4.5 MB payload limit
  /** Files larger than this trigger multipart upload. */
  MULTIPART_THRESHOLD:  4 * 1024 * 1024,   // 4 MB, avoids proxying upload bodies through Vercel
  /** Target size for each multipart part. */
  PART_SIZE:            64 * 1024 * 1024,  // 64 MB
  /** Max concurrent part uploads per file. */
  MAX_CONCURRENT_PARTS: 3,
} as const;

/** Default pagination page size. */
export const DEFAULT_PAGE_SIZE = 20;
