export const SITE_NAME = "Jai Export Enterprises";
export const SITE_TITLE = `${SITE_NAME} - Secure File Transfer`;
export const SITE_DESCRIPTION =
  "Send, receive, and store files securely with fast transfers, protected links, and reliable cloud storage from Jai Export Enterprises.";

const configuredSiteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://export.jai-india.com";

export const SITE_URL = new URL(configuredSiteUrl);
export const SITE_URL_STRING = SITE_URL.toString().replace(/\/$/, "");

export const SITE_KEYWORDS = [
  "Jai Export Enterprises",
  "secure file transfer",
  "encrypted file sharing",
  "cloud file storage",
  "large file transfer",
  "business file sharing",
];
