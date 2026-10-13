import { HashRouter, Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import ErrorBoundary from "@/components/error-boundary";
import Studio from "@/pages/studio";
import Playback from "@/pages/playback";
import SessionEditor from "@/pages/session-editor";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <HashRouter>
      <TooltipProvider>
        <ErrorBoundary>
          <div className="dark">
            <Routes>
              <Route path="/" element={<Studio />} />
              <Route path="/playback/:id" element={<Playback />} />
              <Route path="/edit/:sessionId" element={<SessionEditor />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Toaster />
          </div>
        </ErrorBoundary>
      </TooltipProvider>
    </HashRouter>
  );
}
