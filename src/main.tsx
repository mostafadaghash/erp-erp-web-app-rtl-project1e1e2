import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import "./professional-ui.css";
import App from "./App";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  createRoot(document.getElementById("root")!).render(
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-xl text-amber-700">
          !
        </div>
        <h1 className="text-xl font-black text-slate-900">تعذر تشغيل النظام</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          لم تكتمل إعدادات الاتصال بالخدمة. يرجى التواصل مع مسؤول النظام ثم إعادة المحاولة.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);

  // Keep technical server traces out of the user-facing browser experience.
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const errorMessage = args.map(String).join(" ");
    if (errorMessage.includes("[CONVEX") && errorMessage.includes("Server Error")) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  createRoot(document.getElementById("root")!).render(
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>,
  );
}
