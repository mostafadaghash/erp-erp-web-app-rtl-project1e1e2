import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import "./professional-ui.css";
import "./professional-navigation.css";
import "./dashboard-reference.css";
import "./dashboard-final-fixes.css";
import App from "./App";

class RuntimeErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ERP runtime failure", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        dir="rtl"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f7f9fc",
          padding: "24px",
          fontFamily: "Tajawal, system-ui, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(100%, 540px)",
            background: "white",
            border: "1px solid #e6ebf2",
            borderRadius: "20px",
            padding: "32px",
            boxShadow: "0 18px 50px rgba(15,23,42,.08)",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, color: "#172033", fontSize: "24px", fontWeight: 900 }}>
            تعذر عرض النظام
          </h1>
          <p style={{ margin: "12px 0 20px", color: "#697586", lineHeight: 1.9 }}>
            حدث خطأ أثناء تشغيل الواجهة. أعد المحاولة، وإذا استمر الخطأ فسيتم التعامل معه من سجل التشغيل.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: "12px",
              padding: "11px 18px",
              background: "#0f5d63",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </section>
      </main>
    );
  }
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  createRoot(document.getElementById("root")!).render(
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f7f9fc",
        padding: "24px",
        fontFamily: "Tajawal, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(100%, 520px)",
          background: "white",
          border: "1px solid #e6ebf2",
          borderRadius: "20px",
          padding: "32px",
          boxShadow: "0 18px 50px rgba(15,23,42,.08)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "58px",
            height: "58px",
            margin: "0 auto 18px",
            borderRadius: "16px",
            display: "grid",
            placeItems: "center",
            background: "#eaf8f1",
            color: "#159a63",
            fontSize: "26px",
            fontWeight: 900,
          }}
        >
          !
        </div>
        <h1 style={{ margin: 0, color: "#172033", fontSize: "24px", fontWeight: 900 }}>
          الخدمة غير متاحة مؤقتًا
        </h1>
        <p style={{ margin: "12px 0 0", color: "#697586", lineHeight: 1.9 }}>
          تعذر تشغيل النظام في الوقت الحالي. يرجى المحاولة مرة أخرى بعد قليل أو التواصل مع مسؤول النظام إذا استمرت المشكلة.
        </p>
      </section>
    </main>,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);

  createRoot(document.getElementById("root")!).render(
    <RuntimeErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    </RuntimeErrorBoundary>,
  );
}
