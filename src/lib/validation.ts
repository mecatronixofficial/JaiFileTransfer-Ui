const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function parseRecipientEmails(value: string): {
  valid: string[];
  invalid: string[];
} {
  const unique = new Map<string, string>();
  const invalid: string[] = [];

  for (const raw of value.split(/[\s,;]+/)) {
    const email = raw.trim();
    if (!email) continue;
    if (!isValidEmail(email)) {
      invalid.push(email);
      continue;
    }
    const key = email.toLowerCase();
    if (!unique.has(key)) unique.set(key, email);
  }

  return { valid: [...unique.values()], invalid };
}
