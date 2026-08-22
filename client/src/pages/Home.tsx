import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  File,
  FileText,
  Heart,
  LayoutDashboard,
  Loader2,
  LogIn,
  MessageCircle,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type FeedResource = {
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
  createdAt: Date;
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
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ResourceVisual({ resource }: { resource: FeedResource }) {
  const tone = ["violet", "coral", "mint", "sky"][resource.subject.length % 4];
  return <div className={`resource-visual resource-visual-${tone}`}><div className="visual-pattern visual-pattern-one" /><div className="visual-pattern visual-pattern-two" /><div className="visual-topline"><span>KU PPI / COMMUNITY RESOURCE</span><span>{resource.studyLevel}</span></div><div className="visual-content"><FileText size={23} /><strong>{resource.subject}</strong><span>{fileKind(resource.mimeType)} · SHARED BY A STUDENT</span></div><div className="visual-footer"><span className="visual-line" /><span>{resource.originalFileName.slice(0, 24)}</span></div></div>;
}

function EmptyFeed({ onShare }: { onShare: () => void }) {
  return <div className="empty-resource real-empty"><div className="empty-orb"><FileText size={26} /></div><strong>The library is ready for its first resource.</strong><p>Kuppi only shows material students have actually shared. Add a useful note, worksheet, revision guide, or other study file to get started.</p><Button onClick={onShare} className="mt-3 rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]"><Upload size={16} /> Share the first resource</Button></div>;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All");
  const [studyLevel, setStudyLevel] = useState("All");
  const [showMenu, setShowMenu] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [accountMode, setAccountMode] = useState<"signin" | "signup">("signin");
  const [showPublish, setShowPublish] = useState(false);
  const [selectedResource, setSelectedResource] = useState<FeedResource | null>(null);
  const [signIn, setSignIn] = useState({ username: "", password: "" });
  const [signUp, setSignUp] = useState({ fullName: "", contactNumber: "", username: "", password: "", confirmPassword: "" });
  const [upload, setUpload] = useState({ title: "", description: "", subject: "Combined Maths", studyLevel: "A/L", stream: "", examRelevance: "", file: null as File | null });
  const filters = useMemo(() => ({ query: query || undefined, subject, studyLevel }), [query, subject, studyLevel]);
  const accountQuery = trpc.account.me.useQuery();
  const resourceQuery = trpc.resource.list.useQuery(filters);
  const resources = (resourceQuery.data ?? []) as FeedResource[];
  const usernameQuery = trpc.account.usernameAvailable.useQuery({ username: signUp.username }, { enabled: accountMode === "signup" && signUp.username.trim().length >= 3 });
  const commentsQuery = trpc.resource.comments.useQuery({ id: selectedResource?.id ?? 0 }, { enabled: Boolean(selectedResource) });

  const completeAccount = () => {
    setShowAccount(false);
    setSignIn({ username: "", password: "" });
    setSignUp({ fullName: "", contactNumber: "", username: "", password: "", confirmPassword: "" });
    void utils.account.me.invalidate();
    toast.success("You’re signed in to Kuppi.");
  };
  const registerMutation = trpc.account.register.useMutation({ onSuccess: completeAccount, onError: (error) => toast.error(error.message) });
  const loginMutation = trpc.account.login.useMutation({ onSuccess: completeAccount, onError: (error) => toast.error(error.message) });
  const likeMutation = trpc.resource.toggleLike.useMutation({ onSuccess: () => void utils.resource.list.invalidate(), onError: (error) => promptForAccount(error.message) });
  const saveMutation = trpc.resource.toggleSave.useMutation({ onSuccess: () => { void utils.resource.list.invalidate(); void utils.dashboard.mine.invalidate(); }, onError: (error) => promptForAccount(error.message) });
  const publishMutation = trpc.resource.create.useMutation({ onSuccess: () => { setShowPublish(false); setUpload({ title: "", description: "", subject: "Combined Maths", studyLevel: "A/L", stream: "", examRelevance: "", file: null }); void utils.resource.list.invalidate(); void utils.dashboard.mine.invalidate(); toast.success("Your resource is now live in Kuppi."); }, onError: (error) => toast.error(error.message) });
  const commentMutation = trpc.resource.addComment.useMutation({ onSuccess: () => { void commentsQuery.refetch(); void utils.resource.list.invalidate(); }, onError: (error) => promptForAccount(error.message) });
  const student = accountQuery.data;

  function openAccount(mode: "signin" | "signup") { setAccountMode(mode); setShowAccount(true); }
  function promptForAccount(message = "Sign in to continue.") { toast(message); openAccount("signin"); }
  function requireStudent(action: () => void) { if (student) action(); else promptForAccount(); }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate(signIn);
  }

  async function handleSignUp(event: FormEvent) {
    event.preventDefault();
    if (usernameQuery.data && !usernameQuery.data.available) { toast.error("Choose an available username."); return; }
    registerMutation.mutate(signUp);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!upload.file) { toast.error("Attach the study file you want to share."); return; }
    if (upload.file.size > 25 * 1024 * 1024) { toast.error("Files must be 25 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result.split(",")[1] : "";
      if (!result) { toast.error("Kuppi could not read that file."); return; }
      publishMutation.mutate({ title: upload.title, description: upload.description, subject: upload.subject, studyLevel: upload.studyLevel, stream: upload.stream || undefined, examRelevance: upload.examRelevance || undefined, originalFileName: upload.file!.name, mimeType: upload.file!.type || "application/octet-stream", dataBase64: result });
    };
    reader.onerror = () => toast.error("Kuppi could not read that file.");
    reader.readAsDataURL(upload.file);
  }

  return <div className="min-h-screen overflow-x-hidden bg-[#f8f5ef] text-[#1c1a2c]">
    <div className="announcement-bar"><div className="container flex items-center justify-center gap-2 text-center text-[11px] font-bold tracking-[0.12em] text-white uppercase sm:text-xs"><Sparkles size={14} /> A real library built by students, one useful upload at a time</div></div>
    <header className="sticky top-0 z-40 border-b border-[#e9e4dc]/90 bg-[#f8f5ef]/90 backdrop-blur-xl"><div className="container flex h-[74px] items-center justify-between gap-4"><a href="#top" className="brand-mark"><span className="brand-orb"><span /></span><span>Kuppi</span></a><nav className="hidden items-center gap-6 text-sm font-semibold text-[#625d6d] lg:flex"><a className="nav-link nav-link-active" href="#feed">Discover</a><a className="nav-link" href="#how-it-works">How it works</a><button className="nav-link" onClick={() => student ? setLocation("/dashboard") : openAccount("signin")}>My dashboard</button></nav><label className="search-shell hidden min-w-0 flex-1 md:flex lg:max-w-[390px]"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared resources" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}</label><div className="flex items-center gap-2"><Button onClick={() => requireStudent(() => setShowPublish(true))} className="hidden h-10 rounded-full bg-[#5b35e8] px-4 text-sm font-bold text-white shadow-[0_7px_18px_rgba(91,53,232,0.22)] hover:bg-[#4827cf] sm:flex"><Plus size={17} /> Share a resource</Button>{student ? <button onClick={() => setLocation("/dashboard")} className="avatar-button" aria-label="Open your dashboard">{initials(student.fullName)}</button> : <Button onClick={() => openAccount("signin")} variant="outline" className="hidden h-10 rounded-full border-[#ddd5fb] bg-white px-4 text-sm font-bold text-[#5b35e8] hover:bg-[#f2efff] sm:flex">Sign in</Button>}<button onClick={() => setShowMenu(!showMenu)} className="icon-button grid lg:hidden" aria-label="Open menu"><Users size={18} /></button></div></div>{showMenu && <div className="container border-t border-[#e9e4dc] py-4 lg:hidden"><div className="flex flex-col gap-3 text-sm font-bold"><a href="#feed" onClick={() => setShowMenu(false)}>Discover resources</a><a href="#how-it-works" onClick={() => setShowMenu(false)}>How it works</a><button className="text-left text-[#5b35e8]" onClick={() => student ? setLocation("/dashboard") : openAccount("signin")}>My dashboard</button></div></div>}</header>
    <main id="top"><section className="hero-section hero-section-real"><div className="hero-grid container"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" /> Sri Lanka’s student-powered library</div><h1>Share the note.<br /><em>Change the next study session.</em></h1><p className="hero-description">Kuppi is a real, growing space for students to exchange useful files, find better explanations, and make studying less lonely.</p><div className="flex flex-wrap gap-3"><Button onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} className="h-12 rounded-full bg-[#5b35e8] px-6 font-bold text-white shadow-[0_12px_28px_rgba(91,53,232,0.26)] hover:bg-[#4827cf]">Browse resources <ArrowRight size={17} /></Button><Button onClick={() => requireStudent(() => setShowPublish(true))} variant="outline" className="h-12 rounded-full border-[#d8d0c7] bg-transparent px-6 font-bold text-[#292639] hover:bg-white"><Upload size={17} /> Share a resource</Button></div><p className="real-library-note"><Check size={15} /> No placeholders. Every listed resource comes from a Kuppi student.</p></div><div className="real-hero-art"><div className="real-hero-orb real-hero-orb-one" /><div className="real-hero-orb real-hero-orb-two" /><div className="real-file-stack"><div className="hero-file hero-file-back"><File size={30} /><span>YOUR USEFUL FILE</span></div><div className="hero-file hero-file-mid"><FileText size={32} /><strong>Notes that<br />move forward.</strong></div><div className="hero-file hero-file-front"><div><span className="brand-orb"><span /></span><b>Kuppi</b></div><p>Share what helped you understand.</p><div className="hero-file-lines"><i /><i /><i /></div><small><Upload size={13} /> Real student uploads</small></div></div></div></div></section>
      <section id="feed" className="content-section container"><div className="section-heading-row"><div><div className="section-kicker">THE KUPPI LIBRARY</div><h2>What students are sharing now.</h2><p>Search actual contributions by keyword, study level and subject. The library begins empty and grows only when students contribute.</p></div>{student && <Button onClick={() => setLocation("/dashboard")} variant="outline" className="rounded-full border-[#d8d0c7] bg-white font-bold"><LayoutDashboard size={16} /> My dashboard</Button>}</div><div className="real-filter-panel"><label className="search-shell real-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, topics, subjects, or streams" /></label><select value={studyLevel} onChange={(event) => setStudyLevel(event.target.value)} aria-label="Filter by study level">{levels.map((item) => <option key={item}>{item}</option>)}</select><select value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Filter by subject">{subjects.map((item) => <option key={item}>{item}</option>)}</select></div>{resourceQuery.isLoading ? <div className="empty-resource"><Loader2 className="animate-spin text-[#5b35e8]" /><strong>Loading the real library…</strong></div> : <div className="real-resource-grid">{resources.length ? resources.map((resource) => <article className="resource-card real-resource-card" key={resource.id}><button onClick={() => setSelectedResource(resource)} className="resource-card-open"><ResourceVisual resource={resource} /></button><div className="resource-card-body"><div className="resource-meta"><span className="kuppi-badge kuppi-badge-violet">{resource.subject}</span><span>{resource.studyLevel}</span></div><button className="resource-title" onClick={() => setSelectedResource(resource)}>{resource.title}</button><p>{resource.description}</p><div className="resource-author"><span className="author-avatar author-avatar-violet">{initials(resource.author.fullName)}</span><span>{resource.author.fullName}</span><i /><span>@{resource.author.username}</span></div><div className="resource-actions"><button onClick={() => requireStudent(() => likeMutation.mutate({ id: resource.id }))} className={resource.viewerHasLiked ? "action-active" : ""}><Heart size={16} fill={resource.viewerHasLiked ? "currentColor" : "none"} /> {resource.likeCount}</button><button onClick={() => requireStudent(() => saveMutation.mutate({ id: resource.id }))} className={resource.viewerHasSaved ? "action-active" : ""}><Bookmark size={16} fill={resource.viewerHasSaved ? "currentColor" : "none"} /> {resource.saveCount}</button><button onClick={() => setSelectedResource(resource)}><MessageCircle size={16} /> {resource.commentCount}</button><button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${resource.storageUrl}`); toast.success("Resource link copied."); }} aria-label="Share resource"><Share2 size={16} /></button></div></div></article>) : <EmptyFeed onShare={() => requireStudent(() => setShowPublish(true))} />}</div>}</section>
      <section id="how-it-works" className="how-section"><div className="container"><div className="section-kicker">HOW KUPPI WORKS</div><h2>Useful files. Real people.<br />A better way to <em>pass it on.</em></h2><div className="how-grid"><article><span>01</span><div className="how-icon"><LogIn size={25} /></div><h3>Make your student account</h3><p>Use your preferred username and password to join Kuppi, keep your library, and build your contribution record.</p></article><article><span>02</span><div className="how-icon"><Upload size={25} /></div><h3>Upload something useful</h3><p>Share a real study file with clear details so another student can find it when they need it.</p></article><article><span>03</span><div className="how-icon"><Users size={25} /></div><h3>Learn together</h3><p>Save resources, leave thoughtful comments, and see your own contribution rank grow with every helpful upload.</p></article></div></div></section>
      <section className="cta-section container"><div className="cta-orb cta-orb-one" /><div className="cta-orb cta-orb-two" /><div className="cta-content"><div><span className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> A library starts with one generous student</span><h2>Have a note that helped?<br /><em>Let it help again.</em></h2></div><div><p>Join Kuppi with a username and password, then share the resource someone else is looking for.</p><Button onClick={() => student ? setShowPublish(true) : openAccount("signup")} className="mt-4 h-12 rounded-full bg-white px-6 font-bold text-[#4c2ed1] hover:bg-[#f2efff]">Create an account <ArrowRight size={17} /></Button></div></div></section></main>
    <footer className="footer"><div className="container"><div className="footer-top"><a href="#top" className="brand-mark"><span className="brand-orb"><span /></span><span>Kuppi</span></a><p>Made with care for curious minds across Sri Lanka.</p><div className="footer-links"><a href="#feed">Discover</a><a href="#how-it-works">How it works</a><button onClick={() => student ? setLocation("/dashboard") : openAccount("signin")}>My dashboard</button></div></div><div className="footer-bottom"><span>© 2026 Kuppi. Learn. Share. Grow together.</span><span>Built around real student contributions.</span></div></div></footer>
    {(showAccount || showPublish || selectedResource) && <div className="modal-layer" onMouseDown={() => { setShowAccount(false); setShowPublish(false); setSelectedResource(null); }}><div className={`modal-card ${showPublish ? "modal-card-publish" : ""}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => { setShowAccount(false); setShowPublish(false); setSelectedResource(null); }}><X size={18} /></button>{showAccount && <div className="account-modal"><span className="modal-mark"><span className="brand-orb"><span /></span></span><div className="account-tabs"><button className={accountMode === "signin" ? "account-tab-active" : ""} onClick={() => setAccountMode("signin")}>Sign in</button><button className={accountMode === "signup" ? "account-tab-active" : ""} onClick={() => setAccountMode("signup")}>Create account</button></div>{accountMode === "signin" ? <form className="account-form" onSubmit={handleSignIn}><h2>Welcome back.</h2><p>Sign in with the Kuppi username and password you chose.</p><label><span>Username</span><input value={signIn.username} autoComplete="username" onChange={(event) => setSignIn({ ...signIn, username: event.target.value })} required /></label><label><span>Password</span><input type="password" value={signIn.password} autoComplete="current-password" onChange={(event) => setSignIn({ ...signIn, password: event.target.value })} required /></label><Button type="submit" disabled={loginMutation.isPending} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{loginMutation.isPending ? <Loader2 className="animate-spin" /> : <LogIn size={16} />} Sign in to Kuppi</Button></form> : <form className="account-form" onSubmit={handleSignUp}><h2>Start your Kuppi account.</h2><p>Your public profile uses your name and username. Your contact number is kept private.</p><label><span>Full name</span><input value={signUp.fullName} autoComplete="name" onChange={(event) => setSignUp({ ...signUp, fullName: event.target.value })} required /></label><label><span>Contact number</span><input type="tel" value={signUp.contactNumber} autoComplete="tel" onChange={(event) => setSignUp({ ...signUp, contactNumber: event.target.value })} required /></label><label><span>Preferred username</span><input value={signUp.username} autoComplete="username" onChange={(event) => setSignUp({ ...signUp, username: event.target.value.toLowerCase() })} required /><small className={usernameQuery.data?.available ? "availability-good" : ""}>{signUp.username.length >= 3 ? (usernameQuery.isFetching ? "Checking username…" : usernameQuery.data?.message) : "Use 3–32 lowercase letters, numbers, or underscores."}</small></label><label><span>Password</span><input type="password" value={signUp.password} autoComplete="new-password" onChange={(event) => setSignUp({ ...signUp, password: event.target.value })} minLength={8} required /></label><label><span>Re-enter password</span><input type="password" value={signUp.confirmPassword} autoComplete="new-password" onChange={(event) => setSignUp({ ...signUp, confirmPassword: event.target.value })} minLength={8} required /></label><Button type="submit" disabled={registerMutation.isPending || Boolean(usernameQuery.data && !usernameQuery.data.available)} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{registerMutation.isPending ? <Loader2 className="animate-spin" /> : <UserPlus size={16} />} Create my Kuppi account</Button></form>}</div>}{showPublish && <form className="publish-modal" onSubmit={handleUpload}><div className="modal-heading"><div className="modal-mark-small"><Upload size={18} /></div><div><span>REAL STUDENT RESOURCE</span><h2>Share a file with Kuppi</h2></div></div><p className="modal-intro">Give other students enough context to understand why your file is useful. Kuppi keeps the original file and supports browser preview or download where the device allows it.</p><div className="publish-form"><label><span>Resource title</span><input value={upload.title} onChange={(event) => setUpload({ ...upload, title: event.target.value })} placeholder="e.g. A/L electrochemistry summary" required /></label><label><span>Helpful description</span><textarea value={upload.description} onChange={(event) => setUpload({ ...upload, description: event.target.value })} placeholder="What does this resource cover, and who will it help?" rows={3} required /></label><div className="form-row"><label><span>Subject</span><select value={upload.subject} onChange={(event) => setUpload({ ...upload, subject: event.target.value })}>{subjects.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Study level</span><select value={upload.studyLevel} onChange={(event) => setUpload({ ...upload, studyLevel: event.target.value })}>{levels.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="form-row"><label><span>Stream (optional)</span><input value={upload.stream} onChange={(event) => setUpload({ ...upload, stream: event.target.value })} placeholder="e.g. Physical Science" /></label><label><span>Exam relevance (optional)</span><input value={upload.examRelevance} onChange={(event) => setUpload({ ...upload, examRelevance: event.target.value })} placeholder="e.g. 2026 A/L" /></label></div><label><span>Attach your study file</span><input className="file-input" type="file" onChange={(event) => setUpload({ ...upload, file: event.target.files?.[0] || null })} required /></label>{upload.file && <div className="attached-file"><FileText size={15} /> {upload.file.name} · {formatSize(upload.file.size)} <Check size={15} /></div>}<Button type="submit" disabled={publishMutation.isPending} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">{publishMutation.isPending ? <Loader2 className="animate-spin" /> : <Send size={16} />} Publish to Kuppi</Button></div></form>}{selectedResource && <div className="resource-modal"><ResourceVisual resource={selectedResource} /><div className="resource-modal-content"><div className="resource-meta"><span className="kuppi-badge kuppi-badge-violet">{selectedResource.subject}</span><span>{selectedResource.studyLevel}{selectedResource.examRelevance ? ` · ${selectedResource.examRelevance}` : ""}</span></div><h2>{selectedResource.title}</h2><p>{selectedResource.description}</p><div className="modal-author"><span className="author-avatar author-avatar-violet">{initials(selectedResource.author.fullName)}</span><div><strong>{selectedResource.author.fullName}</strong><span>@{selectedResource.author.username}</span></div></div><div className="file-access-note"><File size={16} /><span><strong>{selectedResource.originalFileName}</strong><br />{fileKind(selectedResource.mimeType)} · {formatSize(selectedResource.fileSize)}. It will preview in a new tab when your browser supports the format; otherwise it will download safely.</span></div><div className="modal-action-row"><a href={selectedResource.storageUrl} target="_blank" rel="noreferrer" className="open-resource-button"><FileText size={16} /> Open file</a><Button onClick={() => requireStudent(() => saveMutation.mutate({ id: selectedResource.id }))} variant="outline" className="rounded-full border-[#dad3cb] bg-white font-bold"><Bookmark size={16} fill={selectedResource.viewerHasSaved ? "currentColor" : "none"} /> {selectedResource.viewerHasSaved ? "Saved" : "Save"}</Button></div><div className="comment-section"><div className="comment-heading"><h3>Comments</h3><span>{selectedResource.commentCount}</span></div>{commentsQuery.data?.length ? <div className="comment-list">{commentsQuery.data.map((comment) => <div className="comment-item" key={comment.id}><span>{initials(comment.author.fullName)}</span><div><strong>{comment.author.fullName} <small>@{comment.author.username}</small></strong><p>{comment.body}</p></div></div>)}</div> : <p className="no-comments">No comments yet. Be the first to add a helpful thought.</p>}{student ? <form className="comment-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const body = new FormData(form).get("body")?.toString().trim(); if (body) { commentMutation.mutate({ resourceId: selectedResource.id, body }); form.reset(); } }}><input name="body" maxLength={1000} placeholder="Add a thoughtful comment…" /><button type="submit" disabled={commentMutation.isPending}><Send size={15} /></button></form> : <button className="comment-signin" onClick={() => openAccount("signin")}>Sign in to join the conversation <ChevronRight size={15} /></button>}</div></div></div>}</div></div>}
  </div>;
}
