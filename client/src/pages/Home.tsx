import AccountRecovery from "@/components/AccountRecovery";
import DocumentPreview from "@/components/DocumentPreview";
import { Button } from "@/components/ui/button";
import { useTilt } from "@/hooks/useTilt";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Bookmark, Check, File, FileText, Flag, Heart, LayoutDashboard, Loader2, LogIn, MessageCircle, Plus, Search, Send, Share2, Sparkles, Upload, UserPlus, Users, X } from "lucide-react";
import { motion } from "framer-motion";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const riseInViewport = { initial: { opacity: 0, y: 26 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.55, ease: "easeOut" } } as const;

type Resource = {
  id: number;
  title: string;
  description: string;
  subject: string;
  studyLevel: string;
  stream: string | null;
  examRelevance: string | null;
  originalFileName: string;
  storageUrl: string;
  mimeType: string;
  fileSize: number;
  author: { fullName: string; username: string };
  likeCount: number;
  saveCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
};

const subjects = ["All", "Combined Maths", "Physics", "Chemistry", "Biology", "ICT", "Study Skills", "Other"];
const levels = ["All", "O/L", "A/L", "University"];

function initials(value: string) {
  return value.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "K";
}

function fileKind(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return "File";
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ResourceVisual({ resource }: { resource: Resource }) {
  const tone = ["violet", "coral", "mint", "sky"][resource.subject.length % 4];
  return <div className={`resource-visual resource-visual-${tone}`}><div className="visual-pattern visual-pattern-one" /><div className="visual-pattern visual-pattern-two" /><div className="visual-topline"><span>KUPPI / STUDENT RESOURCE</span><span>{resource.studyLevel}</span></div><div className="visual-content"><FileText size={22} /><strong>{resource.subject}</strong><span>{fileKind(resource.mimeType)} · COMMUNITY UPLOAD</span></div><div className="visual-footer"><span className="visual-line" /><span>{resource.originalFileName.slice(0, 25)}</span></div></div>;
}

function ResourceCard({ resource, index, onOpen, onLike, onSave }: { resource: Resource; index: number; onOpen: () => void; onLike: () => void; onSave: () => void }) {
  const tiltRef = useTilt<HTMLElement>(6);
  return <motion.div initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.3), ease: "easeOut" }}>
    <article className="resource-card real-resource-card tilt-card" ref={tiltRef}>
      <button onClick={onOpen} className="resource-card-open"><ResourceVisual resource={resource} /></button>
      <div className="resource-card-body">
        <div className="resource-meta"><span className="kuppi-badge kuppi-badge-violet">{resource.subject}</span><span>{resource.studyLevel}</span></div>
        <button className="resource-title" onClick={onOpen}>{resource.title}</button>
        <p>{resource.description}</p>
        <div className="resource-author"><span className="author-avatar author-avatar-violet">{initials(resource.author.fullName)}</span><span>{resource.author.fullName}</span><i /><span>@{resource.author.username}</span></div>
        <div className="resource-actions">
          <button onClick={onLike} className={resource.viewerHasLiked ? "action-active" : ""}><Heart size={16} fill={resource.viewerHasLiked ? "currentColor" : "none"} /> {resource.likeCount}</button>
          <button onClick={onSave} className={resource.viewerHasSaved ? "action-active" : ""}><Bookmark size={16} fill={resource.viewerHasSaved ? "currentColor" : "none"} /> {resource.saveCount}</button>
          <button onClick={onOpen}><MessageCircle size={16} /> {resource.commentCount}</button>
          <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${resource.storageUrl}`); toast.success("Resource link copied."); }}><Share2 size={16} /></button>
        </div>
      </div>
    </article>
  </motion.div>;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const heroTiltRef = useTilt<HTMLDivElement>(5);
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All");
  const [studyLevel, setStudyLevel] = useState("All");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [showAuth, setShowAuth] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [reportTarget, setReportTarget] = useState<{ targetType: "resource" | "comment"; targetId: number } | null>(null);
  const [reportReason, setReportReason] = useState("Inappropriate content");
  const [reportDetails, setReportDetails] = useState("");
  const [signIn, setSignIn] = useState({ username: "", password: "" });
  const [signUp, setSignUp] = useState({ fullName: "", contactNumber: "", username: "", password: "", confirmPassword: "" });
  const [upload, setUpload] = useState({ title: "", description: "", subject: "Combined Maths", studyLevel: "A/L", stream: "", examRelevance: "", file: null as File | null });
  const filters = useMemo(() => ({ query: query || undefined, subject, studyLevel }), [query, subject, studyLevel]);
  const accountQuery = trpc.account.me.useQuery();
  const resourceQuery = trpc.resource.list.useQuery(filters);
  const commentsQuery = trpc.resource.comments.useQuery({ id: selectedResource?.id ?? 0 }, { enabled: Boolean(selectedResource) });
  const usernameQuery = trpc.account.usernameAvailable.useQuery({ username: signUp.username }, { enabled: authMode === "signup" && signUp.username.trim().length >= 3 });
  const student = accountQuery.data;
  const resources = (resourceQuery.data ?? []) as Resource[];
  const registerMutation = trpc.account.register.useMutation({ onSuccess: () => completeAuth(), onError: (error) => toast.error(error.message) });
  const loginMutation = trpc.account.login.useMutation({ onSuccess: () => completeAuth(), onError: (error) => toast.error(error.message) });
  const createMutation = trpc.resource.create.useMutation({ onSuccess: () => { setShowUpload(false); setUpload({ title: "", description: "", subject: "Combined Maths", studyLevel: "A/L", stream: "", examRelevance: "", file: null }); void utils.resource.list.invalidate(); void utils.dashboard.mine.invalidate(); toast.success("Your resource is now live in Kuppi."); }, onError: (error) => toast.error(error.message) });
  const likeMutation = trpc.resource.toggleLike.useMutation({ onSuccess: () => void utils.resource.list.invalidate(), onError: (error) => requireAccount(error.message) });
  const saveMutation = trpc.resource.toggleSave.useMutation({ onSuccess: () => { void utils.resource.list.invalidate(); void utils.dashboard.mine.invalidate(); }, onError: (error) => requireAccount(error.message) });
  const commentMutation = trpc.resource.addComment.useMutation({ onSuccess: () => { void commentsQuery.refetch(); void utils.resource.list.invalidate(); }, onError: (error) => requireAccount(error.message) });
  const reportMutation = trpc.moderation.report.useMutation({ onSuccess: () => { setReportTarget(null); setReportDetails(""); toast.success("Your report has been sent to Kuppi moderation."); }, onError: (error) => toast.error(error.message) });

  function completeAuth() {
    setShowAuth(false);
    setSignIn({ username: "", password: "" });
    setSignUp({ fullName: "", contactNumber: "", username: "", password: "", confirmPassword: "" });
    void utils.account.me.invalidate();
    toast.success("You’re signed in to Kuppi.");
  }
  function openAuth(mode: "signin" | "signup") { setAuthMode(mode); setShowAuth(true); }
  function requireAccount(message = "Sign in to continue.") { toast(message); openAuth("signin"); }
  function requireStudent(action: () => void) { if (student) action(); else requireAccount(); }
  const reportReasons = ["Inappropriate content", "Not study material", "Spam or advertising", "Copyright concern", "Something else"];
  function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!reportTarget) return;
    reportMutation.mutate({ targetType: reportTarget.targetType, targetId: reportTarget.targetId, reason: reportReason, details: reportDetails.trim() || undefined });
  }

  function submitSignIn(event: FormEvent) { event.preventDefault(); loginMutation.mutate(signIn); }
  function submitSignUp(event: FormEvent) { event.preventDefault(); if (usernameQuery.data && !usernameQuery.data.available) return toast.error("Choose an available username."); registerMutation.mutate(signUp); }
  function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!upload.file) return toast.error("Attach the resource you want to share.");
    if (upload.file.size > 25 * 1024 * 1024) return toast.error("Files must be 25 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = typeof reader.result === "string" ? reader.result.split(",")[1] : "";
      if (!dataBase64) return toast.error("Kuppi could not read that file.");
      createMutation.mutate({ title: upload.title, description: upload.description, subject: upload.subject, studyLevel: upload.studyLevel, stream: upload.stream || undefined, examRelevance: upload.examRelevance || undefined, originalFileName: upload.file!.name, mimeType: upload.file!.type || "application/octet-stream", dataBase64 });
    };
    reader.onerror = () => toast.error("Kuppi could not read that file.");
    reader.readAsDataURL(upload.file);
  }

  const closeModal = () => { setShowAuth(false); setShowRecovery(false); setShowUpload(false); setSelectedResource(null); setReportTarget(null); };
  return <div className="grain-overlay min-h-screen overflow-x-hidden bg-[#f8f5ef] text-[#1c1a2c]">
    <div className="announcement-bar"><div className="container flex items-center justify-center gap-2 text-center text-[11px] font-bold tracking-[0.12em] text-white uppercase"><Sparkles size={14} /> A real library built by students, one useful upload at a time</div></div>
    <header className="sticky top-0 z-40 border-b border-[#e9e4dc]/90 bg-[#f8f5ef]/90 backdrop-blur-xl"><div className="container flex h-[74px] items-center justify-between gap-4"><a href="#top" className="brand-mark"><span className="brand-orb"><span /></span><span>Kuppi</span></a><nav className="hidden items-center gap-6 text-sm font-semibold text-[#625d6d] lg:flex"><a className="nav-link nav-link-active" href="#feed">Discover</a><a className="nav-link" href="#how-it-works">How it works</a><button className="nav-link" onClick={() => student ? setLocation("/dashboard") : openAuth("signin")}>My dashboard</button></nav><label className="search-shell hidden min-w-0 flex-1 md:flex lg:max-w-[385px]"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared resources" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}</label><div className="flex items-center gap-2"><Button onClick={() => requireStudent(() => setShowUpload(true))} className="hidden h-10 rounded-full bg-[#5b35e8] px-4 text-sm font-bold text-white hover:bg-[#4827cf] sm:flex"><Plus size={17} /> Share a resource</Button>{student ? <button className="avatar-button" onClick={() => setLocation("/dashboard")}>{initials(student.fullName)}</button> : <Button onClick={() => openAuth("signin")} variant="outline" className="hidden h-10 rounded-full border-[#ddd5fb] bg-white px-4 text-sm font-bold text-[#5b35e8] sm:flex">Sign in</Button>}</div></div></header>
    <main id="top"><section className="hero-section hero-section-real"><div className="hero-grid container"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> Sri Lanka’s student-powered library</div><h1>Share the note.<br /><em>Change the next study session.</em></h1><p className="hero-description">Kuppi is a real, growing space for students to exchange useful files, find better explanations, and make studying less lonely.</p><div className="flex flex-wrap gap-3"><Button onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} className="h-12 rounded-full bg-[#5b35e8] px-6 font-bold text-white hover:bg-[#4827cf]">Browse resources <ArrowRight size={17} /></Button><Button onClick={() => requireStudent(() => setShowUpload(true))} variant="outline" className="h-12 rounded-full border-[#d8d0c7] bg-transparent px-6 font-bold text-[#292639] hover:bg-white"><Upload size={17} /> Share a resource</Button></div><p className="real-library-note"><Check size={15} /> No placeholders. Every listed resource comes from a Kuppi student.</p></div><div className="real-hero-art"><div className="real-hero-orb real-hero-orb-one" /><div className="real-hero-orb real-hero-orb-two" /><div className="real-file-stack hero-tilt" ref={heroTiltRef}><div className="hero-file hero-file-back"><File size={30} /><span>YOUR USEFUL FILE</span></div><div className="hero-file hero-file-mid"><FileText size={32} /><strong>Notes that<br />move forward.</strong></div><div className="hero-file hero-file-front"><div><span className="brand-orb"><span /></span><b>Kuppi</b></div><p>Share what helped you understand.</p><div className="hero-file-lines"><i /><i /><i /></div><small><Upload size={13} /> Real student uploads</small></div></div></div></div></section>
      <section id="feed" className="content-section container"><motion.div className="section-heading-row" {...riseInViewport}><div><div className="section-kicker">THE KUPPI LIBRARY</div><h2>What students are sharing now.</h2><p>Search actual contributions by keyword, study level, and subject. The library begins empty and grows only when students contribute.</p></div>{student && <Button onClick={() => setLocation("/dashboard")} variant="outline" className="rounded-full border-[#d8d0c7] bg-white font-bold"><LayoutDashboard size={16} /> My dashboard</Button>}</motion.div><div className="real-filter-panel"><label className="search-shell real-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, topics, subjects, or streams" /></label><select value={studyLevel} onChange={(event) => setStudyLevel(event.target.value)}>{levels.map((item) => <option key={item}>{item}</option>)}</select><select value={subject} onChange={(event) => setSubject(event.target.value)}>{subjects.map((item) => <option key={item}>{item}</option>)}</select></div>{resourceQuery.isLoading ? <div className="empty-resource"><Loader2 className="animate-spin text-[#5b35e8]" /><strong>Loading the real library…</strong></div> : <div className="real-resource-grid">{resources.length ? resources.map((resource, index) => <ResourceCard key={resource.id} resource={resource} index={index} onOpen={() => setSelectedResource(resource)} onLike={() => requireStudent(() => likeMutation.mutate({ id: resource.id }))} onSave={() => requireStudent(() => saveMutation.mutate({ id: resource.id }))} />) : <div className="empty-resource real-empty"><div className="empty-orb"><FileText size={26} /></div><strong>The library is ready for its first resource.</strong><p>Kuppi only shows material students have actually shared. Add a useful note, worksheet, revision guide, or other study file to get started.</p><Button onClick={() => requireStudent(() => setShowUpload(true))} className="mt-3 rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]"><Upload size={16} /> Share the first resource</Button></div>}</div>}</section>
      <section id="how-it-works" className="how-section"><div className="container"><div className="section-kicker">HOW KUPPI WORKS</div><h2>Useful files. Real people.<br />A better way to <em>pass it on.</em></h2><div className="how-grid"><motion.article {...riseInViewport}><span>01</span><div className="how-icon"><LogIn size={25} /></div><h3>Make your student account</h3><p>Use your preferred username and password to keep your personal library and contribution record.</p></motion.article><motion.article {...riseInViewport} transition={{ duration: 0.55, delay: 0.12, ease: "easeOut" }}><span>02</span><div className="how-icon"><Upload size={25} /></div><h3>Upload something useful</h3><p>Share a real study file with clear details so another student can find it when they need it.</p></motion.article><motion.article {...riseInViewport} transition={{ duration: 0.55, delay: 0.24, ease: "easeOut" }}><span>03</span><div className="how-icon"><Users size={25} /></div><h3>Learn together</h3><p>Save resources, leave thoughtful comments, and help protect the community by reporting concerns.</p></motion.article></div></div></section>
      <section className="cta-section container"><div className="cta-orb cta-orb-one" /><div className="cta-orb cta-orb-two" /><motion.div className="cta-content" {...riseInViewport}><div><span className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> A library starts with one generous student</span><h2>Have a note that helped?<br /><em>Let it help again.</em></h2></div><div><p>Join Kuppi with a username and password, then share the resource someone else is looking for.</p><Button onClick={() => student ? setShowUpload(true) : openAuth("signup")} className="mt-4 h-12 rounded-full bg-white px-6 font-bold text-[#4c2ed1] hover:bg-[#f2efff]">Create an account <ArrowRight size={17} /></Button></div></motion.div></section></main>
    <footer className="footer"><div className="container"><div className="footer-top"><a href="#top" className="brand-mark"><span className="brand-orb"><span /></span><span>Kuppi</span></a><p>Made with care for curious minds across Sri Lanka.</p><div className="footer-links"><a href="#feed">Discover</a><a href="#how-it-works">How it works</a><button onClick={() => student ? setLocation("/dashboard") : openAuth("signin")}>My dashboard</button></div></div><div className="footer-bottom"><span>© 2026 Kuppi. Learn. Share. Grow together.</span><span>Built around real student contributions.</span></div><p className="developer-credit">Proudly presented by <strong>Januth Nimnal</strong>.</p></div></footer>
    {(showAuth || showUpload || selectedResource || showRecovery || reportTarget) && <div className="modal-layer" onMouseDown={closeModal}><div className={`modal-card ${showUpload ? "modal-card-publish" : ""}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={closeModal}><X size={18} /></button>{showRecovery && <AccountRecovery onClose={() => setShowRecovery(false)} />}{showAuth && <div className="account-modal"><span className="modal-mark"><span className="brand-orb"><span /></span></span><div className="account-tabs"><button className={authMode === "signin" ? "account-tab-active" : ""} onClick={() => setAuthMode("signin")}>Sign in</button><button className={authMode === "signup" ? "account-tab-active" : ""} onClick={() => setAuthMode("signup")}>Create account</button></div>{authMode === "signin" ? <form className="account-form" onSubmit={submitSignIn}><h2>Welcome back.</h2><p>Sign in with the Kuppi username and password you chose.</p><label><span>Username</span><input value={signIn.username} autoComplete="username" onChange={(event) => setSignIn({ ...signIn, username: event.target.value })} required /></label><label><span>Password</span><input type="password" value={signIn.password} autoComplete="current-password" onChange={(event) => setSignIn({ ...signIn, password: event.target.value })} required /></label><button type="button" className="forgot-password" onClick={() => { setShowAuth(false); setShowRecovery(true); }}>Forgot password?</button><Button type="submit" disabled={loginMutation.isPending} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{loginMutation.isPending ? <Loader2 className="animate-spin" /> : <LogIn size={16} />} Sign in to Kuppi</Button></form> : <form className="account-form" onSubmit={submitSignUp}><h2>Start your Kuppi account.</h2><p>Your public profile uses your name and username. Your private contact number is used only for account recovery.</p><label><span>Full name</span><input value={signUp.fullName} autoComplete="name" onChange={(event) => setSignUp({ ...signUp, fullName: event.target.value })} required /></label><label><span>Contact number</span><input type="tel" value={signUp.contactNumber} autoComplete="tel" onChange={(event) => setSignUp({ ...signUp, contactNumber: event.target.value })} required /></label><label><span>Preferred username</span><input value={signUp.username} autoComplete="username" onChange={(event) => setSignUp({ ...signUp, username: event.target.value.toLowerCase() })} required /><small className={usernameQuery.data?.available ? "availability-good" : ""}>{signUp.username.length >= 3 ? (usernameQuery.isFetching ? "Checking username…" : usernameQuery.data?.message) : "Use 3–32 lowercase letters, numbers, or underscores."}</small></label><label><span>Password</span><input type="password" value={signUp.password} autoComplete="new-password" onChange={(event) => setSignUp({ ...signUp, password: event.target.value })} minLength={8} required /></label><label><span>Re-enter password</span><input type="password" value={signUp.confirmPassword} autoComplete="new-password" onChange={(event) => setSignUp({ ...signUp, confirmPassword: event.target.value })} minLength={8} required /></label><Button type="submit" disabled={registerMutation.isPending || Boolean(usernameQuery.data && !usernameQuery.data.available)} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{registerMutation.isPending ? <Loader2 className="animate-spin" /> : <UserPlus size={16} />} Create my Kuppi account</Button></form>}</div>}{showUpload && <form className="publish-modal" onSubmit={submitUpload}><div className="modal-heading"><div className="modal-mark-small"><Upload size={18} /></div><div><span>REAL STUDENT RESOURCE</span><h2>Share a file with Kuppi</h2></div></div><p className="modal-intro">Give other students enough context to understand why your file is useful. Kuppi keeps the original file and supports browser preview or download where the device allows it.</p><div className="publish-form"><label><span>Resource title</span><input value={upload.title} onChange={(event) => setUpload({ ...upload, title: event.target.value })} required /></label><label><span>Helpful description</span><textarea value={upload.description} onChange={(event) => setUpload({ ...upload, description: event.target.value })} rows={3} required /></label><div className="form-row"><label><span>Subject</span><select value={upload.subject} onChange={(event) => setUpload({ ...upload, subject: event.target.value })}>{subjects.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Study level</span><select value={upload.studyLevel} onChange={(event) => setUpload({ ...upload, studyLevel: event.target.value })}>{levels.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="form-row"><label><span>Stream (optional)</span><input value={upload.stream} onChange={(event) => setUpload({ ...upload, stream: event.target.value })} /></label><label><span>Exam relevance (optional)</span><input value={upload.examRelevance} onChange={(event) => setUpload({ ...upload, examRelevance: event.target.value })} /></label></div><label><span>Attach your study file</span><input className="file-input" type="file" onChange={(event) => setUpload({ ...upload, file: event.target.files?.[0] || null })} required /></label>{upload.file && <div className="attached-file"><FileText size={15} /> {upload.file.name} · {formatSize(upload.file.size)} <Check size={15} /></div>}<Button type="submit" disabled={createMutation.isPending} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{createMutation.isPending ? <Loader2 className="animate-spin" /> : <Send size={16} />} Publish to Kuppi</Button></div></form>}{selectedResource && <div className="resource-modal"><ResourceVisual resource={selectedResource} /><div className="resource-modal-content"><div className="resource-meta"><span className="kuppi-badge kuppi-badge-violet">{selectedResource.subject}</span><span>{selectedResource.studyLevel}{selectedResource.examRelevance ? ` · ${selectedResource.examRelevance}` : ""}</span></div><h2>{selectedResource.title}</h2><p>{selectedResource.description}</p><div className="modal-author"><span className="author-avatar author-avatar-violet">{initials(selectedResource.author.fullName)}</span><div><strong>{selectedResource.author.fullName}</strong><span>@{selectedResource.author.username}</span></div></div><div className="file-access-note"><File size={16} /><span><strong>{selectedResource.originalFileName}</strong><br />{fileKind(selectedResource.mimeType)} · {formatSize(selectedResource.fileSize)}. Preview it here when Kuppi can render the format, or open the original file in a compatible app.</span></div><DocumentPreview url={selectedResource.storageUrl} mimeType={selectedResource.mimeType} fileName={selectedResource.originalFileName} /><div className="modal-action-row"><a href={selectedResource.storageUrl} target="_blank" rel="noreferrer" className="open-resource-button"><FileText size={16} /> Open file</a><Button onClick={() => requireStudent(() => saveMutation.mutate({ id: selectedResource.id }))} variant="outline" className="rounded-full border-[#dad3cb] bg-white font-bold"><Bookmark size={16} fill={selectedResource.viewerHasSaved ? "currentColor" : "none"} /> {selectedResource.viewerHasSaved ? "Saved" : "Save"}</Button><Button onClick={() => requireStudent(() => setReportTarget({ targetType: "resource", targetId: selectedResource.id }))} variant="outline" className="rounded-full border-[#f0d8d1] bg-white font-bold text-[#b45549]"><Flag size={16} /> Report</Button></div><div className="comment-section"><div className="comment-heading"><h3>Comments</h3><span>{selectedResource.commentCount}</span></div>{commentsQuery.data?.length ? <div className="comment-list">{commentsQuery.data.map((comment) => <div className="comment-item" key={comment.id}><span>{initials(comment.author.fullName)}</span><div><strong>{comment.author.fullName} <small>@{comment.author.username}</small></strong><p>{comment.body}</p><button className="comment-report" onClick={() => requireStudent(() => setReportTarget({ targetType: "comment", targetId: comment.id }))}><Flag size={12} /> Report</button></div></div>)}</div> : <p className="no-comments">No comments yet. Be the first to add a helpful thought.</p>}{student ? <form className="comment-form" onSubmit={(event) => { event.preventDefault(); const body = new FormData(event.currentTarget).get("body")?.toString().trim(); if (body) { commentMutation.mutate({ resourceId: selectedResource.id, body }); event.currentTarget.reset(); } }}><input name="body" maxLength={1000} placeholder="Add a thoughtful comment…" /><button type="submit" disabled={commentMutation.isPending}><Send size={15} /></button></form> : <button className="comment-signin" onClick={() => openAuth("signin")}>Sign in to join the conversation</button>}</div></div></div>}{reportTarget && <form className="report-modal account-form" onSubmit={submitReport}><div className="modal-heading"><div className="modal-mark-small" style={{ background: "#fdeae5", color: "#b45549" }}><Flag size={18} /></div><div><span>KUPPI MODERATION</span><h2>Report this {reportTarget.targetType}</h2></div></div><p className="modal-intro">Your report goes privately to the Kuppi moderation team. Honest reports keep the library genuinely useful.</p><label><span>Reason</span><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{reportReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label><span>Extra details (optional)</span><textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} rows={3} maxLength={2000} placeholder="Add context that helps reviewers act quickly." /></label><div className="report-actions-row"><Button type="button" variant="outline" onClick={() => setReportTarget(null)} className="rounded-full border-[#ded6cd] bg-white font-bold">Cancel</Button><Button type="submit" disabled={reportMutation.isPending} className="rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{reportMutation.isPending ? <Loader2 className="animate-spin" /> : <Send size={16} />} Send report</Button></div></form>}</div></div>}
  </div>;
}
