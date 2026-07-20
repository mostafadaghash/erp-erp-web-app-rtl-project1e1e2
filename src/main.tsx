import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  // Notify Stunning of error
  window.parent?.postMessage({ type: 'STUNNING_APP_ERROR', error: 'MISSING_CONVEX_URL' }, '*');

  // Show recoverable error instead of crashing
  createRoot(document.getElementById("root")!).render(
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: '#e53e3e' }}>⚠️ Configuration Error</h1>
      <p>Missing VITE_CONVEX_URL environment variable.</p>
      <p><strong>To fix:</strong> Ask the AI to redeploy the application.</p>
      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Technical Details</summary>
        <p>The Convex deployment URL wasn't properly configured. This usually happens if:</p>
        <ul>
          <li>The deploy step failed partway through</li>
          <li>The .env.local file wasn't created</li>
        </ul>
        <p>Solution: Tell the AI "Please redeploy" and it will fix this automatically.</p>
      </details>
    </div>
  );
} else {
  const convex = new ConvexReactClient(convexUrl);

  // Intercept Convex errors and show user-friendly messages
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    // Check if this is a Convex error
    const errorMessage = args.join(' ');
    if (errorMessage.includes('[CONVEX') && errorMessage.includes('Server Error')) {
      // Extract just the actual error message
      const match = errorMessage.match(/Uncaught Error: (.+?)(?:\n|at handler)/);
      if (match) {
        // Show simplified error
        console.warn('⚠️ Error:', match[1]);
        return; // Don't show the full technical error
      }
    }
    // For non-Convex errors, use original console.error
    originalConsoleError.apply(console, args);
  };

  createRoot(document.getElementById("root")!).render(
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>,
  );
}
