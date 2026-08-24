import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AdminModeration from "./pages/AdminModeration";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ResourcePermalink from "./pages/ResourcePermalink";
import { useParams } from "wouter";

// Bare numeric paths (/123) are file permalinks; any other single segment is
// a genuine 404. Validated here because wouter's inline regex params proved
// unreliable across versions.
function PermalinkOrNotFound() {
  const id = Number(Object.values(useParams())[0]);
  if (!Number.isInteger(id) || id <= 0) return <NotFound />;
  return <ResourcePermalink id={id} />;
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/dashboard" component={Dashboard} /><Route path="/r/:id" component={ResourcePermalink} /><Route path="/admin/moderation" component={AdminModeration} /><Route path="/:fileId" component={PermalinkOrNotFound} /><Route component={NotFound} /></Switch>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
