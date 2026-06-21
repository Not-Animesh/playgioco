// PlayGioco — v5
// Find The Imposter + Draw The Imposter
// All bugs fixed, Game 2 implemented, comprehensive word banks

import { useState, useEffect, useRef, useCallback, Component, type ReactNode } from "react"
import { motion, AnimatePresence } from "motion/react"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import QRCodeSVG from "react-qr-code"
import { toast, Toaster } from "sonner"
import {
  Copy, Crown, X, Check, Eye, Play, RotateCcw, Home,
  BarChart2, Send, Share2, ChevronRight, AlertCircle, ArrowRight,
  Wifi, WifiOff, Pencil, Palette, Minus,
} from "lucide-react"

import { roomDB, hasSupabase } from "./supabase"
import { Category, GAME1_CATEGORIES, pickWord, wordSeed } from "./words"

const cn = (...i: Parameters<typeof clsx>) => twMerge(clsx(i))

// ─── TYPES ────────────────────────────────────────────────────────────────────

type GameMode = "find" | "draw"
type View = "landing" | "how-to-play" | "create" | "join" | "lobby"
  | "role-reveal" | "game" | "vote" | "results" | "stats" | "draw-game"

interface Player {
  id: string
  guestId: string
  displayName: string
  role?: "imposter" | "innocent"
  isHost: boolean
  isEliminated: boolean
  imposterHistory: number
  lastSeen: number
  confirmedReveal: boolean
}

interface Message {
  id: string
  playerId: string
  playerName: string
  content: string
  type: "clue" | "system" | "chat"
  timestamp: number
}

interface DrawPoint  { x: number; y: number }
interface DrawStroke {
  id: string; playerId: string; playerName: string
  color: string; size: number; points: DrawPoint[]
}

interface GameSession {
  mode: GameMode
  word: string; category: string; imposterId: string
  gameRound: number; clueRound: number; maxClueRounds: number | null
  phase: "role-reveal" | "clue" | "vote" | "results"
  baseOrder: string[]
  currentSpeakerIndex: number
  messages: Message[]
  votes: Record<string, string>
  continueVotes: Record<string, boolean>
  drawStrokes: DrawStroke[]
  drawChatMessages: Message[]
  result?: {
    winner: "innocents" | "imposter"
    eliminatedPlayerId: string; eliminatedPlayerName: string
    imposterName: string; word: string; roundsPlayed: number
  }
}

interface Room {
  code: string; hostId: string; mode: GameMode; status: "waiting" | "playing" | "finished"
  settings: { category: Category; timerSeconds: number | null; rounds: number | null; maxPlayers: number }
  players: Player[]; session?: GameSession; usedWords: string[]; lastUpdated: number
}

interface LocalStats {
  gamesPlayed: number; gamesWon: number; imposterWins: number
  detectiveWins: number; gamesHosted: number; totalPoints: number
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const genId   = () => Math.random().toString(36).slice(2, 10)
const genCode = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join("")
}
const getGuestId = () => {
  let id = localStorage.getItem("gioco_guest_id")
  if (!id) { id = `guest_${genId()}`; localStorage.setItem("gioco_guest_id", id) }
  return id
}
const assignRoles = (players: Player[]): Player[] => {
  const sorted = [...players].sort((a, b) => a.imposterHistory - b.imposterHistory)
  const imposterId = sorted[0].id
  return players.map(p => ({
    ...p, confirmedReveal: false,
    role: p.id === imposterId ? ("imposter" as const) : ("innocent" as const),
    imposterHistory: p.id === imposterId ? p.imposterHistory + 1 : p.imposterHistory,
  }))
}
const buildOrder = (players: Player[], imposterId: string): string[] => {
  const alive = players.filter(p => !p.isEliminated)
  const s = [...alive].sort(() => Math.random() - 0.5)
  const idx = s.findIndex(p => p.id === imposterId)
  if (idx === 0 && s.length > 1) {
    const swap = Math.floor(Math.random() * (s.length - 1)) + 1
    ;[s[0], s[swap]] = [s[swap], s[0]]
  }
  return s.map(p => p.id)
}

const statsDB = {
  get: (): LocalStats => {
    try { return JSON.parse(localStorage.getItem("gioco_stats") || "null") || { gamesPlayed:0,gamesWon:0,imposterWins:0,detectiveWins:0,gamesHosted:0,totalPoints:0 } }
    catch { return { gamesPlayed:0,gamesWon:0,imposterWins:0,detectiveWins:0,gamesHosted:0,totalPoints:0 } }
  },
  patch: (p: Partial<LocalStats>) => { localStorage.setItem("gioco_stats", JSON.stringify({ ...statsDB.get(), ...p })) },
}

// ─── CLIPBOARD ────────────────────────────────────────────────────────────────

function doCopy(text: string): boolean {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {}); return true
  }
  try {
    const el = Object.assign(document.createElement("textarea"), { value:text, style:"position:fixed;opacity:0;top:-9999px" })
    document.body.appendChild(el); el.focus(); el.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(el); return ok
  } catch { return false }
}

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
// Catches any runtime crash so users see a helpful message instead of a white screen.

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: msg }
  }
  componentDidCatch(err: unknown) {
    console.error("[PlayGioco] Uncaught error:", err)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#F8F8F8] flex flex-col items-center justify-center p-8 font-['Inter',_sans-serif]">
          <div className="max-w-md w-full text-center">
            <div className="font-['Geist',_sans-serif] font-black text-[80px] text-secondary leading-none mb-4">!</div>
            <h2 className="font-['Geist',_sans-serif] font-black text-2xl mb-3 tracking-tight">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
              An unexpected error occurred. Your room code is still valid — reload and re-enter it to continue.
            </p>
            <p className="text-xs text-muted-foreground/60 font-mono mb-8 break-all">{this.state.error}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = "/" }}
              className="px-6 py-3 bg-accent text-white text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Go Home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── ANIMATIONS ───────────────────────────────────────────────────────────────

const fadeUp  = { initial:{ opacity:0, y:16 }, animate:{ opacity:1, y:0 }, exit:{ opacity:0, y:-8 } }
const fadeIn  = { initial:{ opacity:0 }, animate:{ opacity:1 }, exit:{ opacity:0 } }
const stagger = { animate:{ transition:{ staggerChildren:0.06 } } }

// ─── HOOK: useRoom ────────────────────────────────────────────────────────────
// Rules:
//  1. setRoom callback must be pure — no side effects (no roomDB.set inside it).
//  2. DB writes happen in a useEffect that watches `room` with a local-write flag.
//  3. Heartbeat writes directly to DB without touching React state.

const useRoom = (code: string | null) => {
  const [room, setRoom] = useState<Room | null>(null)
  const myIdRef      = useRef<string | undefined>(undefined)
  const codeRef      = useRef(code)
  const localWrite   = useRef(false) // true when WE called updateRoom (not remote)
  codeRef.current    = code

  // ── Subscribe to room updates ──────────────────────────────────────────────
  useEffect(() => {
    if (!code) return
    roomDB.get(code)
      .then(d => { if (d) setRoom(d as Room) })
      .catch(() => {})
    const unsub = roomDB.subscribe(code, d => {
      if (d == null) setRoom(null)
      else setRoom(d as Room)
    })
    return unsub
  }, [code])

  // ── Write to DB after a LOCAL state update ─────────────────────────────────
  // This effect runs after every render where room changes.
  // Only persists when localWrite flag is set (i.e., WE initiated the update,
  // not when an update arrived from Supabase/BroadcastChannel).
  useEffect(() => {
    if (!room || !localWrite.current) return
    localWrite.current = false
    try { roomDB.set(room.code, room) } catch {}
  }) // intentionally no dep array — runs after every commit

  // ── Heartbeat: write lastSeen without touching React state ─────────────────
  const heartbeat = useCallback((pid: string) => {
    myIdRef.current = pid
  }, [])

  useEffect(() => {
    if (!code) return
    const tick = async () => {
      const pid = myIdRef.current
      if (!pid || !codeRef.current) return
      try {
        const raw = await roomDB.get(codeRef.current)
        if (!raw) return
        const r = raw as Room
        if (!r.players.find(p => p.id === pid)) return
        roomDB.set(r.code, {
          ...r,
          players: r.players.map(p =>
            p.id === pid ? { ...p, lastSeen: Date.now() } : p
          ),
        })
      } catch {}
    }
    const t = setInterval(tick, 15000)
    return () => clearInterval(t)
  }, [code])

  // ── updateRoom: pure state update, DB write handled by the effect above ────
  const updateRoom = useCallback((updater: (r: Room) => Room) => {
    localWrite.current = true // flag BEFORE setRoom so effect sees it
    setRoom(prev => {
      if (!prev) return prev
      try {
        return updater(prev) // pure — just return new state
      } catch (err) {
        localWrite.current = false
        console.error("[updateRoom] failed:", err)
        return prev
      }
    })
  }, [])

  return { room, setRoom, updateRoom, heartbeat }
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "accent" | "white"; size?: "sm" | "md" | "lg"; loading?: boolean
}
const Btn = ({ variant="primary", size="md", loading, className, children, disabled, ...p }: BtnProps) => {
  const base = "inline-flex items-center justify-center font-semibold transition-all duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed tracking-tight"
  const v = { primary:"bg-foreground text-primary-foreground hover:opacity-80 active:scale-[0.98]", outline:"border border-foreground/25 text-foreground hover:border-foreground active:scale-[0.98]", ghost:"text-foreground hover:bg-black/5 active:scale-[0.98]", accent:"bg-accent text-accent-foreground hover:opacity-90 active:scale-[0.98]", white:"bg-white text-foreground hover:bg-white/90 active:scale-[0.98]" }
  const s = { sm:"text-xs px-3 py-1.5 gap-1.5", md:"text-sm px-4 py-2.5 gap-2", lg:"text-base px-6 py-3.5 gap-2.5" }
  return <button className={cn(base,v[variant],s[size],className)} disabled={disabled||loading} {...p}>{loading?<span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>:children}</button>
}

const Field = ({ label, error, hint, className, ...p }: React.InputHTMLAttributes<HTMLInputElement>&{label?:string;error?:string;hint?:string}) => (
  <div className="flex flex-col gap-1.5">
    {label&&<label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">{label}</label>}
    <input className={cn("w-full px-4 py-3.5 bg-white border text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors text-sm",error?"border-destructive":"border-border focus:border-foreground",className)} {...p}/>
    {error&&<span className="text-xs text-destructive">{error}</span>}
    {hint&&!error&&<span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
)

const CopyInput = ({ value, label, dark }: { value:string; label:string; dark?:boolean }) => {
  const ref  = useRef<HTMLInputElement>(null)
  const [done, setDone] = useState(false)
  const copy = () => {
    if (ref.current) { ref.current.focus(); ref.current.select(); ref.current.setSelectionRange(0,99999) }
    const ok = doCopy(value)
    if (ok) { setDone(true); setTimeout(()=>setDone(false),2500); toast.success(`${label} copied!`) }
    else toast(`Select the text and press Ctrl+C / ⌘C`, { icon:"📋" })
  }
  return (
    <div className="flex items-stretch">
      <input ref={ref} readOnly value={value} onClick={()=>{ref.current?.select();ref.current?.setSelectionRange(0,99999)}}
        className={cn("flex-1 min-w-0 px-3 py-2.5 text-sm font-mono focus:outline-none cursor-text",dark?"bg-white/8 border border-white/15 text-white/80 focus:border-white/40":"bg-[#F8F8F8] border border-black/10 text-foreground focus:border-foreground")}/>
      <button onClick={copy} className={cn("px-4 flex-shrink-0 text-xs font-bold flex items-center gap-1.5 transition-colors",done?"bg-accent/90 text-white":dark?"bg-accent text-white hover:bg-accent/90":"bg-foreground text-white hover:opacity-80")}>
        {done?<><Check size={12}/>Copied</>:<><Copy size={12}/>Copy</>}
      </button>
    </div>
  )
}

const QRBlock = ({ value, size=120 }: { value:string; size?:number }) => (
  <div className="bg-white p-3 border border-black/10 inline-block">
    <QRCodeSVG value={value} size={size} fgColor="#171717" bgColor="#ffffff" level="M"/>
  </div>
)

const WordImage = ({ word }: { word:string }) => {
  const [state, setState] = useState<"loading"|"ok"|"err">("loading")
  const seed = wordSeed(word)
  const url  = `https://loremflickr.com/320/320/${encodeURIComponent(word)}?lock=${seed}`
  return (
    <div className="relative w-44 h-44 mx-auto border border-black/10 overflow-hidden bg-secondary">
      {state==="loading"&&<div className="absolute inset-0 bg-secondary animate-pulse"/>}
      {state!=="err"&&<img src={url} alt={word} onLoad={()=>setState("ok")} onError={()=>setState("err")} className={cn("w-full h-full object-cover transition-opacity duration-300",state==="ok"?"opacity-100":"opacity-0")}/>}
      {state==="err"&&<div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">No image</div>}
    </div>
  )
}

const ConnectionBadge = () => (
  <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold tracking-widest uppercase",hasSupabase?"text-green-600":"text-amber-500")}>
    {hasSupabase?<><Wifi size={10}/>Realtime</>:<><WifiOff size={10}/>Local</>}
  </span>
)

const Spinner = ({ label="Loading…" }: { label?:string }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F8F8F8]">
    <div className="w-7 h-7 border-2 border-foreground border-t-transparent rounded-full animate-spin"/>
    <p className="text-sm text-muted-foreground font-['Inter',_sans-serif]">{label}</p>
  </div>
)

// ─── LANDING ILLUSTRATION ─────────────────────────────────────────────────────

const GroupIllustration = () => {
  const figures = [
    { x:55,  y:200, imp:false, lean:0  },
    { x:130, y:180, imp:false, lean:-5 },
    { x:210, y:190, imp:false, lean:3  },
    { x:290, y:178, imp:false, lean:-3 },
    { x:365, y:198, imp:false, lean:5  },
    { x:220, y:255, imp:true,  lean:8  },
  ]
  return (
    <svg viewBox="0 0 440 360" fill="none" className="w-full max-w-[560px]">
      <line x1="20" y1="310" x2="420" y2="310" stroke="#DEDEDE" strokeWidth="1"/>
      {/* Speech bubbles */}
      {[{x:30,y:100,tx:56,ty:115,text:'"warm"',lx:56,ly:148},{x:152,y:80,tx:180,ty:95,text:'"round"',lx:160,ly:135},{x:315,y:78,tx:342,ty:93,text:'"baked"',lx:320,ly:133}].map((b,i)=>(
        <g key={i}>
          <rect x={b.x} y={b.y} width={52+i*2} height={22} rx={4} fill="white" stroke="#DEDEDE" strokeWidth="0.75"/>
          <text x={b.tx} y={b.ty} textAnchor="middle" fontSize="8" fontFamily="Inter,sans-serif" fill="#4D4D4D" fontStyle="italic">{b.text}</text>
          <line x1={b.lx} y1={b.y+22} x2={b.lx} y2={b.ly} stroke="#DEDEDE" strokeWidth="0.75"/>
        </g>
      ))}
      {/* Imposter ??? bubble */}
      <rect x={250} y={192} width={44} height={22} rx={4} fill="#FFF4F1" stroke="#F25623" strokeWidth="1"/>
      <text x={272} y={207} textAnchor="middle" fontSize="9" fontFamily="Geist,sans-serif" fontWeight="700" fill="#F25623">???</text>
      <line x1={253} y1={214} x2={245} y2={228} stroke="#F25623" strokeWidth="0.75" strokeDasharray="2 2"/>
      {/* Figures */}
      {figures.map((f, i) => {
        const headY=f.y-80, bodyY=f.y-55, bH=50
        const fill=f.imp?"#171717":"white", stroke="#171717", sw=f.imp?1.5:1
        return (
          <g key={i} transform={`rotate(${f.lean},${f.x},${f.y})`}>
            <ellipse cx={f.x} cy={f.y+6} rx={16} ry={4} fill="#00000010"/>
            <rect x={f.x-14} y={bodyY} width={28} height={bH} fill={fill} stroke={stroke} strokeWidth={sw}/>
            <circle cx={f.x} cy={headY} r={22} fill={fill} stroke={stroke} strokeWidth={sw}/>
            {f.imp?(
              <>
                <line x1={f.x-9} y1={headY-5} x2={f.x-4} y2={headY-7} stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1={f.x+4} y1={headY-7} x2={f.x+9} y2={headY-5} stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <path d={`M ${f.x-9} ${headY+6} Q ${f.x} ${headY+15} ${f.x+9} ${headY+6}`} stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <circle cx={f.x-6} cy={headY-5} r={2} fill="white"/>
                <circle cx={f.x+6} cy={headY-5} r={2} fill="white"/>
                <circle cx={f.x-5} cy={headY-4} r={0.8} fill="#171717"/>
                <circle cx={f.x+7} cy={headY-4} r={0.8} fill="#171717"/>
                <circle cx={f.x} cy={headY} r={24} stroke="#F25623" strokeWidth="1" strokeDasharray="4 3" fill="none" opacity="0.5"/>
              </>
            ):(
              <>
                <circle cx={f.x-7} cy={headY-4} r={2} fill="#171717"/>
                <circle cx={f.x+7} cy={headY-4} r={2} fill="#171717"/>
                <path d={`M ${f.x-6} ${headY+5} Q ${f.x} ${headY+10} ${f.x+6} ${headY+5}`} stroke="#171717" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
              </>
            )}
            <line x1={f.x-14} y1={bodyY+12} x2={f.x-26} y2={bodyY+30} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
            <line x1={f.x+14} y1={bodyY+12} x2={f.x+26} y2={bodyY+30} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
            <line x1={f.x-7} y1={bodyY+bH} x2={f.x-10} y2={f.y+6} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
            <line x1={f.x+7} y1={bodyY+bH} x2={f.x+10} y2={f.y+6} stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
            <text x={f.x} y={f.y+22} textAnchor="middle" fontSize="8" fontFamily="Geist,sans-serif" fontWeight="700" fill={f.imp?"#F25623":"#4D4D4D"} letterSpacing="0.05em">
              {f.imp?"IMPOSTER?":["ALEX","RILEY","JORDAN","SAM","TAYLOR"][i]}
            </text>
          </g>
        )
      })}
      <rect x={4} y={4} width={432} height={352} stroke="#DEDEDE" strokeWidth="0.75"/>
    </svg>
  )
}

// ─── LANDING VIEW ─────────────────────────────────────────────────────────────

const LandingView = ({ onNavigate, onSelectGame }: {
  onNavigate:(v:View)=>void
  onSelectGame:(mode:GameMode)=>void
}) => (
  <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.25 }}
    className="min-h-screen bg-white text-foreground font-['Inter',_sans-serif]">

    {/* NAV */}
    <nav className="border-b border-black/8 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight flex-shrink-0">PLAYGIOCO</span>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-6 text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
          <button onClick={()=>onNavigate("how-to-play")} className="hover:text-foreground transition-colors">Rules</button>
          <button onClick={()=>onNavigate("stats")} className="hover:text-foreground transition-colors">Stats</button>
        </div>

        {/* Right CTAs */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={()=>onNavigate("join")}
            className="hidden sm:block text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
            Join Room
          </button>
          <Btn variant="accent" size="sm" onClick={()=>onNavigate("create")} className="font-bold">
            Create Game
          </Btn>
        </div>
      </div>
    </nav>

    {/* HERO */}
    <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-16 lg:pt-24 lg:pb-20">
      <div className="grid lg:grid-cols-[1fr_1fr] gap-16 items-center">
        <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-8">
          <motion.div variants={fadeUp} transition={{ duration:0.4 }}>
            <h1 className="font-['Geist',_sans-serif] font-black leading-[0.87] tracking-tighter" style={{ fontSize:"clamp(68px,10.5vw,128px)" }}>
              GUESS,<br/>DRAW &amp;<br/><span className="text-accent">DE</span>CEIVE.
            </h1>
          </motion.div>

          <motion.p variants={fadeUp} transition={{ duration:0.4,delay:0.08 }}
            className="text-lg text-muted-foreground leading-relaxed max-w-xs">
            Party games that make you question everyone in the room.
          </motion.p>

          <motion.div variants={fadeUp} transition={{ duration:0.4,delay:0.14 }} className="flex flex-col sm:flex-row gap-3">
            <Btn variant="accent" size="lg" onClick={()=>onNavigate("create")} className="group font-bold">
              Create a Room
              <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform"/>
            </Btn>
            <Btn variant="outline" size="lg" onClick={()=>onNavigate("join")} className="font-bold">
              Join a Room
            </Btn>
          </motion.div>

          <motion.div variants={fadeUp} transition={{ duration:0.4,delay:0.2 }}
            className="flex items-center gap-8 pt-2 border-t border-black/8">
            {[["3–10","Players"],["2+","Games"],["Free","Always"]].map(([v,l])=>(
              <div key={l}>
                <div className="font-['Geist',_sans-serif] font-black text-xl">{v}</div>
                <div className="text-[11px] tracking-widest uppercase text-muted-foreground">{l}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity:0,x:24 }} animate={{ opacity:1,x:0 }} transition={{ duration:0.5,delay:0.15 }}
          className="hidden lg:block">
          <GroupIllustration/>
        </motion.div>
      </div>
    </section>

    {/* GAMES — clicking a card goes directly to create for that game */}
    <section className="border-t border-black/8 bg-[#F8F8F8]">
      <div className="max-w-7xl mx-auto px-8 py-20">
        <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-3">Games</p>
        <h2 className="font-['Geist',_sans-serif] font-black text-[clamp(32px,5vw,52px)] tracking-tight leading-none mb-3">Pick a Game</h2>
        <p className="text-sm text-muted-foreground mb-12">Tap a game to start creating a room for it.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {([
            {mode:"find" as GameMode,title:"Find The Imposter",desc:"One player has no word. Everyone gives one-word clues. Spot the liar before they convince you they belong."},
            {mode:"draw" as GameMode,title:"Draw The Imposter",desc:"Everyone draws the secret word on a shared canvas — except the imposter who guesses as they draw along."},
          ]).map(g=>(
            <motion.div key={g.title} whileHover={{ y:-3 }} transition={{ duration:0.15 }}
              onClick={()=>onSelectGame(g.mode)}
              className="bg-white border border-black/10 p-7 cursor-pointer group hover:border-foreground transition-colors">
              <div className="flex items-start justify-between mb-5">
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-accent text-white">Live</span>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-accent transition-all group-hover:translate-x-0.5"/>
              </div>
              <h3 className="font-['Geist',_sans-serif] font-black text-2xl mb-3 tracking-tight">{g.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{g.desc}</p>
            </motion.div>
          ))}
          <div className="border border-dashed border-black/15 p-7 opacity-45">
            <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground border border-border px-2 py-0.5">Soon</span>
            <h3 className="font-['Geist',_sans-serif] font-black text-2xl mt-5 mb-2 tracking-tight">More Coming</h3>
            <p className="text-sm text-muted-foreground">Codenames, Scribble, and more guessing &amp; word games.</p>
          </div>
        </div>
      </div>
    </section>

    {/* HOW IT WORKS — no CTA button, just the 3 steps */}
    <section className="bg-foreground text-white">
      <div className="max-w-7xl mx-auto px-8 py-20">
        <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-white/30 mb-14">In 3 Steps</p>
        <div className="grid md:grid-cols-3 gap-12">
          {[
            {n:"01",t:"Pick a Game & Create a Room",b:"Choose a game above. Name yourself, set a category, timer, and round limit. Share the 6-letter code."},
            {n:"02",t:"Everyone Reveals Their Role",b:"Each player privately sees their role on their own device. No passing — simultaneous, instant."},
            {n:"03",t:"Play",b:"Give clues, draw, guess, or deceive — then vote. Full rules are in How to Play."},
          ].map(({n,t,b})=>(
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
      <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between flex-wrap gap-4">
        <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">PLAYGIOCO</span>
        <div className="flex items-center gap-6">
          <button onClick={()=>onNavigate("how-to-play")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">How to Play</button>
          <ConnectionBadge/>
          <span className="text-xs text-muted-foreground">© 2025</span>
        </div>
      </div>
    </footer>
  </motion.div>
)

// ─── HOW TO PLAY ──────────────────────────────────────────────────────────────

const HowToPlayView = ({ onNavigate }: { onNavigate:(v:View)=>void }) => (
  <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }}
    className="min-h-screen bg-white font-['Inter',_sans-serif]">
    <header className="border-b border-black/8 sticky top-0 bg-white z-10">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
        <button onClick={()=>onNavigate("landing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"><Home size={14}/>Home</button>
        <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">HOW TO PLAY</span>
        <div/>
      </div>
    </header>
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-16">
      {/* Game 1 */}
      <section>
        <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-2">Game 01</p>
        <h2 className="font-['Geist',_sans-serif] font-black text-4xl tracking-tight mb-8">Find The Imposter</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {[{t:"Objective",b:"Innocents find and vote out the imposter. The imposter must blend in."},
            {t:"Players",b:"3–10 players. One is secretly the Imposter. The rest are Innocents."},
            {t:"The Word",b:"All Innocents share a secret word. The Imposter only knows the category."},
            {t:"Winning",b:"Innocents win if the Imposter is voted out. Imposter wins if an Innocent is eliminated."}
          ].map(c=><div key={c.t} className="bg-[#F8F8F8] p-5"><h4 className="font-['Geist',_sans-serif] font-bold text-foreground text-sm mb-1">{c.t}</h4><p className="text-sm text-muted-foreground leading-relaxed">{c.b}</p></div>)}
        </div>
        <ol className="space-y-5">
          {[
            {n:"01",t:"Create a Room",b:"Host picks a category (Food, Movies, Countries, Animals, etc.), a per-turn timer (30s/60s/120s/None), and the number of clue rounds before a forced vote (1/3/5/Unlimited)."},
            {n:"02",t:"Invite Players",b:"Share the 6-letter room code, the join link, or the QR code. Players go to PlayGioco on any device and enter the code. Min 3, max 10."},
            {n:"03",t:"Simultaneous Role Reveal",b:"Every player taps 'Reveal My Role' on their own device at the same time — no passing required. Innocents see the secret word plus an image hint. The Imposter sees only the category. Tap 'Got it' to confirm. Game starts once everyone confirms."},
            {n:"04",t:"Clue Phase",b:"Players speak in a fixed random order (imposter is never first). When it's your turn, type one short word or phrase as a clue about the secret word. Keep it vague — don't make it too obvious or too unrelated. The timer counts down. If it expires, your turn auto-skips."},
            {n:"05",t:"Continue or Vote?",b:"After everyone gives one clue, a decision appears: Continue (another round of clues in the SAME order) or Vote (start elimination). The majority wins. If the maximum clue rounds are reached, only Vote is available."},
            {n:"06",t:"Voting Phase",b:"Everyone secretly selects who they think is the Imposter. You cannot vote yourself. 30 seconds to decide. The player with the most votes is eliminated."},
            {n:"07",t:"Result",b:"If the eliminated player is the Imposter → Innocents Win (+100 pts each). If they were Innocent → Imposter Wins (+150 pts). Results show the secret word, vote breakdown, and who the imposter was."},
            {n:"08",t:"Next Round",b:"Click 'Next Round' to play again in the same lobby with a new word and reshuffled roles. The imposter role rotates fairly — players who have been imposter more are deprioritized."},
          ].map(s=>(
            <li key={s.n} className="flex gap-5">
              <span className="font-['Geist',_sans-serif] font-black text-2xl text-foreground/15 flex-shrink-0 w-10">{s.n}</span>
              <div><h4 className="font-semibold text-foreground mb-1">{s.t}</h4><p className="text-sm text-muted-foreground leading-relaxed">{s.b}</p></div>
            </li>
          ))}
        </ol>
      </section>
      {/* Game 2 */}
      <section className="border-t border-black/8 pt-16">
        <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-2">Game 02</p>
        <h2 className="font-['Geist',_sans-serif] font-black text-4xl tracking-tight mb-8">Draw The Imposter</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {[{t:"Same concept",b:"Find the imposter — but instead of giving clues, everyone draws on a shared canvas."},
            {t:"Shared Canvas",b:"Every stroke from every player appears on the same canvas in real time."},
            {t:"The Imposter",b:"Has no word. Watches what others draw, guesses, and draws something plausible."},
            {t:"Attribution",b:"Hover over any drawn line to see which player drew it."}
          ].map(c=><div key={c.t} className="bg-[#F8F8F8] p-5"><h4 className="font-['Geist',_sans-serif] font-bold text-foreground text-sm mb-1">{c.t}</h4><p className="text-sm text-muted-foreground leading-relaxed">{c.b}</p></div>)}
        </div>
        <ol className="space-y-4">
          {[
            {n:"01",t:"Same setup",b:"Create room → choose Draw The Imposter → invite players → everyone reveals roles privately."},
            {n:"02",t:"Drawing turns",b:"Players take turns on the shared canvas in a fixed random order. Pick your color and brush size, then draw when it's your turn. Tap 'Done Drawing' to pass to the next player."},
            {n:"03",t:"Real-time canvas",b:"Every stroke appears on every player's screen immediately. The canvas accumulates — you cannot erase what others drew."},
            {n:"04",t:"Chat",b:"An unrestricted live chat panel runs alongside the canvas. Any player can type anything at any time — use it to discuss, accuse, joke, or bluff."},
            {n:"05",t:"Continue or Vote",b:"After everyone draws once, same decision: draw another round, or vote to eliminate the suspected imposter."},
          ].map(s=>(
            <li key={s.n} className="flex gap-5">
              <span className="font-['Geist',_sans-serif] font-black text-2xl text-foreground/15 flex-shrink-0 w-10">{s.n}</span>
              <div><h4 className="font-semibold text-foreground mb-1">{s.t}</h4><p className="text-sm text-muted-foreground leading-relaxed">{s.b}</p></div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  </motion.div>
)

// ─── CREATE VIEW ──────────────────────────────────────────────────────────────

const TIMER_OPTS = [{l:"30s",v:30},{l:"60s",v:60},{l:"120s",v:120},{l:"None",v:null as number|null}]
const ROUND_OPTS = [{l:"1",v:1},{l:"3",v:3},{l:"5",v:5},{l:"∞",v:null as number|null}]

const CreateView = ({ onNavigate, onEnter, initialMode }: {
  onNavigate:(v:View)=>void
  onEnter:(c:string,pid:string)=>void
  initialMode?: GameMode
}) => {
  // If a game was pre-selected from the landing page, skip step 1
  const [step, setStep]     = useState(initialMode ? 2 : 1)
  const [mode, setMode]     = useState<GameMode>(initialMode ?? "find")
  const [name, setName]     = useState("")
  const [nameErr, setNE]    = useState("")
  const [cat, setCat]       = useState<Category>("Food")
  const [timer, setTimer]   = useState<number|null>(60)
  const [rounds, setRounds] = useState<number|null>(3)
  const [loading, setL]     = useState(false)

  const validateName = () => {
    if (name.trim().length<2) { setNE("At least 2 characters"); return false }
    if (name.trim().length>20) { setNE("Max 20 characters"); return false }
    setNE(""); return true
  }
  const create = async () => {
    if (!validateName()) return
    setL(true); await new Promise(r=>setTimeout(r,250))
    const guestId=getGuestId(), pid=genId()
    let code=genCode()
    while (localStorage.getItem(`gioco_room_${code}`)) code=genCode()
    const player: Player = { id:pid,guestId,displayName:name.trim(),isHost:true,isEliminated:false,imposterHistory:0,lastSeen:Date.now(),confirmedReveal:false }
    const room: Room = { code,hostId:pid,mode,status:"waiting",settings:{category:cat,timerSeconds:timer,rounds,maxPlayers:10},players:[player],usedWords:[],lastUpdated:Date.now() }
    roomDB.set(code,room); statsDB.patch({ gamesHosted:statsDB.get().gamesHosted+1 })
    onEnter(code,pid); setL(false); onNavigate("lobby")
  }
  const OBtn = ({ active, onClick, children }: { active:boolean; onClick:()=>void; children:React.ReactNode }) => (
    <button onClick={onClick} className={cn("p-3 text-sm font-semibold border text-center transition-all duration-150",active?"border-foreground bg-foreground text-white":"border-black/10 bg-white hover:border-foreground")}>{children}</button>
  )
  const Bar = ({ n }: { n:number }) => (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground">Step {n} of 3</p>
        <span className="text-xs text-muted-foreground font-mono">{n}/3</span>
      </div>
      <div className="h-0.5 bg-border"><motion.div className="h-full bg-accent" animate={{ width:`${(n/3)*100}%` }} transition={{ duration:0.3 }}/></div>
    </div>
  )
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }} className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif]">
      <div className="bg-white border-b border-black/8">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={()=>step===1?onNavigate("landing"):setStep(s=>s-1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← {step===1?"Home":"Back"}</button>
          <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">CREATE ROOM</span><div/>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {step===1&&(
            <motion.div key="s1" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={{ duration:0.22 }}>
              <Bar n={1}/>
              <h2 className="font-['Geist',_sans-serif] font-black text-[38px] tracking-tight leading-none mb-10">Choose Game</h2>
              <div className="space-y-3">
                {([{m:"find" as GameMode,label:"Find The Imposter",desc:"Give one-word clues. Spot the liar. Vote them out."},{m:"draw" as GameMode,label:"Draw The Imposter",desc:"Draw on a shared canvas. Identify who drew like a stranger."}]).map(g=>(
                  <motion.div key={g.m} whileHover={{ y:-2 }} transition={{ duration:0.15 }} onClick={()=>{setMode(g.m);setStep(2)}}
                    className={cn("bg-white border-2 p-7 cursor-pointer transition-colors",mode===g.m?"border-foreground":"border-black/10 hover:border-foreground/50")}>
                    <div className="flex items-start justify-between mb-3">
                      <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-accent text-white">Live</span>
                      {mode===g.m&&<Check size={16} className="text-foreground"/>}
                    </div>
                    <h3 className="font-['Geist',_sans-serif] font-black text-xl tracking-tight mb-2">{g.label}</h3>
                    <p className="text-sm text-muted-foreground">{g.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
          {step===2&&(
            <motion.div key="s2" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={{ duration:0.22 }}>
              <Bar n={2}/>
              <h2 className="font-['Geist',_sans-serif] font-black text-[38px] tracking-tight leading-none mb-2">Your Name</h2>
              <p className="text-muted-foreground text-sm mb-8">Visible to all players.</p>
              <div className="bg-white border border-black/8 p-7 mb-6">
                <Field label="Display Name" value={name} onChange={e=>{setName(e.target.value);setNE("")}} onKeyDown={e=>{if(e.key==="Enter"&&validateName())setStep(3)}} placeholder="How should others call you?" maxLength={20} autoFocus error={nameErr} hint={`${name.trim().length}/20`}/>
              </div>
              <Btn variant="accent" size="lg" onClick={()=>{if(validateName())setStep(3)}} disabled={!name.trim()} className="font-bold">Continue <ChevronRight size={16}/></Btn>
            </motion.div>
          )}
          {step===3&&(
            <motion.div key="s3" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={{ duration:0.22 }}>
              <Bar n={3}/>
              <h2 className="font-['Geist',_sans-serif] font-black text-[38px] tracking-tight leading-none mb-10">Configure</h2>
              <div className="space-y-5">
                <div className="bg-white border border-black/8 p-6">
                  <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-4">Category</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{GAME1_CATEGORIES.map(c=><OBtn key={c} active={cat===c} onClick={()=>setCat(c)}>{c}</OBtn>)}</div>
                </div>
                <div className="bg-white border border-black/8 p-6">
                  <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-4">Timer per Turn</p>
                  <div className="grid grid-cols-4 gap-2">{TIMER_OPTS.map(o=><OBtn key={String(o.v)} active={timer===o.v} onClick={()=>setTimer(o.v)}>{o.l}</OBtn>)}</div>
                </div>
                <div className="bg-white border border-black/8 p-6">
                  <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground mb-1">Clue Rounds Before Vote</p>
                  <p className="text-xs text-muted-foreground mb-4">How many times everyone speaks before vote is forced.</p>
                  <div className="grid grid-cols-4 gap-2">{ROUND_OPTS.map(o=><OBtn key={String(o.v)} active={rounds===o.v} onClick={()=>setRounds(o.v)}>{o.l}</OBtn>)}</div>
                </div>
              </div>
              <div className="mt-8"><Btn variant="accent" size="lg" onClick={create} loading={loading} className="font-bold">Create Room <ArrowRight size={17}/></Btn></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── JOIN VIEW ────────────────────────────────────────────────────────────────

const JoinView = ({ onNavigate, onEnter, prefillCode }: { onNavigate:(v:View)=>void; onEnter:(c:string,pid:string)=>void; prefillCode?:string }) => {
  const [code, setCode] = useState(prefillCode||"")
  const [name, setName] = useState("")
  const [err, setErr]   = useState("")
  const [loading, setL] = useState(false)
  const join = async () => {
    const clean=code.trim().toUpperCase().replace(/[^A-Z0-9]/g,"")
    if (clean.length!==6) { setErr("Enter a 6-character room code"); return }
    if (name.trim().length<2) { setErr("Name must be at least 2 characters"); return }
    setL(true); await new Promise(r=>setTimeout(r,200))
    const room=await roomDB.get(clean) as Room|null
    if (!room) { setErr("Room not found. Check the code."); setL(false); return }
    if (room.status!=="waiting") { setErr("This game has already started."); setL(false); return }
    if (room.players.length>=room.settings.maxPlayers) { setErr("Room is full."); setL(false); return }
    const guestId=getGuestId(), existing=room.players.find(p=>p.guestId===guestId)
    if (existing) { onEnter(room.code,existing.id); onNavigate("lobby"); return }
    const pid=genId()
    const updated: Room = { ...room, players:[...room.players,{id:pid,guestId,displayName:name.trim(),isHost:false,isEliminated:false,imposterHistory:0,lastSeen:Date.now(),confirmedReveal:false}] }
    roomDB.set(updated.code,updated); setL(false); onEnter(updated.code,pid); onNavigate("lobby")
  }
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }} className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif] flex flex-col">
      <div className="bg-white border-b border-black/8">
        <div className="max-w-lg mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={()=>onNavigate("landing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Home</button>
          <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">JOIN ROOM</span><div/>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ duration:0.3 }} className="w-full max-w-md">
          <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-2">Enter Code</h2>
          <p className="text-muted-foreground text-sm mb-10">Get the 6-letter code from the room host.</p>
          <div className="bg-white border border-black/8 p-7 mb-4 space-y-5">
            <div>
              <label className="text-[11px] font-semibold tracking-[0.22em] uppercase text-muted-foreground block mb-2">Room Code</label>
              <input value={code} onChange={e=>{setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));setErr("")}} onKeyDown={e=>{if(e.key==="Enter")join()}} placeholder="KUP97B" maxLength={6} autoFocus className="w-full px-5 py-5 bg-[#F8F8F8] border border-black/8 focus:border-foreground focus:outline-none font-['Geist',_sans-serif] font-black text-3xl tracking-[0.35em] text-center placeholder:text-muted-foreground placeholder:font-normal placeholder:text-base placeholder:tracking-normal transition-colors uppercase"/>
            </div>
            <Field label="Your Name" value={name} onChange={e=>{setName(e.target.value);setErr("")}} onKeyDown={e=>{if(e.key==="Enter")join()}} placeholder="Enter your name…" maxLength={20}/>
          </div>
          {err&&<div className="flex items-center gap-2 text-sm text-destructive mb-5 p-4 bg-white border border-destructive/20"><AlertCircle size={14}/>{err}</div>}
          <Btn variant="accent" size="lg" onClick={join} loading={loading} disabled={code.replace(/[^A-Z0-9]/g,"").length!==6||name.trim().length<2} className="w-full font-bold">
            Join Room <ArrowRight size={17}/>
          </Btn>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── LOBBY VIEW ───────────────────────────────────────────────────────────────

const LobbyView = ({ roomCode, myPlayerId, onNavigate }: { roomCode:string; myPlayerId:string; onNavigate:(v:View)=>void }) => {
  const { room, updateRoom, heartbeat } = useRoom(roomCode)
  useEffect(()=>{ heartbeat(myPlayerId) },[myPlayerId])
  useEffect(()=>{ if(room?.status==="playing"&&room?.session?.phase==="role-reveal") onNavigate("role-reveal") },[room?.status,room?.session?.phase])
  if (!room) return <Spinner label="Connecting…"/>
  const me=room.players.find(p=>p.id===myPlayerId), isHost=me?.isHost??false, canStart=room.players.length>=3
  const baseUrl=`${window.location.protocol}//${window.location.host}${window.location.pathname}`
  const joinUrl=`${baseUrl}?join=${room.code}`
  const doShare=async()=>{ try { await navigator.share({title:"PlayGioco",text:`Join! Code: ${room.code}`,url:joinUrl}) } catch { const ok=doCopy(joinUrl); toast(ok?"Link copied!":"Copy the link above") } }
  const startGame = () => {
    if (!canStart || !room) return
    try {
      const word = pickWord(room.settings.category ?? "Food", room.usedWords ?? [])
      if (!word) { toast.error("Could not select a word. Try a different category."); return }

      const wr = assignRoles(room.players)
      const imp = wr.find(p => p.role === "imposter")
      if (!imp) { toast.error("Role assignment failed. Please try again."); return }

      const order = buildOrder(wr, imp.id)
      if (!order.length) { toast.error("Could not build speaking order."); return }

      const session: GameSession = {
        mode: room.mode ?? "find",
        word,
        category: room.settings.category ?? "Food",
        imposterId: imp.id,
        gameRound: 1,
        clueRound: 1,
        maxClueRounds: room.settings.rounds ?? null,
        phase: "role-reveal",
        baseOrder: order,
        currentSpeakerIndex: 0,
        messages: [],
        votes: {},
        continueVotes: {},
        drawStrokes: [],
        drawChatMessages: [],
      }

      updateRoom(r => ({
        ...r,
        status: "playing",
        players: wr,
        session,
        usedWords: [...(r.usedWords ?? []), word],
      }))

      onNavigate("role-reveal")
    } catch (err) {
      console.error("[startGame] error:", err)
      toast.error("Failed to start game. Please try again.")
    }
  }
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }} className="min-h-screen font-['Inter',_sans-serif] bg-[#F8F8F8]">
      <header className="bg-white border-b border-black/8 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <button onClick={()=>onNavigate("landing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"><Home size={14}/>Home</button>
          <div className="flex items-center gap-3"><ConnectionBadge/><span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">PLAYGIOCO</span></div>
          <button onClick={()=>onNavigate("stats")} className="text-muted-foreground hover:text-foreground transition-colors"><BarChart2 size={14}/></button>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-5 py-8 space-y-5">
        {/* Invite hero */}
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ duration:0.3 }} className="bg-foreground text-white">
          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-7 lg:p-10">
              <p className="text-[10px] tracking-[0.25em] uppercase text-white/35 mb-5">{room.mode==="find"?"Find The Imposter":"Draw The Imposter"} · Share to Invite</p>
              <div className="font-['Geist',_sans-serif] font-black tracking-[0.22em] text-white mb-3" style={{ fontSize:"clamp(46px,10vw,78px)",lineHeight:1 }}>{room.code}</div>
              <p className="text-xs text-white/30 mb-7">Players open <span className="text-white/55 font-mono">playgioco.app</span> → Join → enter this code</p>
              <div className="space-y-2.5 mb-5">
                <div><p className="text-[10px] tracking-widest uppercase text-white/30 mb-1.5">Room Code</p><CopyInput value={room.code} label="Room code" dark/></div>
                <div><p className="text-[10px] tracking-widest uppercase text-white/30 mb-1.5">Join Link</p><CopyInput value={joinUrl} label="Join link" dark/></div>
              </div>
              <button onClick={doShare} className="flex items-center gap-2 text-sm font-semibold text-white/45 hover:text-white border border-white/15 hover:border-white/35 px-4 py-2.5 transition-all"><Share2 size={15}/>Share via…</button>
            </div>
            <div className="border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col items-center justify-center p-8 lg:w-56 gap-3">
              <QRBlock value={joinUrl} size={140}/><p className="text-[10px] tracking-widest uppercase text-white/25">Scan to Join</p>
            </div>
          </div>
        </motion.div>
        <div className="grid lg:grid-cols-[1fr_280px] gap-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-['Geist',_sans-serif] font-black text-xl tracking-tight">Players <span className="text-muted-foreground font-normal text-base ml-1">{room.players.length}/10</span></h2>
              {room.players.length<3&&<span className="text-[11px] text-accent font-semibold">Need {3-room.players.length} more</span>}
            </div>
            <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-2 mb-5">
              {room.players.map(p=>(
                <motion.div key={p.id} variants={fadeUp} className={cn("bg-white border flex items-center justify-between p-4 transition-all",p.id===myPlayerId?"border-foreground":"border-black/8 hover:border-black/20")}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-9 h-9 flex items-center justify-center text-[11px] font-bold tracking-wide flex-shrink-0",p.id===myPlayerId?"bg-foreground text-white":"bg-[#F0F0F0] text-foreground")}>{p.displayName.slice(0,2).toUpperCase()}</div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm">{p.displayName}</span>{p.id===myPlayerId&&<span className="text-[10px] tracking-widest uppercase text-muted-foreground">you</span>}</div>
                      {p.isHost&&<div className="flex items-center gap-1"><Crown size={9} className="text-accent"/><span className="text-[10px] tracking-widest uppercase text-accent font-semibold">Host</span></div>}
                    </div>
                  </div>
                  {isHost&&!p.isHost&&<button onClick={()=>updateRoom(r=>({...r,players:r.players.filter(x=>x.id!==p.id)}))} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-all"><X size={13}/></button>}
                </motion.div>
              ))}
              {Array.from({length:Math.max(0,3-room.players.length)}).map((_,i)=>(
                <div key={i} className="border border-dashed border-black/10 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 border border-dashed border-black/15 flex items-center justify-center text-muted-foreground text-lg">+</div>
                  <span className="text-sm text-muted-foreground">Waiting for player…</span>
                </div>
              ))}
            </motion.div>
            {isHost?(
              <div className="flex gap-3 flex-wrap">
                <Btn variant="accent" size="lg" onClick={startGame} disabled={!canStart} className="font-bold"><Play size={17}/>Start Game</Btn>
                <Btn variant="ghost" size="lg" onClick={()=>{roomDB.delete(room.code);onNavigate("landing")}} className="font-semibold text-muted-foreground"><X size={15}/>End Room</Btn>
              </div>
            ):(
              <div className="flex items-center gap-2 py-4 px-5 bg-white border border-black/8"><div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse flex-shrink-0"/><span className="text-sm text-muted-foreground">Waiting for the host to start…</span></div>
            )}
          </div>
          <div className="space-y-4">
            <div className="bg-white border border-black/8 p-5">
              <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-4">Settings</p>
              <div className="space-y-3">
                {[["Game",room.mode==="find"?"Find The Imposter":"Draw The Imposter"],["Category",room.settings.category],["Timer",room.settings.timerSeconds?`${room.settings.timerSeconds}s / turn`:"No timer"],["Rounds",room.settings.rounds?String(room.settings.rounds):"Unlimited"]].map(([k,v])=>(
                  <div key={k} className="flex items-center justify-between gap-3"><span className="text-[11px] tracking-widest uppercase text-muted-foreground">{k}</span><span className="text-sm font-semibold">{v}</span></div>
                ))}
              </div>
            </div>
            <button onClick={()=>onNavigate("how-to-play")} className="w-full text-left bg-white border border-black/8 p-5 hover:border-foreground transition-colors">
              <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-1">Need help?</p>
              <p className="text-sm font-semibold flex items-center gap-1.5">Full Rules <ChevronRight size={14}/></p>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── ROLE REVEAL — simultaneous, each player on own device ────────────────────

const RoleRevealView = ({ roomCode, myPlayerId, onNavigate }: { roomCode:string; myPlayerId:string; onNavigate:(v:View)=>void }) => {
  const { room, updateRoom, heartbeat } = useRoom(roomCode)
  const [showing, setShowing] = useState(false)
  useEffect(()=>{ heartbeat(myPlayerId) },[myPlayerId])
  useEffect(()=>{
    if(room?.session?.phase==="clue") onNavigate(room.mode==="draw"?"draw-game":"game")
  },[room?.session?.phase])

  if (!room?.session) return <Spinner/>
  const { session } = room
  const me=room.players.find(p=>p.id===myPlayerId)
  const confirmed=room.players.filter(p=>p.confirmedReveal).length
  const allDone=confirmed>=room.players.length
  const myDone=me?.confirmedReveal??false

  const confirm=()=>{
    setShowing(false)
    updateRoom(r=>({...r,players:r.players.map(p=>p.id===myPlayerId?{...p,confirmedReveal:true}:p)}))
  }

  // Host advances when all confirmed
  useEffect(()=>{
    if(!allDone||!me?.isHost)return
    updateRoom(r=>({...r,session:r.session?{...r.session,phase:"clue"}:r.session}))
  },[allDone,me?.isHost])

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" className="min-h-screen font-['Inter',_sans-serif]">
      <AnimatePresence mode="wait">
        {!myDone&&!showing&&(
          <motion.div key="wait" variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="min-h-screen bg-[#F8F8F8] flex flex-col items-center justify-center px-8 text-center">
            <motion.div initial={{ opacity:0,y:20 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.3 }}>
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-5">Private Role Reveal</p>
              <h2 className="font-['Geist',_sans-serif] font-black tracking-tight leading-none mb-5" style={{ fontSize:"clamp(32px,7vw,60px)" }}>
                {me?.displayName}, tap to<br/>see your role.
              </h2>
              <p className="text-sm text-muted-foreground mb-10 max-w-sm mx-auto">Make sure nobody is looking at your screen.</p>
              <Btn variant="accent" size="lg" onClick={()=>setShowing(true)} className="font-bold"><Eye size={17}/>Reveal My Role</Btn>
              <p className="text-[11px] text-muted-foreground mt-5">{confirmed}/{room.players.length} players confirmed</p>
            </motion.div>
          </motion.div>
        )}
        {showing&&!myDone&&me?.role==="imposter"&&(
          <motion.div key="imp" variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="min-h-screen bg-foreground text-white flex flex-col items-center justify-center px-8 text-center">
            <motion.div initial={{ scale:0.85,opacity:0 }} animate={{ scale:1,opacity:1 }} transition={{ type:"spring",stiffness:280,damping:22 }}>
              <p className="text-[11px] tracking-[0.22em] uppercase text-white/25 mb-10">Your Role</p>
              <div className="font-['Geist',_sans-serif] font-black text-accent text-2xl tracking-[0.12em] mb-3">YOU ARE THE</div>
              <div className="font-['Geist',_sans-serif] font-black leading-none tracking-tight mb-8" style={{ fontSize:"clamp(58px,12vw,96px)" }}>IMPOSTER</div>
              <div className="w-16 h-px bg-white/10 mx-auto mb-6"/>
              <p className="text-white/40 text-sm leading-relaxed max-w-xs mb-3">You have no word — only the category:<br/><strong className="text-white/60">{session.category}</strong></p>
              <p className="text-white/25 text-sm mb-12">{room.mode==="draw"?"Watch what others draw. Make something plausible.":"Listen carefully. Blend in."}</p>
              <Btn variant="white" size="lg" onClick={confirm} className="font-bold text-foreground"><Check size={17}/>I Understand</Btn>
            </motion.div>
          </motion.div>
        )}
        {showing&&!myDone&&me?.role==="innocent"&&(
          <motion.div key="inn" variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center">
            <motion.div initial={{ scale:0.85,opacity:0 }} animate={{ scale:1,opacity:1 }} transition={{ type:"spring",stiffness:280,damping:22 }}>
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-10">Your Role</p>
              <div className="font-['Geist',_sans-serif] font-black text-muted-foreground text-2xl tracking-[0.12em] mb-3">YOU ARE</div>
              <div className="font-['Geist',_sans-serif] font-black leading-none tracking-tight mb-8" style={{ fontSize:"clamp(50px,9vw,78px)" }}>INNOCENT</div>
              <div className="border-2 border-foreground p-8 mb-6 inline-block min-w-[240px]">
                <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">The Secret Word</p>
                <div className="font-['Geist',_sans-serif] font-black tracking-tight mb-5" style={{ fontSize:"clamp(28px,5vw,46px)" }}>{session.word}</div>
                <WordImage word={session.word}/>
              </div>
              <p className="text-muted-foreground text-sm max-w-xs mb-10 leading-relaxed">
                {room.mode==="draw"?"Draw this word on the canvas. Stay vague — the imposter is watching.":"Give clues that hint at this word. Don't make it obvious."}
              </p>
              <Btn variant="primary" size="lg" onClick={confirm} className="font-bold"><Check size={17}/>Got It</Btn>
            </motion.div>
          </motion.div>
        )}
        {myDone&&(
          <motion.div key="confirmed" variants={fadeIn} initial="initial" animate="animate" exit="exit"
            className="min-h-screen bg-[#F8F8F8] flex flex-col items-center justify-center px-8 text-center">
            <Check size={36} className="text-accent mb-6"/>
            <h2 className="font-['Geist',_sans-serif] font-black text-3xl mb-3 tracking-tight">You're set.</h2>
            <p className="text-muted-foreground text-sm mb-8">
              Waiting for {room.players.length-confirmed} more player{room.players.length-confirmed!==1?"s":""} to confirm.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {room.players.map(p=>(
                <div key={p.id} className={cn("px-3 py-1.5 text-xs font-semibold border",p.confirmedReveal?"border-foreground bg-foreground text-white":"border-border text-muted-foreground")}>
                  {p.confirmedReveal&&<Check size={10} className="inline mr-1"/>}{p.displayName}
                </div>
              ))}
            </div>
            {allDone&&<div className="mt-8 flex items-center gap-2 text-sm text-accent font-semibold"><div className="w-2 h-2 bg-accent rounded-full animate-pulse"/>Starting game…</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── GAME 1: CLUE PHASE ───────────────────────────────────────────────────────

const GameView = ({ roomCode, myPlayerId, onNavigate }: { roomCode:string; myPlayerId:string; onNavigate:(v:View)=>void }) => {
  const { room, updateRoom, heartbeat } = useRoom(roomCode)
  const [clue, setClue]   = useState("")
  const [timeLeft, setTL] = useState<number|null>(null)
  const [showD, setShowD] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(()=>{ heartbeat(myPlayerId) },[myPlayerId])
  const session=room?.session, me=room?.players.find(p=>p.id===myPlayerId)
  const curId=session?.baseOrder[session.currentSpeakerIndex??0], isMyTurn=curId===myPlayerId
  const curSpeaker=room?.players.find(p=>p.id===curId)

  useEffect(()=>{ if(chatRef.current) chatRef.current.scrollTop=chatRef.current.scrollHeight },[session?.messages.length])

  useEffect(()=>{
    if(!session||!room?.settings.timerSeconds||!isMyTurn){setTL(null);return}
    setTL(room.settings.timerSeconds)
    const t=setInterval(()=>setTL(v=>{if(!v||v<=1){clearInterval(t);skipTurn();return null}return v-1}),1000)
    return ()=>clearInterval(t)
  },[session?.currentSpeakerIndex,isMyTurn])

  useEffect(()=>{
    if(!session)return
    if(session.phase==="vote") onNavigate("vote")
    if(session.phase==="role-reveal") onNavigate("role-reveal")
  },[session?.phase])

  if(!room||!session)return <Spinner/>
  const atMax=session.maxClueRounds!==null&&session.clueRound>=session.maxClueRounds
  const alive=room.players.filter(p=>!p.isEliminated)
  const aliveOrder=session.baseOrder.map(id=>room.players.find(p=>p.id===id)).filter(Boolean)

  const advance=(extra?:Message)=>{
    const next=session.currentSpeakerIndex+1, roundDone=next>=session.baseOrder.length
    updateRoom(r=>({...r,session:r.session?{...r.session,messages:extra?[...r.session.messages,extra]:r.session.messages,currentSpeakerIndex:roundDone?0:next,phase:roundDone?"clue":"clue",continueVotes:roundDone?{}:r.session.continueVotes,clueRound:roundDone?r.session.clueRound+1:r.session.clueRound}:r.session}))
    if(roundDone&&atMax) onNavigate("vote")
    else if(roundDone) setShowD(true)
  }

  const submitClue=()=>{
    if(!clue.trim()||!isMyTurn)return
    const msg: Message={id:genId(),playerId:myPlayerId,playerName:me?.displayName??"",content:clue.trim(),type:"clue",timestamp:Date.now()}
    const next=session.currentSpeakerIndex+1, roundDone=next>=session.baseOrder.length
    updateRoom(r=>({...r,session:r.session?{...r.session,messages:[...r.session.messages,msg],currentSpeakerIndex:roundDone?0:next,phase:roundDone?"clue":"clue",continueVotes:roundDone?{}:r.session.continueVotes,clueRound:roundDone?r.session.clueRound+1:r.session.clueRound}:r.session}))
    setClue("")
    if(roundDone&&atMax) onNavigate("vote")
    else if(roundDone) setShowD(true)
  }

  const skipTurn=()=>{
    if(!isMyTurn)return
    const sys: Message={id:genId(),playerId:"system",playerName:"System",content:`${me?.displayName??"Someone"} skipped.`,type:"system",timestamp:Date.now()}
    advance(sys)
  }

  const voteDecision=(wantVote:boolean)=>{
    const updated={...session.continueVotes,[myPlayerId]:!wantVote}
    const total=Object.keys(updated).length, contCt=Object.values(updated).filter(Boolean).length
    const newPhase: GameSession["phase"]=total>=alive.length?(contCt>total-contCt?"clue":"vote"):"clue"
    updateRoom(r=>({...r,session:r.session?{...r.session,continueVotes:updated,phase:newPhase,currentSpeakerIndex:0,clueRound:total>=alive.length&&contCt>total-contCt?r.session!.clueRound+1:r.session!.clueRound}:r.session}))
    if(total>=alive.length&&newPhase==="vote"){setShowD(false);onNavigate("vote")}
    if(total>=alive.length&&newPhase==="clue")setShowD(false)
  }

  const timerPct=timeLeft!==null&&room.settings.timerSeconds?(timeLeft/room.settings.timerSeconds)*100:null

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }} className="min-h-screen flex flex-col font-['Inter',_sans-serif] bg-[#F8F8F8]">
      <header className="bg-white border-b border-black/8 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn("px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase",me?.role==="imposter"?"bg-foreground text-accent":"bg-foreground text-white")}>{me?.role==="imposter"?"IMPOSTER":"INNOCENT"}</span>
            {me?.role==="innocent"&&<span className="text-xs text-muted-foreground hidden sm:block">Word: <strong className="text-foreground">{session.word}</strong></span>}
          </div>
          <div className="text-xs text-muted-foreground font-mono">Round {session.gameRound} · Clue {session.clueRound}{session.maxClueRounds?`/${session.maxClueRounds}`:""}</div>
        </div>
      </header>
      {me?.role==="innocent"&&<div className="sm:hidden bg-foreground text-white text-center py-2 text-sm"><span className="text-white/40 text-[11px] uppercase tracking-widest">Word: </span><span className="font-bold">{session.word}</span></div>}
      <div className="bg-white border-b border-black/8 flex-shrink-0 overflow-x-auto">
        <div className="max-w-4xl mx-auto px-5 py-3 flex items-center gap-1.5 min-w-max">
          {aliveOrder.map((p,i)=>(
            <div key={p!.id} className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border flex-shrink-0",i===session.currentSpeakerIndex?"bg-foreground text-white border-foreground":i<session.currentSpeakerIndex?"text-muted-foreground border-black/8 line-through":"text-foreground border-black/8")}>
              <span className="text-[10px] opacity-50">{i+1}</span>{p!.displayName}{p!.id===myPlayerId?" ·you":""}
            </div>
          ))}
        </div>
      </div>
      {timerPct!==null&&<div className="h-0.5 bg-secondary flex-shrink-0"><motion.div className={cn("h-full",timerPct<30?"bg-destructive":"bg-accent")} style={{ width:`${timerPct}%` }}/></div>}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
        <div className="space-y-3 py-2">
          {session.messages.length===0&&<div className="text-center py-16"><p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-2">Clue Phase</p><p className="text-sm text-muted-foreground">{isMyTurn?"You go first.": `Waiting for ${curSpeaker?.displayName}…`}</p></div>}
          {session.messages.map(msg=>(
            <motion.div key={msg.id} variants={fadeUp} initial="initial" animate="animate" className={cn("flex",msg.type==="system"?"justify-center":msg.playerId===myPlayerId?"justify-end":"justify-start")}>
              {msg.type==="system"?<span className="text-[11px] text-muted-foreground py-1">{msg.content}</span>:(
                <div className={cn("max-w-[78%] flex flex-col gap-1",msg.playerId===myPlayerId?"items-end":"items-start")}>
                  <span className="text-[10px] text-muted-foreground px-1">{msg.playerName}</span>
                  <div className={cn("px-4 py-3 text-sm",msg.playerId===myPlayerId?"bg-foreground text-white":"bg-white border border-black/8")}>{msg.content}</div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
      {!isMyTurn&&session.phase==="clue"&&<div className="border-t border-black/8 bg-white px-5 py-3 max-w-4xl mx-auto w-full"><div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Waiting for <strong className="text-foreground ml-1">{curSpeaker?.displayName}</strong>…</div></div>}
      {isMyTurn&&session.phase==="clue"&&(
        <div className="border-t border-black/8 bg-white flex-shrink-0">
          <div className="max-w-4xl mx-auto px-4 py-3 flex gap-2 items-center">
            {timeLeft!==null&&<div className={cn("font-['Geist',_sans-serif] font-black text-xl w-8 text-center flex-shrink-0",timeLeft<10?"text-destructive":"text-foreground")}>{timeLeft}</div>}
            <input value={clue} onChange={e=>setClue(e.target.value.slice(0,60))} onKeyDown={e=>{if(e.key==="Enter")submitClue()}} placeholder="Your clue…" autoFocus className="flex-1 px-4 py-3 bg-[#F8F8F8] border border-black/8 text-sm focus:outline-none focus:border-foreground transition-colors"/>
            <Btn variant="primary" size="md" onClick={submitClue} disabled={!clue.trim()}><Send size={15}/></Btn>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showD&&(
          <motion.div variants={fadeIn} initial="initial" animate="animate" exit="exit" className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50">
            <motion.div initial={{ y:40,opacity:0 }} animate={{ y:0,opacity:1 }} exit={{ y:20,opacity:0 }} transition={{ type:"spring",stiffness:400,damping:32 }} className="bg-white w-full max-w-sm p-8">
              <h3 className="font-['Geist',_sans-serif] font-black text-2xl tracking-tight mb-2">Continue or Vote?</h3>
              <p className="text-sm text-muted-foreground mb-5">All {alive.length} players gave clues. {atMax?"Max rounds reached — vote only.":"Another round or vote to eliminate?"}</p>
              <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-5">{Object.keys(session.continueVotes).length}/{alive.length} responded</p>
              {session.continueVotes[myPlayerId]===undefined?(
                <div className="grid grid-cols-2 gap-3">
                  {!atMax&&<Btn variant="outline" size="lg" onClick={()=>voteDecision(false)} className="font-bold">Continue</Btn>}
                  <Btn variant="accent" size="lg" onClick={()=>voteDecision(true)} className={cn("font-bold",atMax&&"col-span-2")}>Vote Now</Btn>
                </div>
              ):(
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-2"><div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Waiting…</div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── VOTE VIEW ────────────────────────────────────────────────────────────────

const VoteView = ({ roomCode, myPlayerId, onNavigate }: { roomCode:string; myPlayerId:string; onNavigate:(v:View)=>void }) => {
  const { room, updateRoom, heartbeat } = useRoom(roomCode)
  const [selected, setSel] = useState<string|null>(null)
  const [submitted, setSub] = useState(false)
  const [timeLeft, setTL]  = useState(30)
  useEffect(()=>{ heartbeat(myPlayerId) },[myPlayerId])
  useEffect(()=>{ const t=setInterval(()=>setTL(s=>Math.max(0,s-1)),1000);return()=>clearInterval(t) },[])
  useEffect(()=>{ if(room?.session?.phase==="results") onNavigate("results") },[room?.session?.phase])
  if(!room?.session)return <Spinner/>
  const session=room.session, alive=room.players.filter(p=>!p.isEliminated)
  const submitVote=()=>{
    if(!selected||submitted)return; setSub(true)
    const updated={...session.votes,[myPlayerId]:selected}
    const allVoted=Object.keys(updated).length>=alive.length||timeLeft<=0
    if(allVoted){
      const tally: Record<string,number>={}
      Object.values(updated).forEach(id=>{tally[id]=(tally[id]??0)+1})
      const max=Math.max(...Object.values(tally)), tops=Object.keys(tally).filter(id=>tally[id]===max)
      const elimId=tops[Math.floor(Math.random()*tops.length)]
      const elim=room.players.find(p=>p.id===elimId), imp=room.players.find(p=>p.id===session.imposterId)
      const result: GameSession["result"]={winner:elimId===session.imposterId?"innocents":"imposter",eliminatedPlayerId:elimId,eliminatedPlayerName:elim?.displayName??"?",imposterName:imp?.displayName??"?",word:session.word,roundsPlayed:session.gameRound}
      updateRoom(r=>({...r,session:r.session?{...r.session,votes:updated,phase:"results",result}:r.session,players:r.players.map(p=>p.id===elimId?{...p,isEliminated:true}:p)}))
      const myIsImp=myPlayerId===session.imposterId, iWon=(result.winner==="innocents"&&!myIsImp)||(result.winner==="imposter"&&myIsImp)
      const pts=iWon?(myIsImp?150:100):0, s=statsDB.get()
      statsDB.patch({gamesPlayed:s.gamesPlayed+1,gamesWon:s.gamesWon+(iWon?1:0),totalPoints:s.totalPoints+pts,imposterWins:s.imposterWins+(myIsImp&&result.winner==="imposter"?1:0),detectiveWins:s.detectiveWins+(!myIsImp&&result.winner==="innocents"?1:0)})
      onNavigate("results")
    } else { updateRoom(r=>({...r,session:r.session?{...r.session,votes:updated}:r.session})) }
  }
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }} className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif]">
      <header className="bg-white border-b border-black/8"><div className="max-w-lg mx-auto px-6 h-14 flex items-center justify-between"><span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">VOTE</span><div className={cn("font-['Geist',_sans-serif] font-black text-2xl tabular-nums",timeLeft<10?"text-destructive":"text-foreground")}>{timeLeft}</div></div></header>
      <div className="h-0.5 bg-secondary"><motion.div className="h-full bg-accent" animate={{ width:`${(timeLeft/30)*100}%` }}/></div>
      <div className="max-w-lg mx-auto px-6 py-12">
        <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">Secret Vote</p>
        <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-3">Who did it?</h2>
        <p className="text-muted-foreground text-sm mb-8">Select who you think is the imposter. Cannot vote yourself.</p>
        <div className="space-y-2 mb-8">
          {alive.filter(p=>p.id!==myPlayerId).map(p=>(
            <button key={p.id} disabled={submitted} onClick={()=>setSel(p.id)} className={cn("w-full p-5 border flex items-center justify-between text-left transition-all duration-150",selected===p.id?"border-foreground bg-foreground text-white":"border-black/8 bg-white hover:border-foreground")}>
              <div className="flex items-center gap-4"><div className={cn("w-9 h-9 flex items-center justify-center text-xs font-bold",selected===p.id?"bg-white text-foreground":"bg-[#F8F8F8]")}>{p.displayName.slice(0,2).toUpperCase()}</div><span className="font-semibold">{p.displayName}</span></div>
              {selected===p.id&&<Check size={16}/>}
            </button>
          ))}
        </div>
        {!submitted?<Btn variant="accent" size="lg" onClick={submitVote} disabled={!selected} className="w-full font-bold">Submit Vote</Btn>:<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-5 border border-dashed border-black/15 bg-white"><div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Waiting…</div>}
        <p className="text-[11px] text-muted-foreground text-center mt-4 tracking-widest uppercase">{Object.keys(session.votes).length}/{alive.length} voted</p>
      </div>
    </motion.div>
  )
}

// ─── RESULTS VIEW ─────────────────────────────────────────────────────────────

const ResultsView = ({ roomCode, myPlayerId, onNavigate }: { roomCode:string; myPlayerId:string; onNavigate:(v:View)=>void }) => {
  const { room, updateRoom, heartbeat } = useRoom(roomCode)
  useEffect(()=>{ heartbeat(myPlayerId) },[myPlayerId])
  if(!room?.session?.result)return <Spinner/>
  const result=room.session.result, myIsImp=myPlayerId===room.session.imposterId
  const iWon=(result.winner==="innocents"&&!myIsImp)||(result.winner==="imposter"&&myIsImp)
  const pts=iWon?(myIsImp?150:100):0
  const tally: Record<string,number>={}
  Object.values(room.session.votes).forEach(id=>{tally[id]=(tally[id]??0)+1})
  const playAgain=()=>{
    const word=pickWord(room.settings.category,room.usedWords)
    const wr=assignRoles(room.players.map(p=>({...p,isEliminated:false,confirmedReveal:false})))
    const imp=wr.find(p=>p.role==="imposter")!
    const session: GameSession={mode:room.mode,word,category:room.settings.category,imposterId:imp.id,gameRound:(room.session?.gameRound??1)+1,clueRound:1,maxClueRounds:room.settings.rounds,phase:"role-reveal",baseOrder:buildOrder(wr,imp.id),currentSpeakerIndex:0,messages:[],votes:{},continueVotes:{},drawStrokes:[],drawChatMessages:[]}
    updateRoom(r=>({...r,status:"playing",players:wr,session,usedWords:[...r.usedWords,word]}))
    onNavigate("role-reveal")
  }
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.25 }} className="min-h-screen font-['Inter',_sans-serif]">
      <div className="min-h-screen grid lg:grid-cols-[1fr_1fr]">
        <div className={cn("flex flex-col justify-center px-10 py-20",result.winner==="innocents"?"bg-foreground text-white":"bg-accent text-white")}>
          <motion.div variants={stagger} initial="initial" animate="animate">
            <motion.p variants={fadeUp} className="text-[11px] tracking-[0.22em] uppercase text-white/25 mb-8">Game Over</motion.p>
            <motion.h1 variants={fadeUp} className="font-['Geist',_sans-serif] font-black leading-[0.88] tracking-tighter mb-8" style={{ fontSize:"clamp(46px,9vw,84px)" }}>
              {result.winner==="innocents"?"INNOCENTS\nWIN":"IMPOSTER\nWINS"}
            </motion.h1>
            <motion.div variants={fadeUp} className="w-12 h-px bg-white/15 mb-8"/>
            <motion.p variants={fadeUp} className="text-sm text-white/50 mb-5">{result.winner==="innocents"?`${result.imposterName} was the imposter.`:`${result.eliminatedPlayerName} was eliminated but was innocent.`}</motion.p>
            <motion.div variants={fadeUp} className="font-['Geist',_sans-serif] font-black text-3xl mb-2">{iWon?"You won.":"You lost."}</motion.div>
            {iWon&&<motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-sm font-bold mb-6">+{pts} pts</motion.div>}
            <motion.div variants={fadeUp} className="flex gap-3 flex-wrap mt-4">
              <Btn variant="white" size="md" onClick={playAgain} className="font-bold text-foreground"><RotateCcw size={15}/>Next Round</Btn>
              <Btn size="md" onClick={()=>{roomDB.delete(room.code);onNavigate("landing")}} className="border border-white/25 bg-transparent text-white hover:bg-white/10 font-bold"><Home size={15}/>End Game</Btn>
            </motion.div>
          </motion.div>
        </div>
        <div className="flex flex-col justify-center px-10 py-20 bg-[#F8F8F8]">
          <motion.div variants={stagger} initial="initial" animate="animate" className="max-w-sm">
            <motion.div variants={fadeUp} className="mb-8"><p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">The Secret Word</p><div className="font-['Geist',_sans-serif] font-black tracking-tight border-b-2 border-foreground pb-4" style={{ fontSize:"clamp(36px,5vw,54px)" }}>{result.word}</div></motion.div>
            <motion.div variants={fadeUp} className="mb-8"><p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-2">The Imposter</p><div className="font-['Geist',_sans-serif] font-black text-2xl text-accent tracking-tight">{result.imposterName}</div></motion.div>
            <motion.div variants={fadeUp} className="mb-8">
              <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-4">Vote Summary</p>
              <div className="space-y-3">
                {room.players.map(p=>{const v=tally[p.id]??0,isElim=p.id===result.eliminatedPlayerId;return(
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium truncate flex items-center gap-1.5">{p.displayName}{isElim&&<span className="text-accent text-[10px] font-bold">✕</span>}</div>
                    <div className="flex-1 bg-secondary h-1"><motion.div className={cn("h-full",isElim?"bg-accent":"bg-foreground")} initial={{ width:0 }} animate={{ width:`${(v/Math.max(1,room.players.length-1))*100}%` }} transition={{ delay:0.4,duration:0.5 }}/></div>
                    <div className="text-sm text-muted-foreground w-4 text-right tabular-nums">{v}</div>
                  </div>
                )})}
              </div>
            </motion.div>
            <motion.div variants={fadeUp}><Btn variant="primary" size="md" onClick={()=>onNavigate("stats")} className="font-semibold"><BarChart2 size={15}/>View Stats</Btn></motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── GAME 2: DRAW THE IMPOSTER ────────────────────────────────────────────────

const PRESET_COLORS = ["#171717","#F25623","#4D4D4D","#3B82F6","#10B981","#F59E0B","#EC4899","#8B5CF6","#ffffff","#dc2626"]

const DrawGameView = ({ roomCode, myPlayerId, onNavigate }: { roomCode:string; myPlayerId:string; onNavigate:(v:View)=>void }) => {
  const { room, updateRoom, heartbeat } = useRoom(roomCode)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing]   = useState(false)
  const [curPath, setCurPath]   = useState<DrawPoint[]>([])
  const [color, setColor]       = useState("#171717")
  const [brush, setBrush]       = useState(4)
  const [chatMsg, setChat]      = useState("")
  const [hovered, setHovered]   = useState<string|null>(null)
  const [showD, setShowD]       = useState(false)
  const lastPt = useRef<DrawPoint|null>(null)

  useEffect(()=>{ heartbeat(myPlayerId) },[myPlayerId])
  useEffect(()=>{ if(room?.session?.phase==="results") onNavigate("results") },[room?.session?.phase])

  const session=room?.session, me=room?.players.find(p=>p.id===myPlayerId)
  const curId=session?.baseOrder[session.currentSpeakerIndex??0]
  const isMyTurn=curId===myPlayerId
  const curSpeaker=room?.players.find(p=>p.id===curId)
  const alive=room?.players.filter(p=>!p.isEliminated)??[]
  const atMax=session?.maxClueRounds!==null&&(session?.clueRound??1)>=(session?.maxClueRounds??Infinity)

  // Redraw canvas from all strokes
  useEffect(()=>{
    const canvas=canvasRef.current, ctx=canvas?.getContext("2d")
    if(!ctx||!canvas)return
    ctx.clearRect(0,0,canvas.width,canvas.height)
    ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height)
    session?.drawStrokes.forEach(stroke=>{
      if(!stroke.points.length)return
      ctx.strokeStyle=stroke.color; ctx.lineWidth=stroke.size; ctx.lineCap="round"; ctx.lineJoin="round"
      if(stroke.points.length===1){ctx.beginPath();ctx.arc(stroke.points[0].x,stroke.points[0].y,stroke.size/2,0,Math.PI*2);ctx.fillStyle=stroke.color;ctx.fill()}
      else{ctx.beginPath();ctx.moveTo(stroke.points[0].x,stroke.points[0].y);stroke.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke()}
    })
  },[session?.drawStrokes.length,session?.drawStrokes.map(s=>s.points.length).join(",")])

  const getPt=(e: React.MouseEvent<HTMLCanvasElement>|React.TouchEvent<HTMLCanvasElement>): DrawPoint=>{
    const canvas=canvasRef.current!, rect=canvas.getBoundingClientRect()
    const sx=canvas.width/rect.width, sy=canvas.height/rect.height
    const cx="touches"in e?e.touches[0]?.clientX??0:e.clientX
    const cy="touches"in e?e.touches[0]?.clientY??0:e.clientY
    return{x:(cx-rect.left)*sx,y:(cy-rect.top)*sy}
  }

  const startDraw=(e: React.MouseEvent<HTMLCanvasElement>|React.TouchEvent<HTMLCanvasElement>)=>{
    if(!isMyTurn)return; e.preventDefault()
    const pt=getPt(e); setDrawing(true); setCurPath([pt]); lastPt.current=pt
    const ctx=canvasRef.current?.getContext("2d")
    if(ctx){ctx.beginPath();ctx.arc(pt.x,pt.y,brush/2,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
  }

  const doDraw=(e: React.MouseEvent<HTMLCanvasElement>|React.TouchEvent<HTMLCanvasElement>)=>{
    if(!drawing||!isMyTurn)return; e.preventDefault()
    const pt=getPt(e), prev=lastPt.current; if(!prev)return
    const ctx=canvasRef.current?.getContext("2d")
    if(ctx){ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(pt.x,pt.y);ctx.strokeStyle=color;ctx.lineWidth=brush;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke()}
    setCurPath(p=>[...p,pt]); lastPt.current=pt
  }

  const endDraw=()=>{
    if(!drawing)return; setDrawing(false)
    if(curPath.length>0){
      const stroke: DrawStroke={id:genId(),playerId:myPlayerId,playerName:me?.displayName??"",color,size:brush,points:curPath}
      updateRoom(r=>({...r,session:r.session?{...r.session,drawStrokes:[...r.session.drawStrokes,stroke]}:r.session}))
    }
    setCurPath([]); lastPt.current=null
  }

  const endTurn=()=>{
    if(!isMyTurn||!session)return
    const next=session.currentSpeakerIndex+1, roundDone=next>=session.baseOrder.length
    updateRoom(r=>({...r,session:r.session?{...r.session,currentSpeakerIndex:roundDone?0:next,phase:roundDone?"clue":"clue",continueVotes:roundDone?{}:r.session.continueVotes,clueRound:roundDone?r.session.clueRound+1:r.session.clueRound}:r.session}))
    if(roundDone&&atMax) onNavigate("vote")
    else if(roundDone) setShowD(true)
  }

  const hoverCheck=(e: React.MouseEvent<HTMLCanvasElement>)=>{
    if(!session)return
    const pt=getPt(e)
    for(const stroke of [...session.drawStrokes].reverse()){
      for(const sp of stroke.points){
        if(Math.hypot(sp.x-pt.x,sp.y-pt.y)<stroke.size+8){setHovered(stroke.playerName);return}
      }
    }
    setHovered(null)
  }

  const sendChat=()=>{
    if(!chatMsg.trim())return
    const msg: Message={id:genId(),playerId:myPlayerId,playerName:me?.displayName??"",content:chatMsg.trim(),type:"chat",timestamp:Date.now()}
    updateRoom(r=>({...r,session:r.session?{...r.session,drawChatMessages:[...r.session.drawChatMessages,msg]}:r.session}))
    setChat("")
  }

  const voteDecision=(wantVote:boolean)=>{
    if(!session)return
    const updated={...session.continueVotes,[myPlayerId]:!wantVote}
    const total=Object.keys(updated).length, contCt=Object.values(updated).filter(Boolean).length
    const newPhase: GameSession["phase"]=total>=alive.length?(contCt>total-contCt?"clue":"vote"):"clue"
    updateRoom(r=>({...r,session:r.session?{...r.session,continueVotes:updated,phase:newPhase,currentSpeakerIndex:0}:r.session}))
    if(total>=alive.length&&newPhase==="vote"){setShowD(false);onNavigate("vote")}
    if(total>=alive.length&&newPhase==="clue")setShowD(false)
  }

  if(!room||!session)return <Spinner/>

  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }} className="h-screen flex flex-col font-['Inter',_sans-serif] bg-[#F8F8F8] overflow-hidden">
      <header className="bg-white border-b border-black/8 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn("px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase",me?.role==="imposter"?"bg-foreground text-accent":"bg-foreground text-white")}>{me?.role==="imposter"?"IMPOSTER":"INNOCENT"}</span>
            {me?.role==="innocent"&&<span className="text-xs text-muted-foreground hidden sm:block">Word: <strong className="text-foreground">{session.word}</strong></span>}
          </div>
          <span className="text-[11px] text-muted-foreground tracking-widest uppercase">Draw · Round {session.gameRound}</span>
        </div>
      </header>
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-3">
          {/* Speaking order */}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
            {session.baseOrder.map((id,i)=>{const p=room.players.find(x=>x.id===id);return(
              <div key={id} className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border flex-shrink-0",i===session.currentSpeakerIndex?"bg-foreground text-white":i<session.currentSpeakerIndex?"text-muted-foreground border-black/8 line-through":"text-foreground border-black/8")}>
                <Pencil size={9}/>{p?.displayName??id}{id===myPlayerId?" ·you":""}
              </div>
            )})}
          </div>
          {/* Canvas */}
          <div className="relative flex-1 bg-white border border-black/8 overflow-hidden min-h-0">
            <canvas ref={canvasRef} width={1200} height={800}
              onMouseDown={startDraw} onMouseMove={e=>{doDraw(e);hoverCheck(e)}} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={doDraw} onTouchEnd={endDraw}
              style={{ touchAction:"none",cursor:isMyTurn?"crosshair":"default",width:"100%",height:"100%" }}
              className="block"/>
            {hovered&&<div className="absolute top-3 left-3 px-2.5 py-1 bg-foreground text-white text-xs font-semibold pointer-events-none">{hovered}</div>}
            {!isMyTurn&&<div className="absolute bottom-3 left-3 right-3 flex justify-center"><div className="bg-white/90 border border-black/10 px-4 py-2 text-sm text-muted-foreground flex items-center gap-2"><div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/><strong className="text-foreground">{curSpeaker?.displayName}</strong> is drawing…</div></div>}
          </div>
          {/* Controls */}
          <div className="bg-white border border-black/8 p-3 flex flex-wrap items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1 flex-wrap">
              {PRESET_COLORS.map(c=><button key={c} onClick={()=>setColor(c)} className={cn("w-6 h-6 border-2 transition-transform",color===c?"border-foreground scale-125":"border-transparent hover:scale-110")} style={{ backgroundColor:c }}/>)}
              <label className="w-6 h-6 border border-border overflow-hidden cursor-pointer relative">
                <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"/>
                <div className="w-full h-full flex items-center justify-center pointer-events-none"><Palette size={11} className="text-muted-foreground"/></div>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setBrush(b=>Math.max(1,b-1))} className="w-6 h-6 border border-border flex items-center justify-center hover:border-foreground"><Minus size={10}/></button>
              <span className="text-xs text-muted-foreground w-4 text-center">{brush}</span>
              <button onClick={()=>setBrush(b=>Math.min(30,b+1))} className="w-6 h-6 border border-border flex items-center justify-center hover:border-foreground text-lg leading-none pb-0.5">+</button>
            </div>
            {isMyTurn&&<Btn variant="accent" size="sm" onClick={endTurn} className="font-bold ml-auto">Done Drawing <ChevronRight size={13}/></Btn>}
          </div>
        </div>
        {/* Chat */}
        <div className="w-60 flex-shrink-0 flex flex-col bg-white border-l border-black/8">
          <div className="p-3 border-b border-black/8"><p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground font-semibold">Chat</p></div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {session.drawChatMessages.map(msg=>(
              <div key={msg.id} className={cn("flex flex-col gap-0.5",msg.playerId===myPlayerId?"items-end":"items-start")}>
                <span className="text-[10px] text-muted-foreground">{msg.playerName}</span>
                <div className={cn("px-2.5 py-1.5 text-xs max-w-[92%]",msg.playerId===myPlayerId?"bg-foreground text-white":"bg-[#F8F8F8] text-foreground")}>{msg.content}</div>
              </div>
            ))}
          </div>
          <div className="p-2.5 border-t border-black/8 flex gap-1.5">
            <input value={chatMsg} onChange={e=>setChat(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendChat()}} placeholder="Chat…" className="flex-1 min-w-0 px-2.5 py-1.5 bg-[#F8F8F8] border border-black/8 text-xs focus:outline-none focus:border-foreground"/>
            <button onClick={sendChat} className="px-2.5 bg-foreground text-white hover:opacity-80 transition-opacity"><Send size={11}/></button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showD&&(
          <motion.div variants={fadeIn} initial="initial" animate="animate" exit="exit" className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale:0.9,opacity:0 }} animate={{ scale:1,opacity:1 }} exit={{ scale:0.9,opacity:0 }} className="bg-white w-full max-w-sm p-8">
              <h3 className="font-['Geist',_sans-serif] font-black text-2xl tracking-tight mb-2">Draw More or Vote?</h3>
              <p className="text-sm text-muted-foreground mb-5">Everyone drew once. {atMax?"Max rounds — vote only.":"Another round or vote now?"}</p>
              <p className="text-[11px] tracking-widest uppercase text-muted-foreground mb-5">{Object.keys(session.continueVotes).length}/{alive.length} responded</p>
              {session.continueVotes[myPlayerId]===undefined?(
                <div className="grid grid-cols-2 gap-3">
                  {!atMax&&<Btn variant="outline" size="lg" onClick={()=>voteDecision(false)} className="font-bold">Draw More</Btn>}
                  <Btn variant="accent" size="lg" onClick={()=>voteDecision(true)} className={cn("font-bold",atMax&&"col-span-2")}>Vote</Btn>
                </div>
              ):(
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-2"><div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse"/>Waiting…</div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── STATS VIEW ───────────────────────────────────────────────────────────────

const StatsView = ({ onNavigate }: { onNavigate:(v:View)=>void }) => {
  const stats=statsDB.get()
  const winRate=stats.gamesPlayed>0?Math.round((stats.gamesWon/stats.gamesPlayed)*100):0
  return (
    <motion.div variants={fadeIn} initial="initial" animate="animate" transition={{ duration:0.2 }} className="min-h-screen bg-[#F8F8F8] font-['Inter',_sans-serif]">
      <header className="bg-white border-b border-black/8">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={()=>onNavigate("landing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"><Home size={14}/>Home</button>
          <span className="font-['Geist',_sans-serif] font-black text-sm tracking-tight">YOUR STATS</span>
          <Btn variant="accent" size="sm" onClick={()=>onNavigate("create")} className="font-bold">Play</Btn>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-6 py-14">
        <p className="text-[11px] tracking-[0.22em] uppercase text-muted-foreground mb-3">Local Records</p>
        <h2 className="font-['Geist',_sans-serif] font-black text-[40px] tracking-tight leading-none mb-12">Your Stats</h2>
        {stats.gamesPlayed===0?(
          <div className="text-center py-24">
            <div className="font-['Geist',_sans-serif] font-black text-[80px] text-secondary leading-none mb-4">0</div>
            <p className="text-muted-foreground text-sm mb-8">No games yet.</p>
            <Btn variant="accent" size="lg" onClick={()=>onNavigate("create")} className="font-bold">Create a Room <ArrowRight size={17}/></Btn>
          </div>
        ):(
          <>
            <motion.div variants={stagger} initial="initial" animate="animate" className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              {[{l:"Total Points",v:stats.totalPoints,acc:true},{l:"Games Played",v:stats.gamesPlayed,acc:false},{l:"Win Rate",v:`${winRate}%`,acc:false},{l:"Imposter Wins",v:stats.imposterWins,acc:false},{l:"Detective Wins",v:stats.detectiveWins,acc:false},{l:"Games Hosted",v:stats.gamesHosted,acc:false}].map(({l,v,acc})=>(
                <motion.div key={l} variants={fadeUp} className={cn("p-5 border",acc?"bg-foreground text-white border-foreground":"bg-white border-black/8")}>
                  <div className={cn("font-['Geist',_sans-serif] font-black text-4xl mb-1 tracking-tight",acc?"text-accent":"text-foreground")}>{v}</div>
                  <div className={cn("text-[10px] tracking-widest uppercase font-semibold",acc?"text-white/40":"text-muted-foreground")}>{l}</div>
                </motion.div>
              ))}
            </motion.div>
            <div className="bg-white border border-black/8 p-5 mb-4">
              <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-3">Points System</p>
              <div className="flex gap-6 mt-2">
                <div className="flex items-center gap-2 text-sm"><div className="w-3 h-3 bg-accent"/><span>Imposter Win = <strong>150 pts</strong></span></div>
                <div className="flex items-center gap-2 text-sm"><div className="w-3 h-3 bg-foreground"/><span>Innocent Win = <strong>100 pts</strong></span></div>
              </div>
            </div>
            <div className="bg-white border border-black/8 p-5">
              <p className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-4">Breakdown</p>
              {[{l:"Imposter Wins",v:stats.imposterWins,c:"bg-accent"},{l:"Detective Wins",v:stats.detectiveWins,c:"bg-foreground"}].map(({l,v,c})=>(
                <div key={l} className="mb-4">
                  <div className="flex justify-between text-sm mb-2 font-medium"><span>{l}</span><span className="text-muted-foreground">{v}</span></div>
                  <div className="h-1.5 bg-secondary"><motion.div className={cn("h-full",c)} initial={{ width:0 }} animate={{ width:`${stats.gamesPlayed>0?(v/stats.gamesPlayed)*100:0}%` }} transition={{ delay:0.2,duration:0.5 }}/></div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView]         = useState<View>("landing")
  const [roomCode, setRC]       = useState<string|null>(null)
  const [myPlayerId, setMPID]   = useState<string|null>(null)
  const [prefillCode, setPFC]   = useState<string|undefined>()
  const [selectedGame, setSG]   = useState<GameMode|undefined>()

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search), join=p.get("join")
    if(join){setPFC(join.toUpperCase());setView("join");window.history.replaceState({},"",window.location.pathname)}
  },[])

  const navigate=(v: View)=>{setView(v);window.scrollTo({top:0})}
  const enterRoom=(code: string,pid: string)=>{setRC(code);setMPID(pid)}

  // From landing game card → skip game selection in CreateView
  const selectGame=(mode: GameMode)=>{setSG(mode);setView("create");window.scrollTo({top:0})}

  return (
    <ErrorBoundary>
      <Toaster position="top-center" toastOptions={{ style:{background:"#171717",color:"#F8F8F8",border:"none",borderRadius:"0",fontFamily:"Inter,sans-serif",fontSize:"13px"} }}/>
      {/*
        Each view gets its OWN motion.div with its own key.
        This prevents the exiting wrapper from re-rendering with the NEW view's
        state (which caused #310 "Rendered more hooks than during previous render").
        AnimatePresence without mode="wait" lets enter/exit overlap briefly — safe.
      */}
      <div className="font-['Inter',_sans-serif] relative min-h-screen">
        <AnimatePresence>
          {view==="landing" && (
            <motion.div key="landing" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <LandingView onNavigate={navigate} onSelectGame={selectGame}/>
            </motion.div>
          )}
          {view==="how-to-play" && (
            <motion.div key="how-to-play" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <HowToPlayView onNavigate={navigate}/>
            </motion.div>
          )}
          {view==="create" && (
            <motion.div key="create" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <CreateView onNavigate={navigate} onEnter={enterRoom} initialMode={selectedGame}/>
            </motion.div>
          )}
          {view==="join" && (
            <motion.div key="join" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <JoinView onNavigate={navigate} onEnter={enterRoom} prefillCode={prefillCode}/>
            </motion.div>
          )}
          {view==="stats" && (
            <motion.div key="stats" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <StatsView onNavigate={navigate}/>
            </motion.div>
          )}
          {view==="lobby" && roomCode && myPlayerId && (
            <motion.div key="lobby" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <LobbyView roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>
            </motion.div>
          )}
          {view==="role-reveal" && roomCode && myPlayerId && (
            <motion.div key="role-reveal" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <RoleRevealView roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>
            </motion.div>
          )}
          {view==="game" && roomCode && myPlayerId && (
            <motion.div key="game" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <GameView roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>
            </motion.div>
          )}
          {view==="draw-game" && roomCode && myPlayerId && (
            <motion.div key="draw-game" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <DrawGameView roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>
            </motion.div>
          )}
          {view==="vote" && roomCode && myPlayerId && (
            <motion.div key="vote" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <VoteView roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>
            </motion.div>
          )}
          {view==="results" && roomCode && myPlayerId && (
            <motion.div key="results" {...fadeIn} transition={{ duration:0.15 }} style={{ position:"absolute", inset:0, minHeight:"100vh" }}>
              <ResultsView roomCode={roomCode} myPlayerId={myPlayerId} onNavigate={navigate}/>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  )
}
