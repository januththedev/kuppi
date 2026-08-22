import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { BookOpen, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { useLocation } from "wouter";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const accountQuery = trpc.account.me.useQuery();
  const logoutMutation = trpc.account.logout.useMutation({ onSuccess: () => { void utils.account.me.invalidate(); setLocation("/"); } });
  const student = accountQuery.data;
  if (accountQuery.isLoading) return <div className="dashboard-loading">Loading your student space…</div>;
  if (!student) return <div className="dashboard-auth-wall"><div><span className="brand-orb"><span /></span></div><h1>Your Kuppi dashboard is personal.</h1><p>Sign in to see your real saved resources, contributions and current rank.</p><Button onClick={() => setLocation("/")} className="rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">Back to Kuppi</Button></div>;
  return <div className="dashboard-shell"><aside className="dashboard-sidebar"><button className="dashboard-brand" onClick={() => setLocation("/")}><span className="brand-orb"><span /></span> Kuppi</button><div className="dashboard-nav"><button className="dashboard-nav-active"><LayoutDashboard size={17} /> Overview</button><button onClick={() => setLocation("/")}><BookOpen size={17} /> Discover resources</button></div><div className="dashboard-user"><span>{student.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{student.fullName}</strong><small>@{student.username}</small></div></div><button className="dashboard-signout" onClick={() => logoutMutation.mutate()}><LogOut size={16} /> Sign out</button></aside><main className="dashboard-main">{children}</main></div>;
}
