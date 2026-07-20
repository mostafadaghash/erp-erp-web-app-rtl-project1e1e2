"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <button
      className="px-4 py-2 rounded-lg font-medium transition-all duration-200"
      style={{
        background: 'rgba(239, 68, 68, 0.1)',
        color: '#DC2626',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
        e.currentTarget.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(239, 68, 68, 0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
        e.currentTarget.style.border = '1px solid rgba(239, 68, 68, 0.2)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
      }}
      onClick={() => void signOut()}
    >
      Sign Out
    </button>
  );
}
