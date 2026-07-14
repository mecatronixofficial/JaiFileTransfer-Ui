import { toast } from "sonner";

type ToastOptions = Parameters<typeof toast.success>[1];

export const showToast = {
  success: (message: string, options?: ToastOptions) =>
    toast.success(message, options),

  error: (message: string, options?: ToastOptions) =>
    toast.error(message, options),

  info: (message: string, options?: ToastOptions) =>
    toast.info(message, options),

  warning: (message: string, options?: ToastOptions) =>
    toast.warning(message, options),

  loading: (message: string, options?: ToastOptions) =>
    toast.loading(message, options),

  promise: toast.promise,

  dismiss: toast.dismiss,
};
