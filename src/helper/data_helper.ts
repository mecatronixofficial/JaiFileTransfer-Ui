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

/** Upload limits. */
export const UPLOAD_LIMITS = {
  /** Max size per uploaded file. */
  MAX_FILE_BYTES:       100 * 1024 ** 3,   // 100 GB per file
  /** Max combined size for one multi-file upload batch. */
  MAX_BATCH_BYTES:      500 * 1024 ** 3,   // 500 GB per batch
  /** Max size per file for a simple server-side upload. */
  SIMPLE_MAX_BYTES:     4 * 1024 * 1024,   // 4 MB, below Vercel Function 4.5 MB payload limit
  /** Files at or above this size use parallel multipart upload; smaller files use one direct PUT. */
  MULTIPART_THRESHOLD:  16 * 1024 * 1024,  // 16 MB
  /** Target size for each multipart part (grown automatically for huge files to stay under 10,000 parts). */
  PART_SIZE:            16 * 1024 * 1024,  // 16 MB
  /** Max concurrent part uploads per file. */
  MAX_CONCURRENT_PARTS: 6,
  /** Concurrent files when every file is small. */
  MAX_CONCURRENT_SMALL_FILES: 6,
  /** Concurrent files when the batch includes multipart files (each already runs parts in parallel). */
  MAX_CONCURRENT_LARGE_FILES: 2,
} as const;

/** Default pagination page size. */
export const DEFAULT_PAGE_SIZE = 20;
