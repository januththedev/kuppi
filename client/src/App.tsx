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

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/dashboard" component={Dashboard} /><Route path="/r/:id" component={ResourcePermalink} /><Route path="/admin/moderation" component={AdminModeration} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
