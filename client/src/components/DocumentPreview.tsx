import { FileDown, FileText, Image as ImageIcon, Play, Volume2 } from "lucide-react";
import { documentPreviewMode } from "@/lib/documentPreview";

type DocumentPreviewProps = { url: string; mimeType: string; fileName: string };

export default function DocumentPreview({ url, mimeType, fileName }: DocumentPreviewProps) {
  const mode = documentPreviewMode(mimeType);
  if (mode === "document") return <section className="document-preview"><div className="document-preview-heading"><span><FileText size={16} /> In-browser preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><iframe title={`Preview of ${fileName}`} src={url} sandbox="" referrerPolicy="no-referrer" /></section>;
  if (mode === "image") return <section className="document-preview"><div className="document-preview-heading"><span><ImageIcon size={16} /> Image preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><img src={url} alt={fileName} /></section>;
  if (mode === "video") return <section className="document-preview"><div className="document-preview-heading"><span><Play size={16} /> Video preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><video controls preload="metadata" src={url}>Your browser cannot preview this video.</video></section>;
  if (mode === "audio") return <section className="document-preview"><div className="document-preview-heading"><span><Volume2 size={16} /> Audio preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><audio controls preload="metadata" src={url}>Your browser cannot preview this audio file.</audio></section>;
  return <section className="document-preview document-preview-fallback"><FileText size={23} /><strong>This file type opens in your device’s compatible app.</strong><p>Download the original file to open it with the software you use for this format.</p><a href={url} target="_blank" rel="noreferrer"><FileDown size={15} /> Open / download file</a></section>;
}
