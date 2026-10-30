export interface TapCloudArchive {
  uuid: string;
  fileId: string;
  name: string;
  summary: string;
  modifiedAt: string;
}

interface AndroidTapBridge {
  postMessage(message: string): void;
  showPrivacyPolicy?: () => void;
}

declare global {
  interface Window {
    UrbanLifeTap?: AndroidTapBridge;
  }
}

let requestSequence = 0;
const RESPONSE_EVENT = "urbanlife-taptap-response";

export function hasTapTapCloudBridge(): boolean {
  return typeof window !== "undefined" && typeof window.UrbanLifeTap?.postMessage === "function";
}

function request<T>(action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const bridge = typeof window !== "undefined" ? window.UrbanLifeTap : undefined;
  if (!bridge) return Promise.reject(new Error("当前版本没有 TapTap 云存档功能"));

  const id = `${Date.now()}-${++requestSequence}`;
  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      window.removeEventListener(RESPONSE_EVENT, onResponse);
      signal?.removeEventListener("abort", onAbort);
    };
    const timeout = window.setTimeout(() => {
      window.removeEventListener(RESPONSE_EVENT, onResponse);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("TapTap 云存档请求超时（25 秒），请刷新后重试"));
    }, 25_000);
    const onAbort = (): void => {
      cleanup();
      reject(new Error("已停止等待；请刷新确认云端操作状态"));
    };

    const onResponse = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail;
      let response: { id?: string; ok?: boolean; data?: T; error?: string };
      try {
        response = JSON.parse(detail) as typeof response;
      } catch {
        return;
      }
      if (response.id !== id) return;
      cleanup();
      if (!response.ok) reject(new Error(response.error || "TapTap 云存档操作失败"));
      else resolve(response.data as T);
    };

    window.addEventListener(RESPONSE_EVENT, onResponse);
    try {
      bridge.postMessage(JSON.stringify({ id, action, payload }));
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("无法连接 TapTap 云存档服务"));
    }
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function listTapCloudArchives(signal?: AbortSignal): Promise<TapCloudArchive[]> {
  return request<TapCloudArchive[]>("cloud_list", {}, signal);
}

export function uploadTapCloudSave(data: string, signal?: AbortSignal): Promise<TapCloudArchive> {
  return request<TapCloudArchive>("cloud_upload", { data }, signal);
}

export function downloadTapCloudSave(uuid: string, fileId: string, signal?: AbortSignal): Promise<{ saveJson: string }> {
  return request<{ saveJson: string }>("cloud_download", { uuid, fileId }, signal);
}
