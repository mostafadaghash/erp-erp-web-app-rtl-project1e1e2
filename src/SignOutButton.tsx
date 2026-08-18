"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isAuthenticated) return null;

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
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-wait disabled:opacity-60 lg:w-auto"
      onClick={() => void handleSignOut()}
      disabled={isSigningOut}
      aria-busy={isSigningOut}
    >
      <LogOut className="h-4 w-4" />
      {isSigningOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
