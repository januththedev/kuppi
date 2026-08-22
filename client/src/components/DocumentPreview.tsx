import { FileDown, FileText, Image as ImageIcon, Play, Volume2 } from "lucide-react";
import { documentPreviewMode } from "@/lib/documentPreview";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";

type DocumentPreviewProps = { url: string; mimeType: string; fileName: string };

export default function DocumentPreview({ url, mimeType, fileName }: DocumentPreviewProps) {
  const mode = documentPreviewMode(mimeType);
  const accountQuery = trpc.account.me.useQuery();
  const relatedQuery = trpc.resource.relatedByUrl.useQuery({ storageUrl: url });
  const viewMutation = trpc.resource.markViewedByUrl.useMutation();
  useEffect(() => { if (accountQuery.data) viewMutation.mutate({ storageUrl: url }); }, [url, accountQuery.data?.id]);
  const related = relatedQuery.data?.length ? <section className="related-notes"><div className="related-notes-heading"><span><FileText size={16} /> Related notes</span><small>Same subject & level</small></div><div>{relatedQuery.data.map((resource) => <a key={resource.id} href={resource.storageUrl} target="_blank" rel="noreferrer"><span className="related-note-icon"><FileText size={14} /></span><span><strong>{resource.title}</strong><small>{resource.subject} · {resource.studyLevel} · {resource.likeCount} likes</small></span><FileDown size={14} /></a>)}</div></section> : null;
  if (mode === "document") return <><section className="document-preview"><div className="document-preview-heading"><span><FileText size={16} /> In-browser preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><iframe title={`Preview of ${fileName}`} src={url} sandbox="" referrerPolicy="no-referrer" /></section>{related}</>;
  if (mode === "image") return <><section className="document-preview"><div className="document-preview-heading"><span><ImageIcon size={16} /> Image preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><img src={url} alt={fileName} /></section>{related}</>;
  if (mode === "video") return <><section className="document-preview"><div className="document-preview-heading"><span><Play size={16} /> Video preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><video controls preload="metadata" src={url}>Your browser cannot preview this video.</video></section>{related}</>;
  if (mode === "audio") return <><section className="document-preview"><div className="document-preview-heading"><span><Volume2 size={16} /> Audio preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><audio controls preload="metadata" src={url}>Your browser cannot preview this audio file.</audio></section>{related}</>;
  return <section className="document-preview document-preview-fallback"><FileText size={23} /><strong>This file type opens in your device’s compatible app.</strong><p>Download the original file to open it with the software you use for this format.</p><a href={url} target="_blank" rel="noreferrer"><FileDown size={15} /> Open / download file</a></section>;
}
