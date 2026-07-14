/* =========================================================
   TYPES
========================================================= */

export type ClassValue =
  | string
  | number
  | undefined
  | null
  | false
  | 0;

const WORKSPACE_LOCALES: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
};

export function getWorkspaceLocale(): string {
  if (typeof document === 'undefined') return WORKSPACE_LOCALES.en;
  return WORKSPACE_LOCALES[document.documentElement.lang] ?? WORKSPACE_LOCALES.en;
}

export function usesTwelveHourClock(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.dataset.timeFormat !== '24';
}

/* =========================================================
   FORMAT BYTES
========================================================= */

export function formatBytes(
  bytes?: number | null,
  decimals = 1,
): string {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }

  const k = 1024;

  const sizes = [
    'B',
    'KB',
    'MB',
    'GB',
    'TB',
    'PB',
  ];

  const i = Math.floor(
    Math.log(bytes) / Math.log(k),
  );

  const value = bytes / Math.pow(k, i);

  return `${parseFloat(
    value.toFixed(decimals),
  )} ${sizes[i]}`;
}

/* =========================================================
   FORMAT DATE
========================================================= */

export function formatDate(
  date?: string | Date | null,
  locale?: string,
): string {
  if (!date) return '--';

  return new Intl.DateTimeFormat(locale ?? getWorkspaceLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

/* =========================================================
   FORMAT DATE + TIME
========================================================= */

export function formatDateTime(
  date?: string | Date | null,
  locale?: string,
): string {
  if (!date) return '--';

  return new Intl.DateTimeFormat(locale ?? getWorkspaceLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',

    hour: 'numeric',
    minute: '2-digit',
    hour12: usesTwelveHourClock(),
  }).format(new Date(date));
}

/* =========================================================
   RELATIVE TIME
   Handles both past ("3d ago") and future ("in 3d") dates.
========================================================= */

export function formatRelative(
  date?: string | Date | null,
): string {
  if (!date) return '--';

  const now    = new Date();
  const target = new Date(date);
  const diff   = now.getTime() - target.getTime(); // positive = past, negative = future
  const abs    = Math.abs(diff);
  const future = diff < 0;

  const seconds = Math.floor(abs / 1000);

  if (seconds < 60) {
    return future ? 'in a moment' : 'just now';
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return future ? `in ${minutes}m` : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return future ? `in ${hours}h` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return future ? `in ${days}d` : `${days}d ago`;
  }

  const weeks = Math.floor(days / 7);

  if (weeks < 5) {
    return future ? `in ${weeks}w` : `${weeks}w ago`;
  }

  return formatDate(date);
}

/* =========================================================
   FILE ICON
========================================================= */

const CODE_EXTENSIONS = [
  'js',
  'ts',
  'jsx',
  'tsx',
  'json',
  'html',
  'css',
  'scss',
  'sass',
  'py',
  'java',
  'c',
  'cpp',
  'go',
  'rs',
  'php',
  'rb',
  'swift',
  'kt',
  'sql',
  'sh',
  'bash',
  'yml',
  'yaml',
];

export function getFileIcon(
  mime = '',
  ext = '',
): string {
  const extension = ext.toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';

  if (mime.includes('word') || ['doc', 'docx'].includes(extension)) return 'doc';
  if (mime.includes('excel') || ['xls', 'xlsx', 'csv'].includes(extension)) return 'spreadsheet';
  if (mime.includes('powerpoint') || ['ppt', 'pptx'].includes(extension)) return 'presentation';

  if (
    mime.includes('zip') || mime.includes('rar') ||
    mime.includes('tar') || mime.includes('7z')
  ) return 'archive';

  if (mime.startsWith('text/') || CODE_EXTENSIONS.includes(extension)) return 'code';

  return 'file';
}

/* =========================================================
   FILE COLOR CLASS
========================================================= */

export function getFileColorClass(
  mime = '',
): string {
  if (mime.startsWith('image/')) {
    return 'ft-image';
  }

  if (mime.startsWith('video/')) {
    return 'ft-video';
  }

  if (mime.startsWith('audio/')) {
    return 'ft-audio';
  }

  if (mime === 'application/pdf') {
    return 'ft-pdf';
  }

  if (
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('tar')
  ) {
    return 'ft-zip';
  }

  if (
    mime.startsWith('text/') ||
    mime.includes('javascript') ||
    mime.includes('json')
  ) {
    return 'ft-code';
  }

  return 'ft-default';
}

/* =========================================================
   GET INITIALS
========================================================= */

export function getInitials(
  name?: string | null,
): string {
  if (!name) return '?';

  return name
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/* =========================================================
   TRUNCATE
========================================================= */

export function truncate(
  value = '',
  maxLen = 30,
): string {
  if (value.length <= maxLen) {
    return value;
  }

  const extensionIndex =
    value.lastIndexOf('.');

  const hasExtension =
    extensionIndex > 0 &&
    value.length - extensionIndex <= 8;

  if (hasExtension) {
    const filename = value.slice(
      0,
      extensionIndex,
    );

    const extension = value.slice(
      extensionIndex,
    );

    return (
      filename.slice(
        0,
        maxLen - extension.length - 3,
      ) +
      '...' +
      extension
    );
  }

  return value.slice(0, maxLen - 3) + '...';
}

/* =========================================================
   DOWNLOAD BLOB
========================================================= */

export function downloadBlob(
  blob: Blob,
  filename: string,
) {
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();

  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

/* =========================================================
   CLASSNAMES / CN
========================================================= */

export function cn(
  ...classes: ClassValue[]
): string {
  return classes
    .filter(Boolean)
    .join(' ');
}

/* =========================================================
   SLEEP
========================================================= */

export function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

/* =========================================================
   RANDOM ID
========================================================= */

export function generateId(length = 12): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => chars[b % chars.length]).join('');
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/* =========================================================
   COPY TO CLIPBOARD
========================================================= */

export async function copyToClipboard(
  text: string,
): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FORMAT NUMBER
========================================================= */

export function formatNumber(
  value?: number | null,
  locale = 'en-US',
): string {
  if (value === undefined || value === null) {
    return '0';
  }

  return new Intl.NumberFormat(locale).format(
    value,
  );
}

/* =========================================================
   FORMAT COMPACT NUMBER
========================================================= */

export function formatCompactNumber(
  value?: number | null,
): string {
  if (value === undefined || value === null) {
    return '0';
  }

  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/* =========================================================
   FORMAT DURATION
   Converts seconds into a human-readable string: "2h 30m", "45s", etc.
========================================================= */

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/* =========================================================
   CLAMP
========================================================= */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* =========================================================
   DEBOUNCE
========================================================= */

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
