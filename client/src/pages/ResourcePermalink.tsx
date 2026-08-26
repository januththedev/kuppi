import { Button } from "@/components/ui/button";
import DocumentPreview from "@/components/DocumentPreview";
import { trpc } from "@/lib/trpc";
import { usePageTitle } from "@/lib/pageTitle";
import { ArrowLeft, Check, FileDown, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

/** Public, shareable landing page for a single uploaded file: /{id} or /r/{id}. */
export default function ResourcePermalink({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const query = trpc.resource.byId.useQuery({ id });
  const resource = query.data as
    | { id: number; title: string; description: string; subject: string; studyLevel: string; examRelevance?: string | null; originalFileName: string; mimeType: string; fileSize: number; storageUrl: string; likeCount: number; tags?: string[]; author: { fullName: string; username: string } }
    | undefined;
  usePageTitle(resource ? `${resource.title} — Kuppi` : "Kuppi");

  if (query.isLoading) {
    return <div className="permalink-page"><div className="empty-resource"><Loader2 className="animate-spin text-[#5b35e8]" /><strong>Loading this resource…</strong></div></div>;
  }
  if (!resource) {
    return <div className="permalink-page"><div className="empty-resource real-empty"><strong>This link points to a resource that is no longer available.</strong><p>It may have been removed by Kuppi moderation.</p><Button onClick={() => setLocation("/")} className="mt-3 rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]"><ArrowLeft size={16} /> Back to the library</Button></div></div>;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the address bar still has it.
    }
  }

  return (
    <div className="permalink-page">
      <header className="sticky top-0 z-40 border-b border-[#e9e4dc]/90 bg-[#f8f5ef]/90 backdrop-blur-xl">
        <div className="container flex h-[74px] items-center justify-between gap-4">
          <a href="/" className="brand-mark"><span className="brand-orb"><span /></span><span>Kuppi</span></a>
          <Button onClick={() => setLocation("/")} variant="outline" className="h-10 rounded-full border-[#d8d0c7] bg-white px-4 text-sm font-bold text-[#292639] hover:bg-white"><ArrowLeft size={16} /> Browse the library</Button>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 820, paddingTop: 28, paddingBottom: 60 }}>
        <div className="resource-meta"><span className="kuppi-badge kuppi-badge-violet">{resource.subject}</span><span>{resource.studyLevel}{resource.examRelevance ? ` · ${resource.examRelevance}` : ""}</span></div>
        <h1 style={{ margin: "10px 0 6px", color: "#1c1a2c", fontFamily: '"Fraunces", serif', fontSize: 34, letterSpacing: "-1px" }}>{resource.title}</h1>
        <p style={{ color: "#756e7b", fontSize: 14, lineHeight: 1.65, margin: "0 0 10px" }}>{resource.description}</p>
        <p style={{ color: "#938b98", fontSize: 12, fontWeight: 700, margin: "0 0 18px" }}>
          Shared by {resource.author.fullName} (@{resource.author.username}) · {resource.likeCount} likes · {resource.originalFileName}
        </p>
        {resource.tags?.length ? <div className="tag-chip-row" style={{ margin: "-8px 0 18px" }}>{resource.tags.map((tag) => <a key={tag} className="tag-chip" href={`/?tag=${encodeURIComponent(tag)}`}>#{tag}</a>)}</div> : null}
        <DocumentPreview url={resource.storageUrl} mimeType={resource.mimeType} fileName={resource.originalFileName} fileLink={`/f/${id}`} />
        <div className="modal-action-row" style={{ marginTop: 18 }}>
          <a href={`/f/${id}`} target="_blank" rel="noreferrer" className="open-resource-button"><FileDown size={16} /> Open / download</a>
          <Button onClick={copyLink} variant="outline" className="rounded-full border-[#dad3cb] bg-white font-bold">
            {copied ? <Check size={15} /> : <Link2 size={15} />} {copied ? "Link copied" : "Copy link"}
          </Button>
        </div>
      </main>
      <footer className="footer"><div className="container footer-bottom"><span>© 2026 Kuppi. Learn. Share. Grow together.</span><span>Free study notes from Sri Lankan students.</span></div></footer>
    </div>
  );
}
