import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  GraduationCap,
  Heart,
  Lightbulb,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { filterKuppiResources } from "@/lib/resourceFiltering";

type Resource = {
  id: number;
  title: string;
  description: string;
  subject: string;
  stream: string;
  level: string;
  exam: string;
  format: "PDF" | "Video" | "Guide" | "Worksheet";
  author: string;
  initials: string;
  color: string;
  likes: number;
  saves: number;
  time: string;
  featured?: boolean;
};

const resources: Resource[] = [
  {
    id: 1,
    title: "Functions: the revision map I wish I had earlier",
    description: "A visual, exam-first recap of domain, range, transformations and the common traps that cost marks.",
    subject: "Combined Maths",
    stream: "Physical Science",
    level: "A/L",
    exam: "2026 A/L",
    format: "PDF",
    author: "Navodya Perera",
    initials: "NP",
    color: "violet",
    likes: 248,
    saves: 631,
    time: "12 min read",
    featured: true,
  },
  {
    id: 2,
    title: "Organic chemistry reactions, made memorable",
    description: "A clean reaction sheet with colour cues, practical examples and fast recall prompts for structured essays.",
    subject: "Chemistry",
    stream: "Physical Science",
    level: "A/L",
    exam: "2025 A/L",
    format: "PDF",
    author: "Sithmi Jayawardena",
    initials: "SJ",
    color: "coral",
    likes: 186,
    saves: 409,
    time: "8 pages",
  },
  {
    id: 3,
    title: "Electric fields — one problem, three ways",
    description: "A short walkthrough that turns a high-frequency Physics question into a repeatable method.",
    subject: "Physics",
    stream: "Physical Science",
    level: "A/L",
    exam: "2026 A/L",
    format: "Video",
    author: "Dineth Rodrigo",
    initials: "DR",
    color: "ink",
    likes: 315,
    saves: 702,
    time: "6 min watch",
  },
  {
    id: 4,
    title: "How to make your first university research outline",
    description: "A simple structure for narrowing a topic, working with sources and beginning a stronger first draft.",
    subject: "Study Skills",
    stream: "University",
    level: "University",
    exam: "Semester 1",
    format: "Guide",
    author: "Mihira Weerasinghe",
    initials: "MW",
    color: "gold",
    likes: 129,
    saves: 288,
    time: "7 min read",
  },
  {
    id: 5,
    title: "Bio quick-recall: the human respiratory system",
    description: "A printable chapter summary with diagrams, vocab, and five quick self-check questions.",
    subject: "Biology",
    stream: "Biological Science",
    level: "A/L",
    exam: "2026 A/L",
    format: "Worksheet",
    author: "Amashi de Silva",
    initials: "AD",
    color: "mint",
    likes: 208,
    saves: 544,
    time: "4 pages",
  },
  {
    id: 6,
    title: "O/L ICT databases: past-paper approach",
    description: "A question-bank guide to tables, keys, queries and the exact language examiners expect.",
    subject: "ICT",
    stream: "Technology",
    level: "O/L",
    exam: "2026 O/L",
    format: "PDF",
    author: "Kavindu Dias",
    initials: "KD",
    color: "sky",
    likes: 174,
    saves: 362,
    time: "11 min read",
  },
];

const subjects = [
  { name: "Combined Maths", number: "1,240", tone: "violet", icon: "∫" },
  { name: "Physics", number: "916", tone: "sky", icon: "◌" },
  { name: "Chemistry", number: "844", tone: "coral", icon: "⌬" },
  { name: "Biology", number: "712", tone: "mint", icon: "✦" },
  { name: "ICT", number: "508", tone: "gold", icon: "⌘" },
];

const contributors = [
  { rank: 1, name: "Navodya Perera", role: "A/L · Physical Science", initials: "NP", points: "4,280", color: "violet" },
  { rank: 2, name: "Dineth Rodrigo", role: "A/L · Physical Science", initials: "DR", points: "3,940", color: "ink" },
  { rank: 3, name: "Sithmi Jayawardena", role: "A/L · Physical Science", initials: "SJ", points: "3,502", color: "coral" },
];

const filters = ["All resources", "A/L", "O/L", "University", "Physical Science", "Biological Science", "Technology"];

function Badge({ children, tone = "violet" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`kuppi-badge kuppi-badge-${tone}`}>{children}</span>;
}

function ResourceVisual({ resource, compact = false }: { resource: Resource; compact?: boolean }) {
  return (
    <div className={`resource-visual resource-visual-${resource.color} ${compact ? "resource-visual-compact" : ""}`}>
      <div className="visual-pattern visual-pattern-one" />
      <div className="visual-pattern visual-pattern-two" />
      <div className="visual-topline">
        <span>{resource.format === "Video" ? "KU PPI / MINI LESSON" : "KU PPI / STUDY NOTE"}</span>
        <span>{resource.level}</span>
      </div>
      <div className="visual-content">
        {resource.format === "Video" ? <Play className="fill-current" size={compact ? 18 : 24} /> : <FileText size={compact ? 18 : 24} />}
        <strong>{resource.subject}</strong>
        <span>{resource.format === "Video" ? "WATCH & REVISE" : "READ · SAVE · REPEAT"}</span>
      </div>
      <div className="visual-footer">
        <span className="visual-line" />
        <span>by {resource.initials}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All resources");
  const [activeSubject, setActiveSubject] = useState("For you");
  const [saved, setSaved] = useState<number[]>([]);
  const [liked, setLiked] = useState<number[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [customResources, setCustomResources] = useState<Resource[]>([]);
  const [form, setForm] = useState({ title: "", subject: "Combined Maths", level: "A/L", type: "PDF", description: "", fileName: "" });

  const allResources = [...customResources, ...resources];
  const filteredResources = useMemo(
    () => filterKuppiResources(allResources, query, activeFilter, activeSubject),
    [allResources, query, activeFilter, activeSubject],
  );

  const requireAuth = (callback: () => void) => {
    if (isAuthenticated) callback();
    else setShowLogin(true);
  };

  const handlePublish = () => {
    if (!form.title.trim()) {
      toast.error("Give your resource a clear title first.");
      return;
    }
    const newResource: Resource = {
      id: Date.now(),
      title: form.title,
      description: form.description || "A new study resource shared with the Kuppi community.",
      subject: form.subject,
      stream: form.level === "University" ? "University" : "Shared learning",
      level: form.level,
      exam: form.level === "O/L" ? "2026 O/L" : form.level === "A/L" ? "2026 A/L" : "Semester 1",
      format: form.type as Resource["format"],
      author: user?.name || "Kuppi student",
      initials: (user?.name || "KS").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      color: "violet",
      likes: 0,
      saves: 0,
      time: form.fileName || "Just shared",
    };
    setCustomResources((current) => [newResource, ...current]);
    setShowPublish(false);
    setForm({ title: "", subject: "Combined Maths", level: "A/L", type: "PDF", description: "", fileName: "" });
    toast.success("Your resource is now visible in the Kuppi feed.");
    document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8f5ef] text-[#1c1a2c]">
      <div className="announcement-bar">
        <div className="container flex items-center justify-center gap-2 text-center text-[11px] font-bold tracking-[0.12em] text-white uppercase sm:text-xs">
          <Sparkles size={14} /> Made for students helping students learn better
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-[#e9e4dc]/90 bg-[#f8f5ef]/90 backdrop-blur-xl">
        <div className="container flex h-[74px] items-center justify-between gap-4">
          <a href="#top" className="brand-mark" aria-label="Kuppi home">
            <span className="brand-orb"><span /></span>
            <span>Kuppi</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#625d6d] lg:flex">
            <a className="nav-link nav-link-active" href="#feed">Discover</a>
            <a className="nav-link" href="#subjects">Subjects</a>
            <a className="nav-link" href="#community">Community</a>
            <a className="nav-link" href="#how-it-works">How it works</a>
          </nav>
          <div className="hidden min-w-0 flex-1 justify-center md:flex lg:max-w-[360px]">
            <label className="search-shell w-full" aria-label="Search Kuppi">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes, subjects, or topics" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => requireAuth(() => toast("You’re all caught up."))} className="icon-button hidden sm:grid" aria-label="Notifications"><Bell size={18} /></button>
            <Button onClick={() => requireAuth(() => setShowPublish(true))} className="hidden h-10 rounded-full bg-[#5b35e8] px-4 text-sm font-bold text-white shadow-[0_7px_18px_rgba(91,53,232,0.22)] hover:bg-[#4827cf] sm:flex">
              <Plus size={17} /> Share a note
            </Button>
            {isAuthenticated ? (
              <button onClick={() => setShowProfile(true)} className="avatar-button" aria-label="Open your profile">{(user?.name || "Kuppi Student").split(" ").map((part) => part[0]).join("").slice(0, 2)}</button>
            ) : (
              <Button onClick={() => setShowLogin(true)} variant="outline" className="hidden h-10 rounded-full border-[#ddd5fb] bg-white px-4 text-sm font-bold text-[#5b35e8] hover:bg-[#f2efff] sm:flex">Sign in</Button>
            )}
            <button onClick={() => setShowMenu((visible) => !visible)} className="icon-button grid lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
          </div>
        </div>
        {showMenu && <div className="container border-t border-[#e9e4dc] py-4 lg:hidden"><div className="flex flex-col gap-3 text-sm font-bold"><a href="#feed" onClick={() => setShowMenu(false)}>Discover notes</a><a href="#subjects" onClick={() => setShowMenu(false)}>Browse subjects</a><a href="#community" onClick={() => setShowMenu(false)}>Community</a><button className="text-left text-[#5b35e8]" onClick={() => requireAuth(() => setShowPublish(true))}>Share a note</button></div></div>}
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-grid container">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-dot" /> Sri Lanka’s student-powered library</div>
              <h1>Learn brighter.<br /><em>Grow together.</em></h1>
              <p className="hero-description">Discover notes, resources and small breakthroughs shared by students who are figuring it out just like you.</p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} className="h-12 rounded-full bg-[#5b35e8] px-6 font-bold text-white shadow-[0_12px_28px_rgba(91,53,232,0.26)] hover:bg-[#4827cf]">Explore Kuppi <ArrowRight size={17} /></Button>
                <Button onClick={() => requireAuth(() => setShowPublish(true))} variant="outline" className="h-12 rounded-full border-[#d8d0c7] bg-transparent px-6 font-bold text-[#292639] hover:bg-white"><Upload size={17} /> Share your notes</Button>
              </div>
              <div className="hero-proof">
                <div className="avatar-stack"><span className="stack-avatar stack-one">NP</span><span className="stack-avatar stack-two">AD</span><span className="stack-avatar stack-three">DR</span><span className="stack-avatar stack-four">+</span></div>
                <p><strong>12,000+ learners</strong><br />already learning together</p>
              </div>
            </div>
            <div className="hero-art" aria-label="Kuppi platform preview">
              <div className="hero-spark hero-spark-top">✦</div><div className="hero-spark hero-spark-bottom">+</div>
              <div className="hero-window">
                <div className="mini-nav"><div className="mini-brand"><span className="mini-orb" /> Kuppi</div><div className="mini-search"><Search size={12} /> Search resources</div><div className="mini-avatar">N</div></div>
                <div className="mini-layout">
                  <aside className="mini-sidebar"><span className="sidebar-active"><Sparkles size={12} /> For you</span><span><BookOpen size={12} /> Notes</span><span><Users size={12} /> Community</span><span><TrendingUp size={12} /> Trending</span><div className="sidebar-line" /><small>YOUR PATH</small><span><GraduationCap size={12} /> A/L science</span></aside>
                  <div className="mini-feed">
                    <div className="mini-welcome"><span>MONDAY, 18 AUG</span><strong>Good evening, Nadee <span>✦</span></strong><p>A little learning goes a long way.</p></div>
                    <div className="mini-tabs"><b>For you</b><span>Popular</span><span>New</span></div>
                    <div className="mini-note-card"><div className="mini-note-cover"><span>∫</span><small>COMBINED<br />MATHS</small><i /></div><div><Badge>Recommended</Badge><h3>Functions, simplified</h3><p>A visual revision guide</p><div className="mini-author"><span>NP</span> Navodya · <Heart size={10} fill="currentColor" /> 248</div></div></div>
                    <div className="mini-row"><div className="mini-row-art">⌬</div><div><strong>Organic chemistry<br />reactions</strong><span>Sithmi · 8 pages</span></div><Bookmark size={13} /></div>
                  </div>
                  <aside className="mini-rail"><div className="mini-streak"><span>YOUR STREAK</span><strong>4 <small>days</small></strong><div>● ● ● ● <i>●</i> <i>●</i> <i>●</i></div></div><div className="mini-people"><span>TOP THIS WEEK</span><div><b>1</b><i>NP</i> Navodya</div><div><b>2</b><i>DR</i> Dineth</div><a href="#community">See leaderboard <ChevronRight size={11} /></a></div></aside>
                </div>
              </div>
              <div className="hero-float-card"><div className="float-icon"><Bookmark size={17} /></div><div><strong>Saved to your library</strong><span>Functions, simplified</span></div><Check size={16} /></div>
            </div>
          </div>
        </section>

        <section className="trust-strip"><div className="container flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-center text-sm font-semibold text-[#6e6875]"><span><Sparkles size={17} /> Made for Sri Lankan learners</span><span><BookOpen size={17} /> Notes for O/L, A/L & university</span><span><Users size={17} /> A community that gives back</span></div></section>

        <section id="feed" className="content-section container">
          <div className="section-heading-row"><div><div className="section-kicker">YOUR DISCOVERY SPACE</div><h2>A smarter place to start.</h2><p>Thoughtfully surfaced notes, tutorials and revision tools based on where you are right now.</p></div><button onClick={() => { setQuery(""); setActiveFilter("All resources"); setActiveSubject("For you"); }} className="text-link"><Sparkles size={16} /> Reset feed</button></div>
          <div className="filter-strip" aria-label="Resource filters">{filters.map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)} className={activeFilter === filter ? "filter-pill filter-pill-active" : "filter-pill"}>{filter}</button>)}</div>
          <div className="mobile-search md:hidden"><label className="search-shell"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources" /></label></div>
          <div className="discover-layout">
            <aside className="discover-aside">
              <div className="aside-card"><div className="aside-card-heading"><span>Explore by subject</span><CircleHelp size={15} /></div><div className="subject-list"><button className={activeSubject === "For you" ? "subject-button subject-button-active" : "subject-button"} onClick={() => setActiveSubject("For you")}><span className="subject-icon subject-icon-violet"><Sparkles size={15} /></span> For you</button>{subjects.map((subject) => <button key={subject.name} className={activeSubject === subject.name ? "subject-button subject-button-active" : "subject-button"} onClick={() => setActiveSubject(subject.name)}><span className={`subject-icon subject-icon-${subject.tone}`}>{subject.icon}</span> {subject.name}<small>{subject.number}</small></button>)}</div><button onClick={() => document.getElementById("subjects")?.scrollIntoView({ behavior: "smooth" })} className="view-all-button">View all subjects <ArrowRight size={14} /></button></div>
              <div className="study-tip"><Lightbulb size={18} /><div><strong>Make it yours</strong><p>Save resources you want to revisit. Your feed will get better with every choice.</p></div></div>
            </aside>
            <div className="resource-grid">
              {filteredResources.length ? filteredResources.slice(0, 4).map((resource, index) => <article key={resource.id} className={`resource-card ${index === 0 ? "resource-card-featured" : ""}`}><button onClick={() => setSelectedResource(resource)} className="resource-card-open"><ResourceVisual resource={resource} /></button><div className="resource-card-body"><div className="resource-meta"><Badge tone={resource.color}>{resource.subject}</Badge><span>{resource.level}</span></div><button onClick={() => setSelectedResource(resource)} className="resource-title">{resource.title}</button><p>{resource.description}</p><div className="resource-author"><span className={`author-avatar author-avatar-${resource.color}`}>{resource.initials}</span><span>{resource.author}</span><i /> <span>{resource.time}</span></div><div className="resource-actions"><button onClick={() => requireAuth(() => setLiked((current) => current.includes(resource.id) ? current.filter((id) => id !== resource.id) : [...current, resource.id]))} className={liked.includes(resource.id) ? "action-active" : ""}><Heart size={16} fill={liked.includes(resource.id) ? "currentColor" : "none"} /> {resource.likes + (liked.includes(resource.id) ? 1 : 0)}</button><button onClick={() => requireAuth(() => setSaved((current) => current.includes(resource.id) ? current.filter((id) => id !== resource.id) : [...current, resource.id]))} className={saved.includes(resource.id) ? "action-active" : ""}><Bookmark size={16} fill={saved.includes(resource.id) ? "currentColor" : "none"} /> {saved.includes(resource.id) ? "Saved" : resource.saves}</button><button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Resource link copied to your clipboard."); }} aria-label="Share resource"><Share2 size={16} /></button></div></div></article>) : <div className="empty-resource"><Search size={27} /><strong>No notes found yet</strong><p>Try another subject, study level, or search phrase.</p><button onClick={() => { setQuery(""); setActiveFilter("All resources"); setActiveSubject("For you"); }}>Clear all filters</button></div>}
            </div>
            <aside className="community-rail" id="community"><div className="rail-card leaderboard-card"><div className="rail-heading"><div><span>THIS WEEK</span><h3>Top contributors</h3></div><span className="rank-mark"><TrendingUp size={16} /></span></div>{contributors.map((contributor) => <button key={contributor.rank} onClick={() => setShowProfile(true)} className="contributor-row"><b>{contributor.rank}</b><span className={`contributor-avatar contributor-avatar-${contributor.color}`}>{contributor.initials}</span><span><strong>{contributor.name}</strong><small>{contributor.role}</small></span><em>{contributor.points}<small> pts</small></em></button>)}<button onClick={() => toast("The full leaderboard is coming soon.")} className="rail-link">View leaderboard <ChevronRight size={15} /></button></div><div className="rail-card streak-card"><div className="streak-title"><span>YOUR LEARNING RHYTHM</span><div className="streak-flame">✦</div></div><h3>Show up for future you.</h3><p>Save one resource this week to begin your learning streak.</p><div className="streak-days">{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`} className={index < 2 ? "streak-day streak-day-done" : "streak-day"}><i>{index < 2 ? <Check size={12} /> : ""}</i>{day}</span>)}</div></div></aside>
          </div>
        </section>

        <section id="subjects" className="subjects-section"><div className="container"><div className="section-heading-row"><div><div className="section-kicker">BROWSE WITH INTENTION</div><h2>Find your corner of the syllabus.</h2></div><p className="section-side-copy">From quick questions to full revision packs, begin with the subjects and exam stages that matter most to you.</p></div><div className="subject-cards">{subjects.map((subject, index) => <button key={subject.name} onClick={() => { setActiveSubject(subject.name); document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" }); }} className={`subject-card subject-card-${subject.tone}`}><div><span className="subject-card-icon">{subject.icon}</span><span className="subject-card-count">{subject.number} resources</span></div><strong>{subject.name}</strong><span>Explore notes <ArrowRight size={15} /></span><i>{String(index + 1).padStart(2, "0")}</i></button>)}</div></div></section>

        <section className="feature-section container"><div className="feature-copy"><div className="section-kicker">KUPPI, ON YOUR SIDE</div><h2>Less digging.<br /><em>More learning.</em></h2><p>Organise the noise with a personal space built around your subjects, goals, and the generous people sharing what they know.</p><div className="feature-points"><div><span><Search size={18} /></span><p><strong>Search that understands study</strong>Find notes by stream, topic, level, paper and resource type.</p></div><div><span><Bookmark size={18} /></span><p><strong>A library that stays useful</strong>Save the good stuff and come back when revision starts.</p></div><div><span><Heart size={18} /></span><p><strong>Every share makes a difference</strong>Recognise helpful work and help another student get unstuck.</p></div></div><Button onClick={() => document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" })} className="mt-7 h-11 rounded-full bg-[#1c1a2c] px-5 font-bold text-white hover:bg-[#333044]">Discover resources <ArrowRight size={16} /></Button></div><div className="library-art"><div className="library-blur library-blur-one" /><div className="library-blur library-blur-two" /><div className="library-window"><div className="library-top"><span>My Kuppi library</span><button onClick={() => requireAuth(() => toast("Your library is ready for saved resources."))}><MoreHorizontal size={18} /></button></div><div className="library-tabs"><b>Saved <span>{saved.length || 12}</span></b><span>Recently viewed</span><span>Collections</span></div><div className="library-list">{resources.slice(0, 3).map((resource) => <button key={resource.id} onClick={() => setSelectedResource(resource)}><ResourceVisual resource={resource} compact /><span><strong>{resource.title}</strong><small>{resource.subject} · {resource.time}</small></span><Bookmark size={15} fill={saved.includes(resource.id) ? "currentColor" : "none"} /></button>)}</div></div><div className="library-note"><span><Star size={16} fill="currentColor" /></span><p><strong>A little at a time.</strong><br />You are building a habit.</p></div></div></section>

        <section id="how-it-works" className="how-section"><div className="container"><div className="section-kicker">HOW KUPPI WORKS</div><h2>A community that moves<br />learning <em>forward.</em></h2><div className="how-grid"><article><span>01</span><div className="how-icon"><Search size={25} /></div><h3>Discover what helps</h3><p>Search intelligently, follow a subject trail, and find resources made for your exact stage.</p></article><article><span>02</span><div className="how-icon"><Upload size={25} /></div><h3>Share what you know</h3><p>Turn a useful note, a breakthrough, or a clear explanation into someone else’s starting point.</p></article><article><span>03</span><div className="how-icon"><Users size={25} /></div><h3>Grow together</h3><p>Save the work you value, support good contributors, and build a better study culture together.</p></article></div></div></section>

        <section className="cta-section container"><div className="cta-orb cta-orb-one" /><div className="cta-orb cta-orb-two" /><div className="cta-content"><div><span className="eyebrow eyebrow-light"><span className="eyebrow-dot" /> Your next study win starts here</span><h2>Bring what you know.<br /><em>Take what you need.</em></h2></div><div><p>Kuppi is a calmer, kinder place for Sri Lankan students to learn out loud.</p><Button onClick={() => requireAuth(() => setShowPublish(true))} className="mt-4 h-12 rounded-full bg-white px-6 font-bold text-[#4c2ed1] hover:bg-[#f2efff]">Share a resource <ArrowRight size={17} /></Button></div></div></section>
      </main>

      <footer className="footer"><div className="container"><div className="footer-top"><a href="#top" className="brand-mark"><span className="brand-orb"><span /></span><span>Kuppi</span></a><p>Made with care for curious minds across Sri Lanka.</p><div className="footer-links"><a href="#feed">Discover</a><a href="#subjects">Subjects</a><a href="#community">Community</a><a href="#how-it-works">About</a></div></div><div className="footer-bottom"><span>© 2026 Kuppi. Learn. Share. Grow together.</span><span>Built around kindness, curiosity and good notes.</span></div></div></footer>

      {(showLogin || showPublish || showProfile || selectedResource) && <div className="modal-layer" role="presentation" onMouseDown={() => { setShowLogin(false); setShowPublish(false); setShowProfile(false); setSelectedResource(null); }}><div className={`modal-card ${showPublish ? "modal-card-publish" : ""}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => { setShowLogin(false); setShowPublish(false); setShowProfile(false); setSelectedResource(null); }} aria-label="Close"><X size={18} /></button>
        {showLogin && <div className="login-modal"><span className="modal-mark"><span className="brand-orb"><span /></span></span><h2>Your Kuppi journey starts here.</h2><p>Sign in to save resources, cheer on contributors and share notes that might change someone’s day.</p><Button onClick={() => startLogin()} className="google-button"><span className="google-g">G</span> Continue with Google</Button><small>By continuing, you agree to learn with kindness and credit the work you share.</small></div>}
        {showPublish && <div className="publish-modal"><div className="modal-heading"><div className="modal-mark-small"><Upload size={18} /></div><div><span>CONTRIBUTE TO KUPPI</span><h2>Share a study resource</h2></div></div><p className="modal-intro">Add the useful note, guide or resource you wish you had found earlier.</p><div className="publish-form"><label><span>Resource title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. A/L electrochemistry made simple" /></label><div className="form-row"><label><span>Subject</span><select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}>{subjects.map((subject) => <option key={subject.name}>{subject.name}</option>)}<option>Study Skills</option></select></label><label><span>Study level</span><select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}><option>A/L</option><option>O/L</option><option>University</option></select></label></div><div className="form-row"><label><span>Resource type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option>PDF</option><option>Video</option><option>Guide</option><option>Worksheet</option></select></label><label><span>Attachment</span><input className="file-input" type="file" accept=".pdf,image/*,video/*" onChange={(event) => setForm({ ...form, fileName: event.target.files?.[0]?.name || "" })} /></label></div><label><span>What makes this useful?</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Give fellow students a little context…" rows={3} /></label>{form.fileName && <div className="attached-file"><FileText size={15} /> {form.fileName} <Check size={15} /></div>}<Button onClick={handlePublish} className="w-full rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]">Publish to Kuppi <Send size={16} /></Button></div></div>}
        {showProfile && <div className="profile-modal"><div className="profile-cover" /><div className="profile-avatar">{(user?.name || "Kuppi Student").split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div className="profile-main"><Badge>Contributor</Badge><h2>{user?.name || "Kuppi Student"}</h2><p>@{(user?.name || "kuppi.student").toLowerCase().replace(/\s+/g, ".")}</p><div className="profile-tags"><span>A/L learner</span><span>Sri Lanka</span><span>Curious mind</span></div><div className="profile-stats"><div><strong>{customResources.length}</strong><span>Shared</span></div><div><strong>{saved.length}</strong><span>Saved</span></div><div><strong>0</strong><span>Followers</span></div></div><Button onClick={() => { setShowProfile(false); setShowPublish(true); }} className="w-full rounded-full bg-[#1c1a2c] font-bold text-white hover:bg-[#333044]"><Plus size={16} /> Share your first resource</Button></div></div>}
        {selectedResource && <div className="resource-modal"><ResourceVisual resource={selectedResource} /><div className="resource-modal-content"><div className="resource-meta"><Badge tone={selectedResource.color}>{selectedResource.subject}</Badge><span>{selectedResource.level} · {selectedResource.exam}</span></div><h2>{selectedResource.title}</h2><p>{selectedResource.description}</p><div className="modal-author"><span className={`author-avatar author-avatar-${selectedResource.color}`}>{selectedResource.initials}</span><div><strong>{selectedResource.author}</strong><span>Student contributor · Sri Lanka</span></div></div><div className="modal-action-row"><Button onClick={() => requireAuth(() => setSaved((current) => current.includes(selectedResource.id) ? current.filter((id) => id !== selectedResource.id) : [...current, selectedResource.id]))} className="rounded-full bg-[#5b35e8] font-bold text-white hover:bg-[#4827cf]"><Bookmark size={16} fill={saved.includes(selectedResource.id) ? "currentColor" : "none"} /> {saved.includes(selectedResource.id) ? "Saved to library" : "Save resource"}</Button><Button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Resource link copied to your clipboard."); }} variant="outline" className="rounded-full border-[#dad3cb] bg-white font-bold"><Share2 size={16} /> Share</Button></div></div></div>}
      </div></div>}
      {!loading && isAuthenticated && <div className="signed-in-chip"><Check size={13} /> Personalising your Kuppi feed</div>}
    </div>
  );
}
