import { BookOpen, ChevronRight, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type RelatedNotesProps = { resourceId: number; onOpen: (resource: any) => void };

export default function RelatedNotes({ resourceId, onOpen }: RelatedNotesProps) {
  const relatedQuery = trpc.resource.related.useQuery({ id: resourceId });
  if (relatedQuery.isLoading) return <div className="related-notes-loading"><Loader2 className="animate-spin" size={15} /> Finding related notes…</div>;
  if (!relatedQuery.data?.length) return null;
  return <section className="related-notes"><div className="related-notes-heading"><span><BookOpen size={16} /> Related notes</span><small>Same subject & level</small></div><div>{relatedQuery.data.map((resource) => <button key={resource.id} onClick={() => onOpen(resource)}><span className="related-note-icon"><BookOpen size={14} /></span><span><strong>{resource.title}</strong><small>{resource.subject} · {resource.studyLevel} · {resource.likeCount} likes</small></span><ChevronRight size={15} /></button>)}</div></section>;
}
