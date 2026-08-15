"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <button
      type="button"
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 transition hover:border-red-400/30 hover:bg-red-500/15 hover:text-red-200"
      onClick={() => void signOut()}
    >
      <LogOut className="h-4 w-4" />
      تسجيل الخروج
    </button>
  );
}
