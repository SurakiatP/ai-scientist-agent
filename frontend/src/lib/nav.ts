import { useContext } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

// Go to /chat when another page (e.g. /files) is showing. Outside the app router (unit tests) it does nothing, unlike useRouter, which throws there.
export function useGoChat() {
  const router = useContext(AppRouterContext);
  return () => { if (router && window.location.pathname !== "/chat") router.push("/chat"); };
}

// Go to /files from a dialog (no-op outside the app router, as above).
export function useGoFiles() {
  const router = useContext(AppRouterContext);
  return () => { if (router) router.push("/files"); };
}
