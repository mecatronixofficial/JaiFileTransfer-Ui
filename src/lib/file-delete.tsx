"use client";

import { filesApi } from "@/lib/api";
import { handleApiError } from "@/lib/error-handler";
import { showToast } from "@/lib/toast";

export async function deleteFile(fileId: string): Promise<boolean> {
  if (!fileId) {
    showToast.error("File ID is missing. Please refresh and try again.");
    return false;
  }

  if (!window.confirm("Move this file to trash? You can restore it later.")) {
    return false;
  }

  try {
    await filesApi.delete(fileId);
    showToast.success("Moved to trash");
    return true;
  } catch (err) {
    handleApiError(err);
    return false;
  }
}

export async function bulkDeleteFiles(fileIds: string[]): Promise<boolean> {
  const ids = fileIds.filter(Boolean);
  if (ids.length === 0) {
    showToast.error("No files selected");
    return false;
  }

  try {
    await filesApi.bulkDelete(ids);
    showToast.success(`${ids.length} file${ids.length > 1 ? "s" : ""} moved to trash`);
    return true;
  } catch (err) {
    handleApiError(err);
    return false;
  }
}
