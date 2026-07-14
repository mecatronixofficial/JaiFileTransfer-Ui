"use client";

import {
  Image,
  Video,
  Music,
  FileText,
  Archive,
  Code,
  Table,
  Monitor,
  File,
} from "lucide-react";

interface FileTypeIconProps {
  mime?: string;
  ext?: string;
  size?: number;
  className?: string;
}

const CODE_EXTENSIONS = [
  "js","ts","jsx","tsx","json","html","css","scss","sass",
  "py","java","c","cpp","go","rs","php","rb","swift","kt",
  "sql","sh","bash","yml","yaml",
];

export function FileTypeIcon({ mime = "", ext = "", size = 20, className = "" }: FileTypeIconProps) {
  const e = ext.toLowerCase();
  const props = { size, className };

  if (mime.startsWith("image/")) return <Image {...props} className={`text-blue-500 ${className}`} />;
  if (mime.startsWith("video/")) return <Video {...props} className={`text-purple-500 ${className}`} />;
  if (mime.startsWith("audio/")) return <Music {...props} className={`text-pink-500 ${className}`} />;

  if (mime === "application/pdf" || e === "pdf")
    return <FileText {...props} className={`text-red-500 ${className}`} />;

  if (mime.includes("word") || ["doc", "docx"].includes(e))
    return <FileText {...props} className={`text-blue-600 ${className}`} />;

  if (mime.includes("excel") || ["xls", "xlsx", "csv"].includes(e))
    return <Table {...props} className={`text-green-600 ${className}`} />;

  if (mime.includes("powerpoint") || ["ppt", "pptx"].includes(e))
    return <Monitor {...props} className={`text-orange-500 ${className}`} />;

  if (mime.includes("zip") || mime.includes("rar") || mime.includes("tar") || mime.includes("7z") ||
      ["zip", "rar", "7z", "tar", "gz"].includes(e))
    return <Archive {...props} className={`text-amber-500 ${className}`} />;

  if (mime.startsWith("text/") || CODE_EXTENSIONS.includes(e))
    return <Code {...props} className={`text-cyan-500 ${className}`} />;

  return <File {...props} className={`text-gray-400 ${className}`} />;
}

export default FileTypeIcon;
