import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Check, EyeOff, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

type ModerationReport = {
  id: number;
  targetType: "resource" | "comment";
  targetId: number;
  reason: string;
  details: string | null;
  status: "open" | "dismissed" | "actioned";
  createdAt: Date;
  reporter: { fullName: string; username: string };
};

export default function AdminModeration() {
  const utils = trpc.useUtils();
  const reportsQuery = trpc.moderation.list.useQuery();
  const resolveMutation = trpc.moderation.resolve.useMutation({ onSuccess: () => { void utils.moderation.list.invalidate(); void utils.resource.list.invalidate(); toast.success("Moderation action saved."); }, onError: (error) => toast.error(error.message) });
  const reports = (reportsQuery.data ?? []) as ModerationReport[];
  return <DashboardLayout><div className="moderation-page"><div className="moderation-hero"><div><span><ShieldCheck size={15} /> ADMINISTRATION</span><h1>Moderation queue</h1><p>Review reports from the Kuppi community and take a transparent action on the reported note or comment.</p></div><div className="moderation-count"><AlertTriangle size={18} /><strong>{reports.filter((report) => report.status === "open").length}</strong><span>open reports</span></div></div>{reportsQuery.isLoading ? <div className="moderation-empty"><Loader2 className="animate-spin" /> Loading reports…</div> : reports.length ? <div className="report-list">{reports.map((report) => <article className={`report-card report-${report.status}`} key={report.id}><div className="report-meta"><span className="report-type">{report.targetType}</span><span>Report #{report.id} · item #{report.targetId}</span><span>{new Date(report.createdAt).toLocaleDateString()}</span></div><h2>{report.reason}</h2>{report.details && <p>{report.details}</p>}<div className="report-reporter">Reported by <strong>{report.reporter.fullName}</strong> <span>@{report.reporter.username}</span></div>{report.status === "open" ? <div className="report-actions"><Button onClick={() => resolveMutation.mutate({ reportId: report.id, action: "dismiss" })} variant="outline" className="rounded-full border-[#ded6cd] bg-white font-bold"><Check size={15} /> Dismiss</Button><Button onClick={() => resolveMutation.mutate({ reportId: report.id, action: "hide" })} className="rounded-full bg-[#524483] font-bold text-white hover:bg-[#403568]"><EyeOff size={15} /> Hide</Button><Button onClick={() => resolveMutation.mutate({ reportId: report.id, action: "remove" })} className="rounded-full bg-[#bd4d55] font-bold text-white hover:bg-[#a43c45]"><Trash2 size={15} /> Remove</Button></div> : <div className="resolved-state"><Check size={14} /> {report.status === "dismissed" ? "Dismissed" : "Actioned"}</div>}</article>)}</div> : <div className="moderation-empty"><ShieldCheck size={28} /><strong>No reports need attention.</strong><p>When a student reports a note or comment, it will appear here for review.</p></div>}</div></DashboardLayout>;
}
