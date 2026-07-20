"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * PROTECTED TEMPLATE COMPONENT
 *
 * This authentication form uses locked template styling:
 * - Blue gradient (#3B82F6 to #2563EB) for buttons and accents
 * - Centered compact layout (max-width: 28rem)
 * - White card with subtle shadow
 *
 * Design analysis from uploaded images does NOT apply to this component.
 * DO NOT modify styling to match user designs - auth must remain consistent.
 */
export function SignInForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      className="flex items-center justify-center relative"
      style={{
        maxWidth: '100vw',
        overflow: 'hidden',
        minHeight: 'auto',
        padding: '2rem'
      }}
    >
      {/* Decorative gradient circles */}
      <div
        className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #ffffff, transparent)',
          transform: 'translate(30%, -30%)',
          filter: 'blur(40px)'
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-48 h-48 opacity-10 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #ffffff, transparent)',
          transform: 'translate(-30%, 30%)',
          filter: 'blur(30px)'
        }}
      />

      {/* Auth card */}
      <div
        className="w-full rounded-2xl shadow-2xl overflow-hidden relative z-10"
        style={{
          maxWidth: '28rem', // 448px - prevents horizontal stretching
          margin: '0 auto', // ensures centering even if parent changes
          background: 'linear-gradient(to bottom, #FFFFFF, #FAFAFA)'
        }}
      >
        <div className="p-8">
          <h2 className="text-2xl font-bold mb-2 text-center" style={{ color: '#111827' }}>
            {flow === "signIn" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-sm mb-6 text-center" style={{ color: '#6B7280' }}>
            {flow === "signIn"
              ? "Sign in to continue to your account"
              : "Sign up to get started"}
          </p>

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitting(true);
              const formData = new FormData(e.target as HTMLFormElement);
              formData.set("flow", flow);
              void signIn("password", formData).catch((error) => {
                let toastTitle = "";
                if (error.message.includes("InvalidAccountId")) {
                  toastTitle = "Account not found. Please sign up first.";
                } else if (error.message.includes("Invalid password")) {
                  toastTitle = "Invalid password. Please try again.";
                } else {
                  toastTitle =
                    flow === "signIn"
                      ? "Could not sign in, did you mean to sign up?"
                      : "Could not sign up, did you mean to sign in?";
                }
                toast.error(toastTitle);
                setSubmitting(false);
              });
            }}
          >
            <div>
              <label className="block text-sm font-medium mb-2 text-left" style={{ color: '#374151' }}>
                Email
              </label>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 rounded-lg transition-all duration-200 outline-none text-left"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(229, 231, 235, 0.7)',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.3)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(229, 231, 235, 0.7)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-left" style={{ color: '#374151' }}>
                Password
              </label>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-lg transition-all duration-200 outline-none text-left"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(229, 231, 235, 0.7)',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.3)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(229, 231, 235, 0.7)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(to right, #3B82F6, #2563EB)',
                color: '#FFFFFF',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                transform: 'translateY(0)'
              }}
              onMouseEnter={(e) => {
                if (!submitting) {
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {submitting ? "Please wait..." : (flow === "signIn" ? "Sign In" : "Sign Up")}
            </button>

            <div className="text-center text-sm" style={{ color: '#6B7280' }}>
              <span>
                {flow === "signIn"
                  ? "Don't have an account? "
                  : "Already have an account? "}
              </span>
              <button
                type="button"
                className="font-medium cursor-pointer transition-colors duration-200"
                style={{ color: '#3B82F6' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#2563EB';
                  e.currentTarget.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#3B82F6';
                  e.currentTarget.style.textDecoration = 'none';
                }}
                onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
              >
                {flow === "signIn" ? "Sign up" : "Sign in"}
              </button>
            </div>
          </form>

          <div className="flex items-center justify-center my-6">
            <hr className="grow" style={{ borderTop: '1px solid rgba(229, 231, 235, 0.7)' }} />
            <span className="mx-4 text-sm" style={{ color: '#9CA3AF' }}>or</span>
            <hr className="grow" style={{ borderTop: '1px solid rgba(229, 231, 235, 0.7)' }} />
          </div>

          <button
            className="w-full px-4 py-3 rounded-lg font-medium transition-all duration-200"
            style={{
              background: '#FFFFFF',
              color: '#374151',
              border: '1px solid rgba(229, 231, 235, 0.7)',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#FAFAFA';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
            }}
            onClick={() => void signIn("anonymous")}
          >
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
