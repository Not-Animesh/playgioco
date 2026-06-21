// PlayGioco — Find The Imposter  •  v4
// Supabase realtime + localStorage fallback

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import QRCodeSVG from "react-qr-code"
import { toast, Toaster } from "sonner"
import {
  Copy, Crown, X, Check, Eye, Play, RotateCcw,
  Home, BarChart2, Send, Share2, ChevronRight,
  AlertCircle, ArrowRight, Link2, Wifi, WifiOff,
} from "lucide-react"

import { roomDB, hasSupabase } from "./supabase"

const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs))

// ─── TYPES ────────────────────────────────────────────────────────────────────

type View = "landing" | "create" | "join" | "lobby" | "role-reveal" | "game" | "vote" | "results" | "stats"
type Category = "Food" | "Movies" | "Countries" | "Celebrities" | "Sports" | "Technology"

interface Player {
  id: string
  guestId: string
  displayName: string
  role?: "imposter" | "innocent"
  isHost: boolean
  isEliminated: boolean
  hasRevealed: boolean
  imposterHistory: number
}

interface Message {
  id: string
  playerId: string
  playerName: string
  content: string
  type: "clue" | "system"
  timestamp: number
}

interface GameSession {
  word: string
  category: string
  imposterId: string
  roundNumber: number
  phase: "role-reveal" | "clue" | "decision" | "vote" | "results"
  speakingOrder: string[]
  currentSpeakerIndex: number
  messages: Message[]
  votes: Record<string, string>
  continueVotes: Record<string, boolean>
  revealProgress: number
  result?: {
    winner: "innocents" | "imposter"
    eliminatedPlayerId: string
    eliminatedPlayerName: string
    imposterName: string
    word: string
    roundsPlayed: number
  }
}

interface Room {
  code: string
  hostId: string
  status: "waiting" | "playing" | "finished"
  settings: {
    category: Category
    timerSeconds: number | null
    rounds: number | null
    maxPlayers: number
  }
  players: Player[]
  session?: GameSession
  usedWords: string[]
  lastUpdated: number
}

interface LocalStats {
  gamesPlayed: number
  gamesWon: number
  imposterWins: number
  detectiveWins: number
  gamesHosted: number
  roundsPlayed: number
}

// ─── WORD BANKS ───────────────────────────────────────────────────────────────
// Large enough pools to avoid immediate repeats within a session.
// usedWords is tracked per-room and persisted in the DB.

const WORD_BANKS: Record<Category, string[]> = {
  Food: [
    "Pizza","Sushi","Burger","Pasta","Tacos","Ramen","Curry","Steak",
    "Croissant","Paella","Biryani","Pho","Falafel","Tiramisu","Gyoza",
    "Shakshuka","Waffles","Dim Sum","Lasagna","Baklava","Churros",
    "Nachos","Dumplings","Risotto","Fondue","Crepe","Bao","Kebab",
    "Empanada","Moussaka",
  ],
  Movies: [
    "Inception","Titanic","Avatar","Joker","The Matrix","Parasite",
    "Interstellar","Pulp Fiction","The Godfather","Avengers","Oppenheimer",
    "Barbie","Dune","Alien","Coco","Frozen","Gladiator","Shrek",
    "The Notebook","Whiplash","Get Out","Everything Everywhere",
    "Spirited Away","La La Land","Tenet","1917","Hereditary","Midsommar",
  ],
  Countries: [
    "France","Japan","Brazil","India","Germany","Canada","Australia",
    "Morocco","Argentina","South Korea","Egypt","Norway","Colombia",
    "Thailand","Portugal","Iceland","Kenya","Vietnam","Peru","Greece",
    "Netherlands","Switzerland","Mexico","Italy","Spain","Turkey","Iran","Cuba",
  ],
  Celebrities: [
    "Beyoncé","Elon Musk","Taylor Swift","Tom Hanks","Cristiano Ronaldo",
    "Rihanna","Keanu Reeves","Billie Eilish","LeBron James","Zendaya",
    "Bad Bunny","Shakira","Adele","Drake","Lady Gaga","Ed Sheeran",
    "Ariana Grande","The Rock","Ryan Reynolds","Emma Watson","Dua Lipa",
    "BTS","Serena Williams","Roger Federer","Lionel Messi",
  ],
  Sports: [
    "Football","Basketball","Tennis","Swimming","Cricket","Volleyball",
    "Golf","Boxing","Cycling","Skateboarding","Badminton","Surfing",
    "Marathon","Gymnastics","Wrestling","Archery","Fencing","Rowing",
    "Snowboarding","Table Tennis","Judo","Rugby","Baseball","Polo",
  ],
  Technology: [
    "iPhone","ChatGPT","Bitcoin","Netflix","Spotify","Tesla","Zoom",
    "Airbnb","TikTok","Google","PlayStation","OpenAI","Figma","Slack",
    "Twitter","Instagram","YouTube","Amazon","Meta","Uber","Snapchat",
    "Reddit","Discord","Twitch","Notion","Linear","Vercel","Stripe",
  ],
}

const CATEGORIES: Category[] = ["Food","Movies","Countries","Celebrities","Sports","Technology"]
const TIMER_OPTIONS: { label: string; value: number | null }[] = [
  { label: "30s", value: 30 },{ label: "60s", value: 60 },
  { label: "120s", value: 120 },{ label: "None", value: null },
]
const ROUND_OPTIONS: { label: string; value: number | null }[] = [
  { label: "1", value: 1 },{ label: "3", value: 3 },
  { label: "5", value: 5 },{ label: "∞", value: null },
]

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const genId    = () => Math.random().toString(36).slice(2, 10)
const genCode  = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}
const getGuestId = () => {
  let id = localStorage.getItem("gioco_guest_id")
  if (!id) { id = `guest_${genId()}`; localStorage.setItem("gioco_guest_id", id) }
  return id
}
const pickWord = (category: Category, used: string[] = []) => {
  const pool = WORD_BANKS[category].filter(w => !used.includes(w))
  const src  = pool.length > 0 ? pool : WORD_BANKS[category]
  return src[Math.floor(Math.random() * src.length)]
}
const assignRoles = (players: Player[]): Player[] => {
  // Fairness: prefer player with fewest imposter turns
  const sorted = [...players].sort((a, b) => a.imposterHistory - b.imposterHistory)
  const imposterId = sorted[0].id
  return players.map(p => ({
    ...p, hasRevealed: false,
    role: p.id === imposterId ? ("imposter" as const) : ("innocent" as const),
    imposterHistory: p.id === imposterId ? p.imposterHistory + 1 : p.imposterHistory,
  }))
}
const buildOrder = (players: Player[], imposterId: string): string[] => {
  const alive = players.filter(p => !p.isEliminated)
  const shuffled = [...alive].sort(() => Math.random() - 0.5)
  // Imposter must NOT be first
  const idx = shuffled.findIndex(p => p.id === imposterId)
  if (idx === 0 && shuffled.length > 1) {
    const swap = Math.floor(Math.random() * (shuffled.length - 1)) + 1
    ;[shuffled[0], shuffled[swap]] = [shuffled[swap], shuffled[0]]
  }
  return shuffled.map(p => p.id)
}

// ─── LOCAL STATS ──────────────────────────────────────────────────────────────

const statsDB = {
  get: (): LocalStats => {
    try { return JSON.parse(localStorage.getItem("gioco_stats") || "null") || { gamesPlayed:0,gamesWon:0,imposterWins:0,detectiveWins:0,gamesHosted:0,roundsPlayed:0 } }
    catch { return { gamesPlayed:0,gamesWon:0,imposterWins:0,detectiveWins:0,gamesHosted:0,roundsPlayed:0 } }
  },
  patch: (p: Partial<LocalStats>) => {
    localStorage.setItem("gioco_stats", JSON.stringify({ ...statsDB.get(), ...p }))
  },
}

// ─── ANIMATION PRESETS ────────────────────────────────────────────────────────

const fadeUp = { initial:{ opacity:0, y:16 }, animate:{ opacity:1, y:0 }, exit:{ opacity:0, y:-8 } }
const fadeIn  = { initial:{ opacity:0 }, animate:{ opacity:1 }, exit:{ opacity:0 } }
const stagger = { animate:{ transition:{ staggerChildren:0.06 } } }

// ─── CLIPBOARD — bulletproof multi-strategy ───────────────────────────────────
// Strategy 1: Clipboard API (HTTPS / secure context)
// Strategy 2: execCommand (works in most iframes)
// Strategy 3: programmatic select on a visible input (manual copy fallback)

function doCopy(text: string): boolean {
  // Strategy 1
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {})
    return true
  }
  // Strategy 2
  try {
    const el = Object.assign(document.createElement("textarea"), {
      value: text,
      style: "position:fixed;opacity:0;top:-9999px",
    })
    document.body.appendChild(el)
    el.focus()
    el.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(el)
    if (ok) return true
  } catch {}
  return false
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "accent" | "white"
  size?: "sm" | "md" | "lg"
  loading?: boolean
}
const Btn = ({ variant="primary", size="md", loading, className, children, disabled, ...p }: BtnProps) => {
  const base = "inline-flex items-center justify-center font-semibold transition-all duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed tracking-tight"
  const v = {
    primary: "bg-foreground text-primary-foreground hover:opacity-80 active:scale-[0.98]",
    outline: "border border-foreground/25 text-foreground hover:border-foreground active:scale-[0.98]",
    ghost:   "text-foreground hover:bg-black/5 active:scale-[0.98]",
    accent:  "bg-accent text-accent-foreground hover:opacity-90 active:scale-[0.98]",
    white:   "bg-white text-foreground hover:bg-white/90 active:scale-[0.98]",
  }
  const s = { sm:"text-xs px-3 py-1.5 gap-1.5", md:"text-sm px-4 py-2.5 gap-2", lg:"text-base px-6 py-3.5 gap-2.5" }
  return (
    <button className={cn(base, v[variant], s[size], className)} disabled={disabled || loading} {...p}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : children}
    </button>
  )
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string
}
const Field = ({ label, error, hint, className, ...p }: FieldProps) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</label>}
    <input
      className={cn("w-full px-4 py-3.5 bg-white border text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors duration-150 text-sm",
        error ? "border-destructive" : "border-border focus:border-foreground", className)}
      {...p}
    />
    {error && <span className="text-xs text-destructive">{error}</span>}
    {hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
)

/** Copyable read-only input — user can always tap/click to select and copy manually */
const CopyInput = ({ value, label, dark }: { value: string; label: string; dark?: boolean }) => {
  const ref = useRef<HTMLInputElement>(null)
  const [done, setDone] = useState(false)

  const copy = () => {
    // Always select the input text first (manual fallback)
    if (ref.current) {
      ref.current.focus()
      ref.current.select()
      ref.current.setSelectionRange(0, 99999)
    }
    const succeeded = doCopy(value)
    if (succeeded) {
      setDone(true)
      setTimeout(() => setDone(false), 2500)
      toast.success(`${label} copied!`)
    } else {
      // Clipboard blocked — input is already selected, instruct user
      toast(`Select all and press Ctrl+C / ⌘+C`, { icon: "📋" })
    }
  }

  const base = dark
    ? "flex-1 min-w-0 px-3 py-2.5 bg-white/8 border border-white/15 text-white/80 text-sm font-mono focus:outline-none focus:border-white/40 cursor-text"
    : "flex-1 min-w-0 px-3 py-2.5 bg-[#F8F8F8] border border-black/10 text-foreground text-sm font-mono focus:outline-none focus:border-foreground cursor-text"
  const btn = done
    ? "px-4 flex-shrink-0 bg-accent/90 text-white text-xs font-bold flex items-center gap-1.5"
    : dark
      ? "px-4 flex-shrink-0 bg-accent text-white text-xs font-bold hover:bg-accent/90 transition-colors flex items-center gap-1.5"
      : "px-4 flex-shrink-0 bg-foreground text-white text-xs font-bold hover:opacity-80 transition-opacity flex items-center gap-1.5"

  return (
    <div className="flex items-stretch gap-0">
      <input
        ref={ref}
        readOnly
        value={value}
        onClick={() => { ref.current?.select(); ref.current?.setSelectionRange(0, 99999) }}
        className={base}
      />
      <button onClick={copy} className={btn}>
        {done ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
    </div>
  )
}

// ─── QR CODE — self-hosted SVG, no external API ───────────────────────────────
const QRBlock = ({ value, size=120 }: { value: string; size?: number }) => (
  <div className="bg-white p-3 border border-black/10 inline-block">
    <QRCodeSVG value={value} size={size} fgColor="#171717" bgColor="#ffffff" level="M" />
  </div>
)

// ─── STATUS BAR ───────────────────────────────────────────────────────────────
const ConnectionBadge = () => (
  <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold tracking-widest uppercase",
    hasSupabase ? "text-green-600" : "text-amber-500")}>
    {hasSupabase ? <><Wifi size={10} /> Realtime</> : <><WifiOff size={10} /> Local only</>}
  </span>
)

// ─── HOOK: useRoom ────────────────────────────────────────────────────────────

const useRoom = (code: string | null) => {
  const [room, setRoom] = useState<Room | null>(null)

  useEffect(() => {
    if (!code) return

    // 1. Initial load
    roomDB.get(code).then(data => { if (data) setRoom(data as Room) })

    // 2. Live subscription (Supabase Realtime OR localStorage poll + BroadcastChannel)
    const unsub = roomDB.subscribe(code, data => {
      if (data == null) setRoom(null)
      else setRoom(data as Room)
    })

    return unsub
  }, [code])

  const updateRoom = useCallback((updater: (r: Room) => Room) => {
    setRoom(prev => {
      if (!prev) return prev
      const next = updater(prev)
      roomDB.set(next.code, next)   // optimistic — fires Supabase in background
      return next
    })
  }, [])

  return { room, setRoom, updateRoom }
}

// ─── SPINNER ──────────────────────────────────────────────────────────────────
const Spinner = ({ label = "Loading…" }: { label?: string }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F8F8F8]">
    <div className="w-7 h-7 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    <p className="text-sm text-muted-foreground font-['Inter',_sans-serif]">{label}</p>
  </div>
)

// ─── ILLUSTRATION (Landing hero) ──────────────────────────────────────────────
const RoundTableSVG = () => {
  const cx=220, cy=210, R=150, NR=192
  const seats = [
    { a:-90, name:"ALEX",   clue:'"warm"',    imp:false },
    { a:-30, name:"RILEY",  clue:'"round"',   imp:false },
    { a: 30, name:"JORDAN", clue:'"baked"',   imp:false },
    { a: 90, name:"SAM",    clue:'"Italian"', imp:false },
    { a:150, name:"???",    clue:"???",       imp:true  },
    { a:210, name:"TAYLOR", clue:'"cheesy"',  imp:false },
  ]
  return (
    <svg viewBox="0 0 440 420" fill="none" className="w-full max-w-[480px]">
      {seats.map((s,i)=>{const r=(s.a*Math.PI)/180,x=cx+R*Math.cos(r),y=cy+R*Math.sin(r);return<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#DEDEDE" strokeWidth="1" strokeDasharray="3 4"/>})}
      <ellipse cx={cx} cy={cy} rx={72} ry={48} stroke="#171717" strokeWidth="1.5"/>
      <text x={cx} y={cy+10} textAnchor="middle" fontFamily="Geist,sans-serif" fontWeight="900" fontSize="30" fill="#171717">?</text>
      {seats.map((s,i)=>{
        const r=(s.a*Math.PI)/180,x=cx+R*Math.cos(r),y=cy+R*Math.sin(r),nx=cx+NR*Math.cos(r),ny=cy+NR*Math.sin(r)
        return(
          <g key={i}>
            <rect x={x-26} y={y-17} width={52} height={34} stroke={s.imp?"#F25623":"#171717"} strokeWidth={s.imp?1.5:1} fill={s.imp?"#FFF4F1":"white"}/>
            <text x={x} y={y+6} textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="8.5" fill={s.imp?"#F25623":"#4D4D4D"} fontStyle={s.imp?"normal":"italic"} fontWeight={s.imp?"700":"400"}>{s.clue}</text>
            <text x={nx} y={ny+4} textAnchor="middle" fontFamily="Geist,sans-serif" fontWeight="700" fontSize="8.5" fill={s.imp?"#F25623":"#171717"} letterSpacing="0.08em">{s.name}</text>
          </g>
        )
      })}
      <rect x={4} y={4} width={430} height={412} stroke="#DEDEDE" strokeWidth="0.75"/>
    </svg>
  )
}

// ─── LANDING ──────────────────────────────────────────────────────────────────

const LandingView = ({ onNavigate }: { onNavigate: (v: View) => void }) => (
  <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration: 0.25 }}
    className="min-h-screen bg-white text-foreground font-['Inter',_sans-serif]">
    <nav className="border-b border-black/8">
      <div className="max-w-7xl mx-auto px-8 h-14 flex items-center justify-between">
        <span className="font-['Geist',_sans-serif] font-black text-base tracking-tight">PLAYGIOCO</span>
        <div className="hidden md:flex items-center gap-8 text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          <button onClick={() => onNavigate("join")} className="hover:text-foreground transition-colors">Join</button>
          <button onClick={() => onNavigate("stats")} className="hover:text-foreground transition-colors">Stats</button>
        </div>
        <Btn variant="primary" size="sm" onClick={() => onNavigate("create")}>Create Game <ArrowRight size={13}/></Btn>
      </div>
    </nav>

    <section className="max-w-7xl mx-auto px-8 py-20 lg:py-28">
      <div className="grid lg:grid-cols-[1fr_1fr] gap-12 lg:gap-8 items-center">
        <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-10">
          <motion.div variants={fadeUp} transition={{ duration: 0.4 }}>
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-7">Social Deduction · Real Time · No Sign Up</p>
            <h1 className="font-['Geist',_sans-serif] font-black leading-[0.88] tracking-tighter text-foreground" style={{ fontSize:"clamp(72px,11vw,132px)" }}>
              WHO'S<br/><span className="text-accent">LY</span>ING?
            </h1>
          </motion.div>
          <motion.p variants={fadeUp} transition={{ duration:0.4,delay:0.08 }} className="text-[17px] text-muted-foreground leading-relaxed max-w-sm">
            One player knows nothing. Everyone else shares the word. Find the imposter before they fool you all.
          </motion.p>
          <motion.div variants={fadeUp} transition={{ duration:0.4,delay:0.14 }} className="flex flex-col sm:flex-row gap-3">
            <Btn variant="accent" size="lg" onClick={() => onNavigate("create")} className="group font-bold">
              Create a Room <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform"/>
            </Btn>
            <Btn variant="outline" size="lg" onClick={() => onNavigate("join")} className="font-bold">Join with Code</Btn>
          </motion.div>
          <motion.div variants={fadeUp} transition={{ duration:0.4,delay:0.2 }} className="flex items-center gap-8 pt-2 border-t border-black/8">
            {[["3–10","Players"],["Free","Always"],["No","Account"]].map(([v,l]) => (
              <div key={l}><div className="font-['Geist',_sans-serif] font-black text-lg">{v}</div><div className="text-[11px] tracking-widest uppercase text-muted-foreground">{l}</div></div>
            ))}
          </motion.div>
        </motion.div>
        <motion.div initial={{ opacity:0,x:24 }} animate={{ opacity:1,x:0 }} transition={{ duration:0.5,delay:0.15 }} className="hidden lg:block">
          <RoundTableSVG/>
        </motion.div>
      </div>
    </section>

    <section className="border-t border-black/8 bg-[#F8F8F8]">
      <div className="max-w-7xl mx-auto px-8 py-20">
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-3">Games</p>
            <h2 className="font-['Geist',_sans-serif] font-black text-[clamp(36px,5vw,52px)] leading-none tracking-tight">Play Now</h2>
          </div>
          <p className="text-sm text-muted-foreground hidden sm:block">More games coming soon</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <motion.div whileHover={{ y:-3 }} transition={{ duration:0.15 }} onClick={() => onNavigate("create")}
            className="bg-white border border-black/10 p-7 cursor-pointer group hover:border-foreground transition-colors">
            <div className="flex items-start justify-between mb-5">
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-accent text-white">Live Now</span>
              <ChevronRight size={16} className="text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all"/>
            </div>
            <h3 className="font-['Geist',_sans-serif] font-black text-2xl mb-3 tracking-tight">Find The Imposter</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">One imposter must blend in without knowing the word. Innocents give clues. Everyone votes.</p>
            <div className="flex items-center gap-5 text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
              <span>3–10 Players</span><span>10–20 min</span>
            </div>
          </motion.div>
          {[{t:"Mafia",d:"Eliminate threats. Trust no one."},{t:"Undercover",d:"Two factions. One secret word."}].map(g => (
            <div key={g.t} className="border border-dashed border-black/15 p-7 opacity-45">
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground border border-border px-2 py-0.5">Soon</span>
              <h3 className="font-['Geist',_sans-serif] font-black text-2xl mt-5 mb-2 tracking-tight">{g.t}</h3>
              <p className="text-sm text-muted-foreground">{g.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="bg-foreground text-primary-foreground">
      <div className="max-w-7xl mx-auto px-8 py-20">
        <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-white/30 mb-14">How It Works</p>
        <div className="grid md:grid-cols-3 gap-12">
          {[
            {n:"01",t:"Create a Room",b:"Choose a category, configure your timer, and share the 6-character room code with friends."},
            {n:"02",t:"Pass the Device",b:"Each player secretly reveals their role. The imposter gets no word — only the category."},
            {n:"03",t:"Find the Imposter",b:"Give clues. Listen carefully. Vote together to eliminate who you think is lying."},
          ].map(({n,t,b}) => (
            <motion.div key={n} initial={{ opacity:0,y:16 }} whileInView={{ opacity:1,y:0 }} viewport={{ once:true }} transition={{ duration:0.35 }}>
              <div className="font-['Geist',_sans-serif] font-black text-[64px] leading-none text-white/8 mb-5">{n}</div>
              <h3 className="font-['Geist',_sans-serif] font-black text-xl mb-3 tracking-tight">{t}</h3>
              <p className="text-sm text-white/45 leading-relaxed">{b}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    <footer className="border-t border-black/8 bg-white">
      <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
        <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">PLAYGIOCO</span>
        <div className="flex items-center gap-4"><ConnectionBadge/><span className="text-xs text-muted-foreground">© 2025</span></div>
      </div>
    </footer>
  </motion.div>
)

// ─── CREATE VIEW ──────────────────────────────────────────────────────────────

const CreateView = ({ onNavigate, onEnter }: {
  onNavigate: (v: View) => void
  onEnter: (code: string, playerId: string) => void
}) => {
  const [step, setStep]     = useState(1)
  const [name, setName]     = useState("")
  const [nameErr, setNameErr] = useState("")
  const [category, setCategory] = useState<Category>("Food")
  const [timer, setTimer]   = useState<number | null>(60)
  const [rounds, setRounds] = useState<number | null>(3)
  const [loading, setLoading] = useState(false)

  const validateName = () => {
    if (name.trim().length < 2)  { setNameErr("At least 2 characters"); return false }
    if (name.trim().length > 20) { setNameErr("Max 20 characters"); return false }
    setNameErr(""); return true
  }

  const createRoom = async () => {
    if (!validateName()) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 250))

    const guestId  = getGuestId()
    const playerId = genId()
    let code = genCode()
    // Collision safety — regenerate if code already exists in local cache
    while (localStorage.getItem(`gioco_room_${code}`)) code = genCode()

    const player: Player = { id:playerId, guestId, displayName:name.trim(), isHost:true, isEliminated:false, hasRevealed:false, imposterHistory:0 }
    const room: Room = {
      code, hostId:playerId, status:"waiting",
      settings:{ category, timerSeconds:timer, rounds, maxPlayers:10 },
      players:[player], usedWords:[], lastUpdated:Date.now(),
    }

    roomDB.set(code, room)
    statsDB.patch({ gamesHosted: statsDB.get().gamesHosted + 1 })

    onEnter(code, playerId)
    setLoading(false)
    onNavigate("lobby")
  }

  const StepHeader = ({ n }: { n: number }) => (
    <div className="mb-10">
      <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-3">Step {n} of 3</p>
      <div className="h-0.5 bg-border mb-8"><motion.div className="h-full bg-accent" animate={{ width:`${(n/3)*100}%` }} transition={{ duration:0.3 }}/></div>
    </div>
  )

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }}
      className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif]">
      <div className="bg-white border-b border-black/8">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={() => step===1 ? onNavigate("landing") : setStep(s=>s-1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← {step===1?"Home":"Back"}
          </button>
          <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">CREATE ROOM</span>
          <span className="text-xs text-muted-foreground font-mono">{step}/3</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-14">
        <AnimatePresence mode="wait">
          {step===1 && (
            <motion.div key="s1" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={{ duration:0.22 }}>
              <StepHeader n={1}/>
              <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-10">Choose Game</h2>
              <motion.div whileHover={{ y:-2 }} transition={{ duration:0.15 }} onClick={() => setStep(2)}
                className="bg-white border-2 border-foreground p-7 cursor-pointer mb-4">
                <div className="flex items-start justify-between mb-4">
                  <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-accent text-white">Available</span>
                  <div className="w-7 h-7 bg-foreground flex items-center justify-center"><Check size={14} className="text-white"/></div>
                </div>
                <h3 className="font-['Geist',_sans-serif] font-black text-2xl mb-3 tracking-tight">Find The Imposter</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">One player secretly has no word. They must blend in and avoid getting voted out.</p>
                <div className="flex gap-5 text-[11px] font-semibold tracking-widest uppercase text-muted-foreground"><span>3–10 players</span><span>Social deduction</span></div>
              </motion.div>
              {["Mafia","Undercover","Spy"].map(g => (
                <div key={g} className="bg-white border border-dashed border-black/15 p-6 mb-3 opacity-40">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground border border-border px-2 py-0.5">Soon</span>
                  <h3 className="font-['Geist',_sans-serif] font-black text-xl mt-4 tracking-tight">{g}</h3>
                </div>
              ))}
            </motion.div>
          )}

          {step===2 && (
            <motion.div key="s2" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={{ duration:0.22 }}>
              <StepHeader n={2}/>
              <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-2">Your Name</h2>
              <p className="text-muted-foreground text-sm mb-10">This is visible to all players in the room.</p>
              <div className="bg-white border border-black/8 p-7 mb-6">
                <Field label="Display Name" value={name} onChange={e => { setName(e.target.value); setNameErr("") }}
                  onKeyDown={e => { if (e.key==="Enter" && validateName()) setStep(3) }}
                  placeholder="How should others call you?" maxLength={20} autoFocus error={nameErr} hint={`${name.trim().length}/20 characters`}/>
              </div>
              <Btn variant="accent" size="lg" onClick={() => { if (validateName()) setStep(3) }} disabled={!name.trim()} className="font-bold">
                Continue <ChevronRight size={16}/>
              </Btn>
            </motion.div>
          )}

          {step===3 && (
            <motion.div key="s3" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={{ duration:0.22 }}>
              <StepHeader n={3}/>
              <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-10">Configure</h2>
              <div className="space-y-5">
                {[
                  { lbl:"Category", opts:CATEGORIES.map(c=>({label:c,value:c as string|null})), val:category as string|null, set:(v:string|null)=>setCategory(v as Category) },
                ].map(({lbl,opts,val,set}) => (
                  <div key={lbl} className="bg-white border border-black/8 p-6">
                    <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-4">{lbl}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {opts.map(o => (
                        <button key={String(o.value)} onClick={() => set(o.value)}
                          className={cn("p-3 text-sm font-semibold border text-left transition-all duration-150",
                            val===o.value?"border-foreground bg-foreground text-white":"border-black/10 bg-white hover:border-foreground")}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="bg-white border border-black/8 p-6">
                  <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-4">Timer per Turn</p>
                  <div className="grid grid-cols-4 gap-2">
                    {TIMER_OPTIONS.map(o => (
                      <button key={String(o.value)} onClick={() => setTimer(o.value)}
                        className={cn("p-3 text-sm font-semibold border text-center transition-all duration-150",
                          timer===o.value?"border-foreground bg-foreground text-white":"border-black/10 bg-white hover:border-foreground")}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-black/8 p-6">
                  <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-4">Rounds</p>
                  <div className="grid grid-cols-4 gap-2">
                    {ROUND_OPTIONS.map(o => (
                      <button key={String(o.value)} onClick={() => setRounds(o.value)}
                        className={cn("p-3 text-sm font-semibold border text-center transition-all duration-150",
                          rounds===o.value?"border-foreground bg-foreground text-white":"border-black/10 bg-white hover:border-foreground")}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-8">
                <Btn variant="accent" size="lg" onClick={createRoom} loading={loading} className="font-bold">
                  Create Room <ArrowRight size={17}/>
                </Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── JOIN VIEW ────────────────────────────────────────────────────────────────

const JoinView = ({ onNavigate, onEnter, prefillCode }: {
  onNavigate: (v: View) => void
  onEnter: (code: string, playerId: string) => void
  prefillCode?: string
}) => {
  const [code, setCode] = useState(prefillCode || "")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const join = async () => {
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g,"")
    if (clean.length !== 6) { setError("Enter a 6-character room code"); return }
    if (name.trim().length < 2) { setError("Name must be at least 2 characters"); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 250))

    const room = await roomDB.get(clean) as Room | null
    if (!room) { setError("Room not found. Double-check the code."); setLoading(false); return }
    if (room.status !== "waiting") { setError("This game has already started."); setLoading(false); return }
    if (room.players.length >= room.settings.maxPlayers) { setError("Room is full."); setLoading(false); return }

    const guestId  = getGuestId()
    const existing = room.players.find(p => p.guestId === guestId)
    if (existing) { onEnter(room.code, existing.id); onNavigate("lobby"); return }

    const playerId = genId()
    const updated: Room = { ...room, players:[...room.players, { id:playerId, guestId, displayName:name.trim(), isHost:false, isEliminated:false, hasRevealed:false, imposterHistory:0 }] }
    roomDB.set(updated.code, updated)
    setLoading(false)
    onEnter(updated.code, playerId)
    onNavigate("lobby")
  }

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }}
      className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif] flex flex-col">
      <div className="bg-white border-b border-black/8">
        <div className="max-w-lg mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={() => onNavigate("landing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Home</button>
          <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">JOIN ROOM</span>
          <div/>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ duration:0.3 }} className="w-full max-w-md">
          <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-2">Enter Code</h2>
          <p className="text-muted-foreground text-sm mb-10">Get the 6-letter code from the room host.</p>
          <div className="bg-white border border-black/8 p-7 mb-4 space-y-5">
            <div>
              <label className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground block mb-2">Room Code</label>
              <input
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6)); setError("") }}
                onKeyDown={e => { if (e.key==="Enter") join() }}
                placeholder="KUP97B"
                maxLength={6}
                autoFocus
                className="w-full px-5 py-5 bg-[#F8F8F8] border border-black/8 focus:border-foreground focus:outline-none font-['Geist',_sans-serif] font-black text-3xl tracking-[0.35em] text-center placeholder:text-muted-foreground placeholder:font-normal placeholder:text-base placeholder:tracking-normal transition-colors uppercase"
              />
            </div>
            <Field label="Your Name" value={name} onChange={e => { setName(e.target.value); setError("") }}
              onKeyDown={e => { if (e.key==="Enter") join() }} placeholder="Enter your name…" maxLength={20}/>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive mb-5 p-4 bg-white border border-destructive/20">
              <AlertCircle size={14} className="flex-shrink-0"/> {error}
            </div>
          )}
          <Btn variant="accent" size="lg" onClick={join} loading={loading}
            disabled={code.replace(/[^A-Z0-9]/g,"").length!==6 || name.trim().length<2} className="w-full font-bold">
            Join Room <ArrowRight size={17}/>
          </Btn>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── LOBBY VIEW ───────────────────────────────────────────────────────────────

const LobbyView = ({ roomCode, myPlayerId, onNavigate }: {
  roomCode: string
  myPlayerId: string
  onNavigate: (v: View) => void
}) => {
  const { room, updateRoom } = useRoom(roomCode)

  useEffect(() => {
    if (room?.status==="playing" && room?.session?.phase==="role-reveal") onNavigate("role-reveal")
  }, [room?.status, room?.session?.phase])

  if (!room) return <Spinner label="Connecting to room…"/>

  const me      = room.players.find(p => p.id===myPlayerId)
  const isHost  = me?.isHost ?? false
  const canStart = room.players.length >= 3

  // Build a clean, absolute join URL regardless of iframe context
  const baseUrl  = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}${window.location.pathname}`
    : "https://playgioco.app"
  const joinUrl  = `${baseUrl}?join=${room.code}`

  const doShare = async () => {
    try { await navigator.share({ title:"PlayGioco — Join my game!", text:`Room code: ${room.code}`, url:joinUrl }) }
    catch { doCopy(joinUrl); toast.success("Link copied!") }
  }

  const startGame = () => {
    if (!canStart) return
    const word = pickWord(room.settings.category, room.usedWords)
    const withRoles = assignRoles(room.players)
    const imposter  = withRoles.find(p => p.role==="imposter")!
    const session: GameSession = {
      word, category:room.settings.category, imposterId:imposter.id,
      roundNumber:1, phase:"role-reveal",
      speakingOrder:buildOrder(withRoles, imposter.id),
      currentSpeakerIndex:0, messages:[], votes:{}, continueVotes:{}, revealProgress:0,
    }
    updateRoom(r => ({ ...r, status:"playing", players:withRoles, session, usedWords:[...r.usedWords, word] }))
    onNavigate("role-reveal")
  }

  const kickPlayer = (id: string) => {
    if (!isHost) return
    updateRoom(r => ({ ...r, players:r.players.filter(p => p.id!==id) }))
  }

  const endRoom = () => {
    roomDB.delete(room.code)
    onNavigate("landing")
  }

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }}
      className="min-h-screen font-['Inter',_sans-serif] bg-[#F8F8F8]">
      {/* Nav */}
      <header className="bg-white border-b border-black/8 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <button onClick={() => onNavigate("landing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <Home size={14}/> Home
          </button>
          <div className="flex items-center gap-3">
            <ConnectionBadge/>
            <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">PLAYGIOCO</span>
          </div>
          <button onClick={() => onNavigate("stats")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            <BarChart2 size={14}/>
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-8 space-y-5">

        {/* ── HERO INVITE — the most important section ── */}
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ duration:0.3 }}
          className="bg-foreground text-white">
          <div className="flex flex-col lg:flex-row">
            {/* Left: code + inputs */}
            <div className="flex-1 p-7 lg:p-10">
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/35 mb-5">
                Share to Invite Players
              </p>

              {/* THE CODE — enormous */}
              <div className="font-['Geist',_sans-serif] font-black tracking-[0.22em] text-white mb-3"
                style={{ fontSize:"clamp(48px,10vw,80px)", lineHeight:1 }}>
                {room.code}
              </div>
              <p className="text-xs text-white/30 mb-7">
                Players open <span className="text-white/55 font-mono">playgioco.app</span> → Join → enter this code
              </p>

              {/* Copy fields */}
              <div className="space-y-2.5 mb-5">
                <div>
                  <p className="text-[10px] tracking-widest uppercase text-white/30 mb-1.5">Room Code</p>
                  <CopyInput value={room.code} label="Room code" dark/>
                </div>
                <div>
                  <p className="text-[10px] tracking-widest uppercase text-white/30 mb-1.5">Join Link</p>
                  <CopyInput value={joinUrl} label="Join link" dark/>
                </div>
              </div>

              {/* Share button */}
              <button onClick={doShare}
                className="flex items-center gap-2 text-sm font-semibold text-white/45 hover:text-white border border-white/15 hover:border-white/35 px-4 py-2.5 transition-all">
                <Share2 size={15}/> Share via…
              </button>
            </div>

            {/* Right: QR */}
            <div className="border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col items-center justify-center p-8 lg:w-56 gap-3">
              <QRBlock value={joinUrl} size={140}/>
              <p className="text-[10px] tracking-widest uppercase text-white/25">Scan to Join</p>
            </div>
          </div>
        </motion.div>

        {/* ── PLAYERS + SETTINGS ── */}
        <div className="grid lg:grid-cols-[1fr_280px] gap-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-['Geist',_sans-serif] font-black text-xl tracking-tight">
                Players <span className="text-muted-foreground font-normal text-base ml-1">{room.players.length}/10</span>
              </h2>
              {room.players.length < 3 && (
                <span className="text-[11px] text-accent font-semibold">Need {3-room.players.length} more</span>
              )}
            </div>

            <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-2 mb-5">
              {room.players.map(p => (
                <motion.div key={p.id} variants={fadeUp}
                  className={cn("bg-white border flex items-center justify-between p-4 transition-all",
                    p.id===myPlayerId?"border-foreground":"border-black/8 hover:border-black/20")}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 flex items-center justify-center text-[11px] font-bold tracking-wide flex-shrink-0",
                      p.id===myPlayerId?"bg-foreground text-white":"bg-[#F0F0F0] text-foreground")}>
                      {p.displayName.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{p.displayName}</span>
                        {p.id===myPlayerId && <span className="text-[10px] tracking-widest uppercase text-muted-foreground">you</span>}
                      </div>
                      {p.isHost && (
                        <div className="flex items-center gap-1"><Crown size={9} className="text-accent"/>
                          <span className="text-[10px] tracking-widest uppercase text-accent font-semibold">Host</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {isHost && !p.isHost && (
                    <button onClick={() => kickPlayer(p.id)} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all">
                      <X size={13}/>
                    </button>
                  )}
                </motion.div>
              ))}
              {/* Empty placeholder slots */}
              {Array.from({ length:Math.max(0, 3-room.players.length) }).map((_,i) => (
                <div key={i} className="border border-dashed border-black/10 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 border border-dashed border-black/15 flex items-center justify-center text-muted-foreground text-lg">+</div>
                  <span className="text-sm text-muted-foreground">Waiting for player…</span>
                </div>
              ))}
            </motion.div>

            {/* CTA */}
            {isHost ? (
              <div className="flex gap-3 flex-wrap">
                <Btn variant="accent" size="lg" onClick={startGame} disabled={!canStart} className="font-bold">
                  <Play size={17}/> Start Game
                </Btn>
                <Btn variant="ghost" size="lg" onClick={endRoom} className="font-semibold text-muted-foreground">
                  <X size={15}/> End Room
                </Btn>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-4 px-5 bg-white border border-black/8">
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse flex-shrink-0"/>
                <span className="text-sm text-muted-foreground">Waiting for the host to start…</span>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            <div className="bg-white border border-black/8 p-5">
              <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-4">Room Settings</p>
              <div className="space-y-3">
                {[
                  ["Game","Find The Imposter"],
                  ["Category",room.settings.category],
                  ["Timer",room.settings.timerSeconds?`${room.settings.timerSeconds}s / turn`:"No timer"],
                  ["Rounds",room.settings.rounds?String(room.settings.rounds):"Unlimited"],
                ].map(([k,v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="text-[11px] tracking-widest uppercase text-muted-foreground">{k}</span>
                    <span className="text-sm font-semibold">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border border-black/8 p-5">
              <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-4">How to Play</p>
              <ol className="space-y-3">
                {["Pass device — each player reveals their role privately.",
                  "Give one-word clues about the word without being obvious.",
                  "Vote to eliminate the person you think is the imposter.",
                  "Innocents win if the imposter is found; imposter wins otherwise.",
                ].map((s,i) => (
                  <li key={i} className="flex gap-3 text-xs text-muted-foreground leading-relaxed">
                    <span className="font-['Geist',_sans-serif] font-black text-[11px] text-foreground flex-shrink-0 w-3">{i+1}</span>{s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── ROLE REVEAL VIEW ─────────────────────────────────────────────────────────

const RoleRevealView = ({ roomCode, myPlayerId, onNavigate }: {
  roomCode: string; myPlayerId: string; onNavigate: (v: View) => void
}) => {
  const { room, updateRoom } = useRoom(roomCode)
  const [showing, setShowing] = useState(false)

  useEffect(() => { if (room?.session?.phase==="clue") onNavigate("game") }, [room?.session?.phase])

  if (!room?.session) return <Spinner/>
  const { session } = room
  const progress = session.revealProgress
  const players  = room.players
  const current  = players[progress]
  const isMyTurn = current?.id === myPlayerId
  const me       = players.find(p => p.id===myPlayerId)

  if (progress >= players.length) {
    return (
      <motion.div variants={fadeIn} initial="initial" animate="animate"
        className="min-h-screen bg-foreground text-white flex items-center justify-center font-['Inter',_sans-serif]">
        <div className="text-center px-6">
          <p className="text-[11px] tracking-[0.22em] uppercase text-white/30 mb-4">Everyone is Ready</p>
          <h2 className="font-['Geist',_sans-serif] font-black text-6xl tracking-tight mb-10">Begin.</h2>
          {me?.isHost ? (
            <Btn variant="accent" size="lg" className="font-bold"
              onClick={() => { updateRoom(r => ({ ...r, session:r.session?{...r.session,phase:"clue"}:r.session })); onNavigate("game") }}>
              <Play size={17}/> Start Clue Phase
            </Btn>
          ) : (
            <div className="flex items-center gap-2 text-sm text-white/30">
              <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Waiting for host…
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  const advance = () => {
    setShowing(false)
    const next = progress + 1
    const done = next >= players.length
    updateRoom(r => ({ ...r, session:r.session?{...r.session, revealProgress:next, ...(done?{phase:"clue"}:{})}:r.session }))
    if (done) onNavigate("game")
  }

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" className="min-h-screen font-['Inter',_sans-serif]">
      <AnimatePresence mode="wait">
        {(!isMyTurn || !showing) ? (
          <motion.div key="pass" variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="min-h-screen bg-[#F8F8F8] flex flex-col items-center justify-center px-8 text-center">
            <motion.div initial={{ opacity:0,y:20 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.3 }}>
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-6">Player {progress+1} of {players.length}</p>
              <div className="w-px h-16 bg-border mx-auto mb-6"/>
              <p className="text-muted-foreground text-base mb-3">Hand the device to</p>
              <h2 className="font-['Geist',_sans-serif] font-black tracking-tight leading-none mb-12" style={{ fontSize:"clamp(48px,10vw,90px)" }}>
                {current?.displayName}
              </h2>
              {isMyTurn ? (
                <Btn variant="accent" size="lg" onClick={() => setShowing(true)} className="font-bold"><Eye size={17}/> Reveal My Role</Btn>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Waiting for {current?.displayName}…
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : me?.role==="imposter" ? (
          <motion.div key="imp" variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="min-h-screen bg-foreground text-white flex flex-col items-center justify-center px-8 text-center">
            <motion.div initial={{ scale:0.85,opacity:0 }} animate={{ scale:1,opacity:1 }} transition={{ type:"spring",stiffness:280,damping:22 }}>
              <p className="text-[11px] tracking-[0.22em] uppercase text-white/25 mb-10">Your Role</p>
              <div className="font-['Geist',_sans-serif] font-black text-accent text-2xl tracking-[0.12em] mb-4">YOU ARE THE</div>
              <div className="font-['Geist',_sans-serif] font-black leading-none tracking-tight mb-8" style={{ fontSize:"clamp(64px,13vw,110px)" }}>IMPOSTER</div>
              <div className="w-16 h-px bg-white/10 mx-auto mb-8"/>
              <p className="text-white/40 text-sm leading-relaxed max-w-xs mb-3">
                You have no word. Listen to the clues. Blend in. Don't get voted out.
              </p>
              <p className="text-xs text-white/20 mb-12">Category: <span className="text-white/40">{session.category}</span></p>
              <Btn variant="white" size="lg" onClick={advance} className="font-bold text-foreground"><Check size={17}/> Got it — Pass Device</Btn>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="inn" variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
            <motion.div initial={{ scale:0.85,opacity:0 }} animate={{ scale:1,opacity:1 }} transition={{ type:"spring",stiffness:280,damping:22 }}>
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-10">Your Role</p>
              <div className="font-['Geist',_sans-serif] font-black text-muted-foreground text-2xl tracking-[0.12em] mb-4">YOU ARE</div>
              <div className="font-['Geist',_sans-serif] font-black leading-none tracking-tight mb-8" style={{ fontSize:"clamp(56px,11vw,90px)" }}>INNOCENT</div>
              <div className="border-2 border-foreground p-8 mb-8 inline-block min-w-[240px]">
                <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">The Secret Word</p>
                <div className="font-['Geist',_sans-serif] font-black tracking-tight" style={{ fontSize:"clamp(32px,6vw,52px)" }}>{session.word}</div>
              </div>
              <p className="text-muted-foreground text-sm max-w-xs mb-12 leading-relaxed">
                Give clues that hint at this word — but don't make it obvious. The imposter is listening.
              </p>
              <Btn variant="primary" size="lg" onClick={advance} className="font-bold"><Check size={17}/> Got it — Pass Device</Btn>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── GAME VIEW — Clue Phase ────────────────────────────────────────────────────

const GameView = ({ roomCode, myPlayerId, onNavigate }: {
  roomCode: string; myPlayerId: string; onNavigate: (v: View) => void
}) => {
  const { room, updateRoom } = useRoom(roomCode)
  const [clue, setClue]     = useState("")
  const [timeLeft, setTimeLeft] = useState<number|null>(null)
  const [showDecision, setShowDecision] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  const session   = room?.session
  const me        = room?.players.find(p => p.id===myPlayerId)
  const curSpeakerId = session?.speakingOrder[session.currentSpeakerIndex ?? 0]
  const isMyTurn  = curSpeakerId === myPlayerId
  const curSpeaker = room?.players.find(p => p.id===curSpeakerId)

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [session?.messages.length])

  useEffect(() => {
    if (!session || !room?.settings.timerSeconds || !isMyTurn) { setTimeLeft(null); return }
    setTimeLeft(room.settings.timerSeconds)
    const t = setInterval(() => setTimeLeft(v => { if (!v||v<=1){ clearInterval(t); handleSkip(); return null } return v-1 }), 1000)
    return () => clearInterval(t)
  }, [session?.currentSpeakerIndex, isMyTurn])

  useEffect(() => {
    if (!session) return
    if (session.phase==="decision") setShowDecision(true)
    if (session.phase==="vote")    onNavigate("vote")
    if (session.phase==="results") onNavigate("results")
  }, [session?.phase])

  if (!room || !session) return <Spinner/>

  const advanceTurn = (extra?: Message) => {
    const nextIdx   = session.currentSpeakerIndex + 1
    const roundDone = nextIdx >= session.speakingOrder.length
    updateRoom(r => ({
      ...r,
      session: r.session ? {
        ...r.session,
        messages: extra ? [...r.session.messages, extra] : r.session.messages,
        currentSpeakerIndex: roundDone ? 0 : nextIdx,
        phase: roundDone ? "decision" : "clue",
        continueVotes: roundDone ? {} : r.session.continueVotes,
      } : r.session,
    }))
    if (roundDone) setShowDecision(true)
  }

  const submitClue = () => {
    if (!clue.trim() || !isMyTurn) return
    const msg: Message = { id:genId(), playerId:myPlayerId, playerName:me?.displayName??"", content:clue.trim(), type:"clue", timestamp:Date.now() }
    // add message then advance
    const nextIdx   = session.currentSpeakerIndex + 1
    const roundDone = nextIdx >= session.speakingOrder.length
    updateRoom(r => ({
      ...r,
      session: r.session ? {
        ...r.session,
        messages: [...r.session.messages, msg],
        currentSpeakerIndex: roundDone ? 0 : nextIdx,
        phase: roundDone ? "decision" : "clue",
        continueVotes: roundDone ? {} : r.session.continueVotes,
      } : r.session,
    }))
    setClue("")
    if (roundDone) setShowDecision(true)
  }

  const handleSkip = () => {
    if (!isMyTurn) return
    const sys: Message = { id:genId(), playerId:"system", playerName:"System", content:`${me?.displayName??"Someone"} skipped their turn.`, type:"system", timestamp:Date.now() }
    advanceTurn(sys)
  }

  const voteDecision = (wantVote: boolean) => {
    const alive = room.players.filter(p => !p.isEliminated).length
    const updated = { ...session.continueVotes, [myPlayerId]: !wantVote }
    const total   = Object.keys(updated).length
    const contCt  = Object.values(updated).filter(Boolean).length
    const newPhase: GameSession["phase"] = total >= alive ? (contCt > total-contCt ? "clue" : "vote") : "decision"
    const newOrder = newPhase==="clue" ? buildOrder(room.players, session.imposterId) : session.speakingOrder
    updateRoom(r => ({ ...r, session:r.session?{...r.session, continueVotes:updated, phase:newPhase, speakingOrder:newPhase==="clue"?newOrder:r.session.speakingOrder, currentSpeakerIndex:0}:r.session }))
    if (newPhase==="vote")  { setShowDecision(false); onNavigate("vote") }
    if (newPhase==="clue")  setShowDecision(false)
  }

  const timerPct = timeLeft!==null && room.settings.timerSeconds ? (timeLeft/room.settings.timerSeconds)*100 : null
  const aliveOrder = session.speakingOrder.map(id => room.players.find(p => p.id===id)).filter(Boolean)

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }}
      className="min-h-screen flex flex-col font-['Inter',_sans-serif] bg-[#F8F8F8]">
      <header className="bg-white border-b border-black/8 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn("px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase",
              me?.role==="imposter"?"bg-foreground text-accent":"bg-foreground text-white")}>
              {me?.role==="imposter"?"IMPOSTER":"INNOCENT"}
            </span>
            {me?.role==="innocent" && <span className="text-xs text-muted-foreground hidden sm:block">Word: <strong className="text-foreground">{session.word}</strong></span>}
          </div>
          <span className="text-xs text-muted-foreground font-mono">Round {session.roundNumber}</span>
        </div>
      </header>
      {me?.role==="innocent" && (
        <div className="sm:hidden bg-foreground text-white text-center py-2 text-sm">
          <span className="text-white/40 text-[11px] uppercase tracking-widest">Word: </span>
          <span className="font-bold">{session.word}</span>
        </div>
      )}
      {/* Speaking order */}
      <div className="bg-white border-b border-black/8 flex-shrink-0 overflow-x-auto">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center gap-1.5 min-w-max">
          {aliveOrder.map((p,i) => (
            <div key={p!.id} className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border flex-shrink-0 transition-all",
              i===session.currentSpeakerIndex?"bg-foreground text-white border-foreground":i<session.currentSpeakerIndex?"text-muted-foreground border-black/8 line-through":"text-foreground border-black/8")}>
              <span className="text-[10px] opacity-50">{i+1}</span>
              {p!.displayName}{p!.id===myPlayerId?" ·you":""}
            </div>
          ))}
        </div>
      </div>
      {timerPct!==null && (
        <div className="h-0.5 bg-secondary flex-shrink-0">
          <motion.div className={cn("h-full",timerPct<30?"bg-destructive":"bg-accent")} style={{ width:`${timerPct}%` }}/>
        </div>
      )}
      {/* Chat */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
        <div className="space-y-3 py-2">
          {session.messages.length===0 && (
            <div className="text-center py-16">
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-2">Clue Phase</p>
              <p className="text-sm text-muted-foreground">{isMyTurn?"You go first — give your clue.":`Waiting for ${curSpeaker?.displayName} to speak…`}</p>
            </div>
          )}
          {session.messages.map(msg => (
            <motion.div key={msg.id} variants={fadeUp} initial="initial" animate="animate"
              className={cn("flex",msg.type==="system"?"justify-center":msg.playerId===myPlayerId?"justify-end":"justify-start")}>
              {msg.type==="system" ? (
                <span className="text-[11px] text-muted-foreground py-1">{msg.content}</span>
              ) : (
                <div className={cn("max-w-[78%] flex flex-col gap-1",msg.playerId===myPlayerId?"items-end":"items-start")}>
                  <span className="text-[10px] text-muted-foreground px-1">{msg.playerName}</span>
                  <div className={cn("px-4 py-3 text-sm leading-relaxed",msg.playerId===myPlayerId?"bg-foreground text-white":"bg-white border border-black/8 text-foreground")}>
                    {msg.content}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
      {!isMyTurn && session.phase==="clue" && (
        <div className="border-t border-black/8 bg-white px-5 py-3 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>
            Waiting for <strong className="text-foreground ml-1">{curSpeaker?.displayName}</strong>…
          </div>
        </div>
      )}
      {isMyTurn && session.phase==="clue" && (
        <div className="border-t border-black/8 bg-white flex-shrink-0">
          <div className="max-w-4xl mx-auto px-4 py-3 flex gap-2 items-center">
            {timeLeft!==null && (
              <div className={cn("font-['Geist',_sans-serif] font-black text-xl w-8 text-center flex-shrink-0",timeLeft<10?"text-destructive":"text-foreground")}>{timeLeft}</div>
            )}
            <input value={clue} onChange={e => setClue(e.target.value.slice(0,60))}
              onKeyDown={e => { if (e.key==="Enter") submitClue() }}
              placeholder="Your clue…" autoFocus
              className="flex-1 px-4 py-3 bg-[#F8F8F8] border border-black/8 text-sm focus:outline-none focus:border-foreground transition-colors"/>
            <Btn variant="primary" size="md" onClick={submitClue} disabled={!clue.trim()}><Send size={15}/></Btn>
          </div>
        </div>
      )}
      {/* Decision modal */}
      <AnimatePresence>
        {showDecision && session.phase==="decision" && (
          <motion.div variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
            <motion.div initial={{ y:40,opacity:0 }} animate={{ y:0,opacity:1 }} exit={{ y:20,opacity:0 }}
              transition={{ type:"spring",stiffness:400,damping:32 }}
              className="bg-white w-full max-w-sm p-8">
              <h3 className="font-['Geist',_sans-serif] font-black text-2xl tracking-tight mb-2">Vote Now?</h3>
              <p className="text-sm text-muted-foreground mb-5 leading-relaxed">All clues given. Continue another round or vote to eliminate?</p>
              <div className="text-[11px] tracking-widest uppercase text-muted-foreground mb-6">
                {Object.keys(session.continueVotes).length} / {room.players.filter(p=>!p.isEliminated).length} responded
              </div>
              {session.continueVotes[myPlayerId]===undefined ? (
                <div className="grid grid-cols-2 gap-3">
                  <Btn variant="outline" size="lg" onClick={() => voteDecision(false)} className="font-bold">Continue</Btn>
                  <Btn variant="accent"  size="lg" onClick={() => voteDecision(true)}  className="font-bold">Vote</Btn>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-2">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Waiting for others…
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── VOTE VIEW ────────────────────────────────────────────────────────────────

const VoteView = ({ roomCode, myPlayerId, onNavigate }: {
  roomCode: string; myPlayerId: string; onNavigate: (v: View) => void
}) => {
  const { room, updateRoom } = useRoom(roomCode)
  const [selected, setSelected] = useState<string|null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [timeLeft, setTimeLeft]   = useState(30)

  useEffect(() => {
    if (timeLeft<=0) return
    const t = setInterval(() => setTimeLeft(s => Math.max(0,s-1)),1000)
    return () => clearInterval(t)
  },[])
  useEffect(() => { if (room?.session?.phase==="results") onNavigate("results") },[room?.session?.phase])

  if (!room?.session) return <Spinner/>
  const session = room.session
  const alive   = room.players.filter(p => !p.isEliminated)

  const submitVote = () => {
    if (!selected || submitted) return
    setSubmitted(true)
    const updatedVotes = { ...session.votes, [myPlayerId]:selected }
    const allVoted = Object.keys(updatedVotes).length >= alive.length

    if (allVoted || timeLeft<=0) {
      // Tally
      const tally: Record<string,number> = {}
      Object.values(updatedVotes).forEach(id => { tally[id]=(tally[id]??0)+1 })
      const max  = Math.max(...Object.values(tally))
      const tops = Object.keys(tally).filter(id => tally[id]===max)
      const eliminatedId   = tops[Math.floor(Math.random()*tops.length)]
      const eliminated     = room.players.find(p => p.id===eliminatedId)
      const imposter       = room.players.find(p => p.id===session.imposterId)
      const result: GameSession["result"] = {
        winner: eliminatedId===session.imposterId?"innocents":"imposter",
        eliminatedPlayerId:eliminatedId,
        eliminatedPlayerName:eliminated?.displayName??"Unknown",
        imposterName:imposter?.displayName??"Unknown",
        word:session.word, roundsPlayed:session.roundNumber,
      }
      updateRoom(r => ({
        ...r,
        session: r.session?{...r.session,votes:updatedVotes,phase:"results",result}:r.session,
        players: r.players.map(p => p.id===eliminatedId?{...p,isEliminated:true}:p),
      }))
      const myIsImp = myPlayerId===session.imposterId
      const iWon    = (result.winner==="innocents"&&!myIsImp)||(result.winner==="imposter"&&myIsImp)
      const s = statsDB.get()
      statsDB.patch({
        gamesPlayed:s.gamesPlayed+1, gamesWon:s.gamesWon+(iWon?1:0),
        imposterWins:s.imposterWins+(myIsImp&&result.winner==="imposter"?1:0),
        detectiveWins:s.detectiveWins+(!myIsImp&&result.winner==="innocents"?1:0),
        roundsPlayed:s.roundsPlayed+(result.roundsPlayed??0),
      })
      onNavigate("results")
    } else {
      updateRoom(r => ({ ...r, session:r.session?{...r.session,votes:updatedVotes}:r.session }))
    }
  }

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }}
      className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif]">
      <header className="bg-white border-b border-black/8">
        <div className="max-w-lg mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">VOTE</span>
          <div className={cn("font-['Geist',_sans-serif] font-black text-2xl tabular-nums",timeLeft<10?"text-destructive":"text-foreground")}>{timeLeft}</div>
        </div>
      </header>
      <div className="h-0.5 bg-secondary"><motion.div className="h-full bg-accent" animate={{ width:`${(timeLeft/30)*100}%` }}/></div>
      <div className="max-w-lg mx-auto px-6 py-12">
        <motion.div variants={stagger} initial="initial" animate="animate">
          <motion.div variants={fadeUp}>
            <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">Secret Vote</p>
            <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-3">Who did it?</h2>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">Select the player you think is the imposter. You cannot vote for yourself.</p>
          </motion.div>
          <motion.div variants={stagger} className="space-y-2 mb-8">
            {alive.filter(p => p.id!==myPlayerId).map(p => (
              <motion.button key={p.id} variants={fadeUp} disabled={submitted} onClick={() => setSelected(p.id)}
                className={cn("w-full p-5 border flex items-center justify-between text-left transition-all duration-150",
                  selected===p.id?"border-foreground bg-foreground text-white":"border-black/8 bg-white hover:border-foreground")}>
                <div className="flex items-center gap-4">
                  <div className={cn("w-9 h-9 flex items-center justify-center text-xs font-bold",
                    selected===p.id?"bg-white text-foreground":"bg-[#F8F8F8] text-foreground")}>
                    {p.displayName.slice(0,2).toUpperCase()}
                  </div>
                  <span className="font-semibold">{p.displayName}</span>
                </div>
                {selected===p.id && <Check size={16}/>}
              </motion.button>
            ))}
          </motion.div>
          {!submitted ? (
            <Btn variant="accent" size="lg" onClick={submitVote} disabled={!selected} className="w-full font-bold">Submit Vote</Btn>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-5 border border-dashed border-black/15 bg-white">
              <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Vote submitted. Waiting for others…
            </div>
          )}
          <p className="text-[11px] text-muted-foreground text-center mt-4 tracking-widest uppercase">
            {Object.keys(session.votes).length} / {alive.length} voted
          </p>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── RESULTS VIEW ─────────────────────────────────────────────────────────────

const ResultsView = ({ roomCode, myPlayerId, onNavigate }: {
  roomCode: string; myPlayerId: string; onNavigate: (v: View) => void
}) => {
  const { room, updateRoom } = useRoom(roomCode)

  if (!room?.session?.result) return <Spinner/>
  const result    = room.session.result
  const myIsImp   = myPlayerId===room.session.imposterId
  const iWon      = (result.winner==="innocents"&&!myIsImp)||(result.winner==="imposter"&&myIsImp)
  const tally: Record<string,number> = {}
  Object.values(room.session.votes).forEach(id => { tally[id]=(tally[id]??0)+1 })

  const playAgain = () => {
    updateRoom(r => ({ ...r, status:"waiting", session:undefined }))
    onNavigate("lobby")
  }

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.25 }}
      className="min-h-screen font-['Inter',_sans-serif]">
      <div className="min-h-screen grid lg:grid-cols-[1fr_1fr]">
        {/* Left — result */}
        <div className={cn("flex flex-col justify-center px-10 py-20 lg:py-24",
          result.winner==="innocents"?"bg-foreground text-white":"bg-accent text-white")}>
          <motion.div variants={stagger} initial="initial" animate="animate">
            <motion.p variants={fadeUp} className={cn("text-[11px] tracking-[0.22em] uppercase mb-8",
              result.winner==="innocents"?"text-white/25":"text-white/60")}>Game Over</motion.p>
            <motion.h1 variants={fadeUp} className="font-['Geist',_sans-serif] font-black leading-[0.88] tracking-tighter mb-8"
              style={{ fontSize:"clamp(52px,9vw,90px)" }}>
              {result.winner==="innocents"?"INNOCENTS\nWIN":"IMPOSTER\nWINS"}
            </motion.h1>
            <motion.div variants={fadeUp} className="w-12 h-px bg-white/15 mb-8"/>
            <motion.p variants={fadeUp} className="text-sm leading-relaxed mb-6 text-white/50">
              {result.winner==="innocents"
                ?`${result.imposterName} was the imposter. The innocents prevailed.`
                :`${result.eliminatedPlayerName} was eliminated — but they were innocent.`}
            </motion.p>
            <motion.div variants={fadeUp} className="font-['Geist',_sans-serif] font-black text-3xl mb-10">
              {iWon?"You won.":"You lost."}
            </motion.div>
            <motion.div variants={fadeUp} className="flex gap-3 flex-wrap">
              <Btn variant="white"  size="md" onClick={playAgain} className="font-bold text-foreground"><RotateCcw size={15}/> Play Again</Btn>
              <Btn size="md" onClick={() => onNavigate("landing")}
                className="border border-white/25 bg-transparent text-white hover:bg-white/10 font-bold">
                <Home size={15}/> Home
              </Btn>
            </motion.div>
          </motion.div>
        </div>
        {/* Right — details */}
        <div className="flex flex-col justify-center px-10 py-20 lg:py-24 bg-[#F8F8F8]">
          <motion.div variants={stagger} initial="initial" animate="animate" className="max-w-sm">
            <motion.div variants={fadeUp} className="mb-10">
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">The Secret Word</p>
              <div className="font-['Geist',_sans-serif] font-black tracking-tight border-b-2 border-foreground pb-4"
                style={{ fontSize:"clamp(40px,6vw,60px)" }}>{result.word}</div>
            </motion.div>
            <motion.div variants={fadeUp} className="mb-10">
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-2">The Imposter</p>
              <div className="font-['Geist',_sans-serif] font-black text-2xl text-accent tracking-tight">{result.imposterName}</div>
            </motion.div>
            <motion.div variants={fadeUp} className="mb-10">
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-4">Vote Summary</p>
              <div className="space-y-3">
                {room.players.map(p => {
                  const v = tally[p.id]??0, isElim = p.id===result.eliminatedPlayerId
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="w-28 text-sm font-medium truncate flex items-center gap-1.5">
                        {p.displayName}{isElim&&<span className="text-accent text-[10px] font-bold">✕</span>}
                      </div>
                      <div className="flex-1 bg-secondary h-1">
                        <motion.div className={cn("h-full",isElim?"bg-accent":"bg-foreground")}
                          initial={{ width:0 }} animate={{ width:`${(v/Math.max(1,room.players.length-1))*100}%` }}
                          transition={{ delay:0.4,duration:0.5 }}/>
                      </div>
                      <div className="text-sm text-muted-foreground w-4 text-right tabular-nums">{v}</div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
            <motion.div variants={fadeUp}>
              <Btn variant="primary" size="md" onClick={() => onNavigate("stats")} className="font-semibold">
                <BarChart2 size={15}/> View Stats
              </Btn>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── STATS VIEW ───────────────────────────────────────────────────────────────

const StatsView = ({ onNavigate }: { onNavigate: (v: View) => void }) => {
  const stats   = statsDB.get()
  const winRate = stats.gamesPlayed>0 ? Math.round((stats.gamesWon/stats.gamesPlayed)*100) : 0

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }}
      className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif]">
      <header className="bg-white border-b border-black/8">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={() => onNavigate("landing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
            <Home size={14}/> Home
          </button>
          <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">YOUR STATS</span>
          <div/>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-6 py-14">
        <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">Local Leaderboard</p>
        <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-12">Performance</h2>
        {stats.gamesPlayed===0 ? (
          <div className="text-center py-24">
            <div className="font-['Geist',_sans-serif] font-black text-[80px] text-secondary leading-none mb-4">0</div>
            <p className="text-muted-foreground text-sm mb-8">No games played yet.</p>
            <Btn variant="accent" size="lg" onClick={() => onNavigate("create")} className="font-bold">Create a Room <ArrowRight size={17}/></Btn>
          </div>
        ) : (
          <>
            <motion.div variants={stagger} initial="initial" animate="animate" className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
              {[
                {l:"Games Played",v:stats.gamesPlayed,acc:false},
                {l:"Games Won",   v:stats.gamesWon,   acc:false},
                {l:"Win Rate",    v:`${winRate}%`,    acc:true },
                {l:"Imposter Wins",v:stats.imposterWins,acc:false},
                {l:"Detective Wins",v:stats.detectiveWins,acc:false},
                {l:"Games Hosted",v:stats.gamesHosted,acc:false},
              ].map(({l,v,acc}) => (
                <motion.div key={l} variants={fadeUp} className={cn("p-5 border",acc?"bg-foreground text-white border-foreground":"bg-white border-black/8")}>
                  <div className={cn("font-['Geist',_sans-serif] font-black text-4xl mb-1 tracking-tight",acc?"text-accent":"text-foreground")}>{v}</div>
                  <div className={cn("text-[10px] tracking-widest uppercase font-semibold",acc?"text-white/40":"text-muted-foreground")}>{l}</div>
                </motion.div>
              ))}
            </motion.div>
            <div className="bg-white border border-black/8 p-6">
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-6">Win Breakdown</p>
              <div className="space-y-5">
                {[{l:"As Detective",v:stats.detectiveWins,c:"bg-foreground"},{l:"As Imposter",v:stats.imposterWins,c:"bg-accent"}].map(({l,v,c}) => (
                  <div key={l}>
                    <div className="flex justify-between text-sm mb-2 font-medium"><span>{l}</span><span className="text-muted-foreground tabular-nums">{v}</span></div>
                    <div className="h-1.5 bg-secondary">
                      <motion.div className={cn("h-full",c)} initial={{ width:0 }}
                        animate={{ width:`${stats.gamesPlayed>0?(v/stats.gamesPlayed)*100:0}%` }} transition={{ delay:0.2,duration:0.5 }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <Btn variant="accent" size="md" onClick={() => onNavigate("create")} className="font-bold">Play Again <ArrowRight size={15}/></Btn>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view,       setView]       = useState<View>("landing")
  const [roomCode,   setRoomCode]   = useState<string|null>(null)
  const [myPlayerId, setMyPlayerId] = useState<string|null>(null)
  const [prefillCode, setPrefillCode] = useState<string|undefined>()

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const join = p.get("join")
    if (join) {
      setPrefillCode(join.toUpperCase())
      setView("join")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  const navigate  = (v: View) => { setView(v); window.scrollTo({ top:0 }) }
  const enterRoom = (code: string, playerId: string) => { setRoomCode(code); setMyPlayerId(playerId) }

  return (
    <>
      <Toaster
        position="top-center"
        richColors={false}
        toastOptions={{
          style:{
            background:"#171717", color:"#F8F8F8",
            border:"none", borderRadius:"0",
            fontFamily:"Inter,sans-serif", fontSize:"13px",
          },
        }}
      />
      <div className="font-['Inter',_sans-serif]">
        <AnimatePresence mode="wait">
          <motion.div key={view} variants={fadeIn} initial="initial" animate="animate" exit="exit" transition={{ duration:0.15 }}>
            {view==="landing"     && <LandingView onNavigate={navigate}/>}
            {view==="create"      && <CreateView  onNavigate={navigate} onEnter={enterRoom}/>}
            {view==="join"        && <JoinView    onNavigate={navigate} onEnter={enterRoom} prefillCode={prefillCode}/>}
            {view==="lobby"       && roomCode && myPlayerId && <LobbyView     roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>}
            {view==="role-reveal" && roomCode && myPlayerId && <RoleRevealView roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>}
            {view==="game"        && roomCode && myPlayerId && <GameView       roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>}
            {view==="vote"        && roomCode && myPlayerId && <VoteView       roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>}
            {view==="results"     && roomCode && myPlayerId && <ResultsView    roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>}
            {view==="stats"       && <StatsView onNavigate={navigate}/>}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}