"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      window.location.reload();
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <button
      type="button"
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 transition hover:border-red-400/30 hover:bg-red-500/15 hover:text-red-200 disabled:cursor-wait disabled:opacity-70"
      onClick={() => void handleSignOut()}
      disabled={isSigningOut}
      aria-busy={isSigningOut}
    >
      <LogOut className="h-4 w-4" />
      {isSigningOut ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
