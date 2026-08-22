import { FileDown, FileText, Image as ImageIcon, Play, Sparkles, Volume2 } from "lucide-react";
import { documentPreviewMode } from "@/lib/documentPreview";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

type DocumentPreviewProps = { url: string; mimeType: string; fileName: string; resourceId?: number };

export default function DocumentPreview({ url, mimeType, fileName, resourceId }: DocumentPreviewProps) {
  const mode = documentPreviewMode(mimeType);
  const [progress, setProgress] = useState(0);
  const [questions, setQuestions] = useState<any[]>([]);
  const [quizId, setQuizId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const accountQuery = trpc.account.me.useQuery();
  const relatedQuery = trpc.resource.relatedByUrl.useQuery({ storageUrl: url });
  const viewMutation = trpc.resource.markViewedByUrl.useMutation();
  const progressMutation = trpc.learning.updateProgressByUrl.useMutation();
  const quizMutation = trpc.learning.generateQuizByUrl.useMutation({ onSuccess: (data) => { setQuestions(data.questions); setQuizId(data.id ?? null); setAnswers([]); setResult(null); } });
  const submitMutation = trpc.learning.submitQuiz.useMutation({ onSuccess: (data) => setResult(data) });
  useEffect(() => { if (accountQuery.data) viewMutation.mutate({ storageUrl: url }); }, [url, accountQuery.data?.id]);
  const related = relatedQuery.data?.length ? <section className="related-notes"><div className="related-notes-heading"><span><FileText size={16} /> Related notes</span><small>Same subject & level</small></div><div>{relatedQuery.data.map((resource) => <a key={resource.id} href={resource.storageUrl} target="_blank" rel="noreferrer"><span className="related-note-icon"><FileText size={14} /></span><span><strong>{resource.title}</strong><small>{resource.subject} · {resource.studyLevel} · {resource.likeCount} likes</small></span><FileDown size={14} /></a>)}</div></section> : null;
  const learningTools = accountQuery.data ? <section className="learning-tools"><div><strong>Continue reading</strong><span>{progress}% marked complete</span></div><input type="range" min="0" max="100" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /><button onClick={() => progressMutation.mutate({ storageUrl: url, progressPercent: progress, lastPage: Math.max(1, Math.ceil(progress / 10)) })}>Save my place</button>{(mimeType === "application/pdf" || mimeType.startsWith("image/")) && <button className="ai-quiz-button" disabled={quizMutation.isPending} onClick={() => quizMutation.mutate({ storageUrl: url })}><Sparkles size={15} /> {quizMutation.isPending ? "Making quiz…" : "Make AI quiz"}</button>}{questions.length > 0 && <div className="quiz-preview"><strong>Your MCQ quiz is ready</strong>{questions.map((question, index) => <div key={index}><b>{index + 1}. {question.question}</b>{question.options.map((option: string, optionIndex: number) => <label key={optionIndex}><input type="radio" name={`q-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers((current) => { const next = [...current]; next[index] = optionIndex; return next; })} /> {option}</label>)}{result && <small>{answers[index] === question.correctIndex ? "Correct — " : "Review — "}{question.explanation}</small>}</div>)}{result ? <p className="quiz-result">Score: {result.score}/{result.total}</p> : <button disabled={!quizId || answers.filter((answer) => answer !== undefined).length !== questions.length || submitMutation.isPending} onClick={() => quizId && submitMutation.mutate({ quizId, answers, correctIndexes: questions.map((question) => question.correctIndex) })}>Submit answers</button>}</div>}</section> : null;
  if (mode === "document") return <><section className="document-preview"><div className="document-preview-heading"><span><FileText size={16} /> In-browser preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><iframe title={`Preview of ${fileName}`} src={url} sandbox="" referrerPolicy="no-referrer" /></section>{learningTools}{related}</>;
  if (mode === "image") return <><section className="document-preview"><div className="document-preview-heading"><span><ImageIcon size={16} /> Image preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><img src={url} alt={fileName} /></section>{learningTools}{related}</>;
  if (mode === "video") return <><section className="document-preview"><div className="document-preview-heading"><span><Play size={16} /> Video preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><video controls preload="metadata" src={url}>Your browser cannot preview this video.</video></section>{related}</>;
  if (mode === "audio") return <><section className="document-preview"><div className="document-preview-heading"><span><Volume2 size={16} /> Audio preview</span><a href={url} target="_blank" rel="noreferrer"><FileDown size={14} /> Open / download</a></div><audio controls preload="metadata" src={url}>Your browser cannot preview this audio file.</audio></section>{related}</>;
  return <section className="document-preview document-preview-fallback"><FileText size={23} /><strong>This file type opens in your device’s compatible app.</strong><p>Download the original file to open it with the software you use for this format.</p><a href={url} target="_blank" rel="noreferrer"><FileDown size={15} /> Open / download file</a></section>;
}
