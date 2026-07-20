import { ConvexError } from "convex/values";

function messageFromData(data: unknown): string | undefined {
  if (typeof data === "string" && data.trim()) return data;
  if (typeof data === "object" && data !== null && "message" in data) {
    const message = data.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return undefined;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) return messageFromData(error.data) ?? fallback;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
