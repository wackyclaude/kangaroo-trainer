import type { ApiError } from "../shared/types";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiFailure(res.status, data as ApiError);
  return data as T;
}

export const api = {
  get: <T,>(url: string) => call<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => call<T>("POST", url, body ?? {}),
  put: <T,>(url: string, body: unknown) => call<T>("PUT", url, body),
  patch: <T,>(url: string, body: unknown) => call<T>("PATCH", url, body),
  del: <T,>(url: string) => call<T>("DELETE", url),
};

export function messageOf(e: unknown): string {
  if (e instanceof ApiFailure) return e.body.message ?? "Something went wrong.";
  return "Can't reach the app server. Is the Mac on and running it?";
}
