import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/lib/pageTitle";
import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function About() {
  usePageTitle("About Kuppi — the Sri Lankan study tradition, online");
  const [, setLocation] = useLocation();
  return (
    <div className="grain-overlay min-h-screen overflow-x-hidden bg-[#f8f5ef] text-[#1c1a2c]">
      <header className="sticky top-0 z-40 border-b border-[#e9e4dc]/90 bg-[#f8f5ef]/90 backdrop-blur-xl">
        <div className="container flex h-[74px] items-center justify-between gap-4">
          <a href="/" className="brand-mark"><span className="brand-orb"><span /></span><span>Kuppi</span></a>
          <Button onClick={() => setLocation("/")} className="hidden h-10 rounded-full bg-[#5b35e8] px-4 text-sm font-bold text-white hover:bg-[#4827cf] sm:flex"><ArrowRight size={16} /> Browse the library</Button>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 780, paddingTop: 40, paddingBottom: 70 }}>
        <p className="section-kicker">ABOUT KUPPI</p>
        <h1 style={{ margin: "8px 0 18px", fontFamily: '"Fraunces", serif', fontSize: 40, letterSpacing: "-1.2px", lineHeight: 1.05 }}>What is a <em>kuppi</em> — and why we built a library around it.</h1>
        <p style={{ color: "#4c4556", fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
          In Sri Lanka, a <strong>kuppi</strong> is the small study circle students form when exam pressure hits —
          a handful of friends, one shared table, and everyone teaching everyone else what they finally understood.
          The word literally means a little bottle or lamp: something small that holds light and passes it on.
          Long before tuition classes and YouTube, the kuppi was how A/L and O/L students survived the syllabus together.
        </p>
        <p style={{ color: "#4c4556", fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
          <strong>Kuppi the platform</strong> takes that tradition online. It is a free library where Sri Lankan students
          share the study material that actually helped them — <strong>notes, past papers, revision guides, worksheets and
          quizzes</strong> for subjects like Combined Maths, Physics, Chemistry, Biology, Economics and more. Every file on
          Kuppi was uploaded by a real student, not a content farm. You can preview notes and papers directly in your
          browser, download them free, save the best ones, and pass your own understanding forward by publishing what you made.
        </p>
        <p style={{ color: "#4c4556", fontSize: 15, lineHeight: 1.8, marginBottom: 16 }}>
          Why free? Because the kuppi method was never about paying — it was about <em>passing it on</em>. The student who
          finally cracked a hard topic writes it down cleanly, shares it here, and the next student revising at 2 a.m.
          gets over the wall faster. Every upload earns its author a visible contribution record on their dashboard,
          and the community reports anything that isn't genuinely useful study material.
        </p>
        <h2 style={{ fontFamily: '"Fraunces", serif', fontSize: 26, margin: "26px 0 12px" }}>What you'll find in the library</h2>
        <ul style={{ color: "#4c4556", fontSize: 15, lineHeight: 1.9, paddingLeft: 22, marginBottom: 20 }}>
          <li><strong>A/L resources</strong> — Combined Maths, Physics, Chemistry, Biology, Economics, Business Studies and more</li>
          <li><strong>O/L resources</strong> — revision notes and guides across the ordinary-level subjects</li>
          <li><strong>Past-paper walkthroughs and model papers</strong> shared by students who sat the exams</li>
          <li><strong>Interactive HTML quizzes and notes</strong> that render right in your browser</li>
        </ul>
        <p style={{ color: "#4c4556", fontSize: 15, lineHeight: 1.8, marginBottom: 26 }}>
          Kuppi was created and is maintained by <a href="https://www.januth.dev" target="_blank" rel="noreferrer" style={{ color: "#5b35e8", fontWeight: 700 }}>Januth Nimnal</a>.
        </p>
        <Button onClick={() => setLocation("/")} className="h-12 rounded-full bg-[#5b35e8] px-6 font-bold text-white hover:bg-[#4827cf]">Browse the free library <ArrowRight size={17} /></Button>
      </main>
      <footer className="footer"><div className="container footer-bottom"><span>© 2026 Kuppi. Learn. Share. Grow together.</span><span>Free study notes from Sri Lankan students.</span></div></footer>
    </div>
  );
}
