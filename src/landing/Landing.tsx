import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ClarixNavigation } from '../components/navigation/ClarixNavigation';
import { ROBOTS } from '../utils/assets';
import { clamp, ease, show, win } from './anim';
import { useRafScroll } from './useRafScroll';
import '../styles/landing.css';

/* ---------------- robot backdrop (scroll-driven frames) ---------------- */
const FRAMES = [ROBOTS[0], ROBOTS[1], ROBOTS[2], ROBOTS[3], ROBOTS[1]];
const CUTS = [0.12, 0.43, 0.77];

function RobotBackdrop() {
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  useRafScroll(() => {
    const story = document.getElementById('story');
    const pin = document.getElementById('pinnacle');
    if (!story || !pin) return;
    const vh = window.innerHeight;
    const y = window.scrollY;
    const p = clamp((y - story.offsetTop) / (story.offsetHeight - vh), 0, 1);
    const endIn = clamp((y - (pin.offsetTop + pin.offsetHeight - vh * 0.9)) / (vh * 0.9), 0, 1);
    for (let i = 0; i < 4; i++) {
      const lo = i > 0 ? clamp((p - (CUTS[i - 1] - 0.035)) / 0.07, 0, 1) : 1;
      const hi = i < 3 ? 1 - clamp((p - (CUTS[i] - 0.035)) / 0.07, 0, 1) : 1;
      const img = imgs.current[i];
      if (!img) continue;
      img.style.opacity = String(Math.min(lo, hi) * (1 - endIn));
      img.style.transform = `scale(${1.02 + p * 0.06})`;
    }
    const end = imgs.current[4];
    if (end) { end.style.opacity = String(endIn); end.style.transform = `translateY(${(1 - endIn) * -3}%)`; }
  });
  return (
    <div id="fig" aria-hidden="true">
      {FRAMES.map((src, i) => <img key={i} ref={(el) => { imgs.current[i] = el; }} alt="" src={src} />)}
    </div>
  );
}

/* ---------------- story ---------------- */
const WORDS = [{ text: 'Tools', a: 0.46, b: 0.6 }, { text: 'Skill', a: 0.57, b: 0.71 }, { text: 'growth', a: 0.68, b: 0.82 }];
const STATS = [
  { value: '200+', label: 'universes created', note: '*or maybe more', aria: 'See universes' },
  { value: '97%', label: 'clients trust us for their next project', aria: 'See client results' },
  { value: '10X', label: 'team turnover', note: '*or maybe more', aria: 'See team turnover' },
];

function Story() {
  const section = useRef<HTMLElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  const meta = useRef<HTMLDivElement>(null);
  const h2 = useRef<HTMLHeadingElement>(null);
  const h3 = useRef<HTMLHeadingElement>(null);
  const clients = useRef<HTMLDivElement>(null);
  const logos = useRef<HTMLDivElement>(null);
  const stats = useRef<HTMLDivElement>(null);
  const words = useRef<(HTMLParagraphElement | null)[]>([]);

  useRafScroll(() => {
    const s = section.current;
    if (!s) return;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const p = clamp((window.scrollY - s.offsetTop) / (s.offsetHeight - vh), 0, 1);
    const intro = win(p, 0, 0, 0.07, 0.12);
    show(h1.current, intro, -30);
    show(meta.current, intro, 20);
    show(h2.current, win(p, 0.1, 0.14, 0.2, 0.24), 30);
    show(clients.current, win(p, 0.22, 0.26, 0.32, 0.36), 20);
    if (logos.current) logos.current.style.transform = `translateX(${-(p - 0.22) * vw * 2.2}px)`;
    show(h3.current, win(p, 0.34, 0.38, 0.42, 0.46), 30);
    WORDS.forEach((w, wi) => {
      const el = words.current[wi];
      if (!el) return;
      const t = clamp((p - w.a) / (w.b - w.a), 0, 1);
      const vis = t > 0 && t < 1 ? Math.pow(Math.sin(Math.PI * t), 0.6) : 0;
      const scatter = 1 - clamp(vis * 1.5, 0, 1);
      el.style.opacity = vis > 0.02 ? '1' : '0';
      el.style.transform = `translate(${(1 - 2 * t) * vw * 0.42}px,-50%)`;
      Array.from(el.children).forEach((node, k) => {
        const letter = node as HTMLElement;
        letter.style.transform = `translateY(${(k % 2 ? 1 : -1) * scatter * vh * 0.16 * (1 + k * 0.15)}px)`;
        letter.style.filter = scatter > 0.02 ? `blur(${scatter * 14}px)` : 'none';
      });
    });
    show(stats.current, ease(clamp((p - 0.82) / 0.1, 0, 1)), 160);
  });

  return (
    <section id="story" ref={section} aria-label="Introduction">
      <div className="view">
        <h1 className="blk pad" id="h1" ref={h1}>The clarity your business <b>has been missing</b></h1>
        <div className="blk pad" id="meta" ref={meta}>
          <div className="tags"><span>(A)</span><span>[001 /004]</span></div>
          <p>Clarix is where your boldest ideas meet their full potential. We give you the tools not just to see the future.</p>
          <Link className="pill" to="/overview">Open console</Link>
        </div>
        <h2 className="blk pad" id="h2" ref={h2}>Empowering visionaries to shape tomorrow’s <b>digital landscapes</b></h2>
        <div className="blk" id="clients" ref={clients}>
          <small>Our clients</small><hr />
          <div className="logos" ref={logos}>
            <i className="dr">dribbble</i><i className="eb">ebay</i><i>◎ Instagram</i><i>twitter</i>
            <i>Discord</i><i>facebook</i><i className="sn">Snapchat</i><i>Spotify</i>
          </div>
        </div>
        <h2 className="blk pad" id="h3" ref={h3}>Redefining digital experiences through art and <b>technology</b></h2>
        {WORDS.map((w, i) => (
          <p key={w.text} className="w" aria-label={w.text} ref={(el) => { words.current[i] = el; }}>
            {Array.from(w.text).map((ch, k) => <span key={k} aria-hidden="true">{ch}</span>)}
          </p>
        ))}
        <div className="blk glass" id="stats" ref={stats}>
          <div className="sl"><h2>Every project is a fusion of strategy, creativity and passion</h2><p>Innovation philosophy</p></div>
          <div className="sr">
            {STATS.map((s) => (
              <div className="st" key={s.value}>
                <strong>{s.value}</strong>
                <span>{s.label}{s.note && <small>{s.note}</small>}</span>
                <button className="circ" type="button" aria-label={s.aria}>→</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- unlock ---------------- */
function Unlock() {
  const ut = useRef<HTMLDivElement>(null);
  useRafScroll(() => {
    const el = ut.current;
    if (!el) return;
    const vh = window.innerHeight;
    const r = el.getBoundingClientRect();
    const v = ease(clamp((vh * 0.95 - r.top) / (vh * 0.35), 0, 1)) * ease(clamp((r.bottom - vh * 0.05) / (vh * 0.3), 0, 1));
    show(el, v, 24);
  });
  return (
    <section id="unlock">
      <div className="ut" ref={ut}>
        <h2>Clarix unlocks a faster, <b>smarter way to create</b></h2>
        <div className="rule" />
        <p>With just a prompt, you can bring any idea to life instantly, cut down production time, eliminate repetitive tasks, and stay fully in control of your creative vision.</p>
        <Link className="pill" to="/agent">Launch now</Link>
      </div>
    </section>
  );
}

/* ---------------- pinnacle (particle logo) ---------------- */
interface Particle { tx: number; ty: number; sx: number; sy: number; c: string; z: number; ox: number; oy: number }
interface Dust { x: number; y: number; r: number; c: string; s: number; a: number }

function Pinnacle() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const progress = useRef(0);

  useRafScroll(() => {
    const s = section.current;
    if (!s) return;
    progress.current = clamp((window.scrollY - s.offsetTop) / (s.offsetHeight - window.innerHeight), 0, 1);
  });

  useEffect(() => {
    const cv = canvas.current;
    const sec = section.current;
    const cx = cv?.getContext('2d');
    if (!cv || !sec || !cx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const still = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    let W = 0, H = 0;
    let P: Particle[] = [];
    let dust: Dust[] = [];
    let mx = -999, my = -999;
    let visible = false, running = false, raf = 0, alive = true;

    function build() {
      if (!cv || !cx) return;
      W = cv.clientWidth; H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = W * dpr; cv.height = H * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const o = document.createElement('canvas');
      o.width = W; o.height = H;
      const g = o.getContext('2d');
      if (!g) return;
      const fs = Math.min(W * 0.15, H * 0.3);
      const ic = fs * 1.05;
      g.font = `400 ${fs}px 'Sofia Sans',Arial,sans-serif`;
      const tw = g.measureText('Clarix').width;
      const total = ic + fs * 0.35 + tw;
      const x0 = (W - total) / 2;
      const cy = H * 0.5;
      const gr = g.createLinearGradient(x0, 0, x0 + total, 0);
      gr.addColorStop(0, '#4f74ff'); gr.addColorStop(0.45, '#9b5cf0'); gr.addColorStop(1, '#ff4d86');
      g.strokeStyle = gr; g.lineWidth = ic * 0.11;
      const u = ic / 2.3;
      ([[0, 0], [1, 0], [0, 1], [1, 1]] as const).forEach(([qx, qy]) => {
        g.beginPath();
        g.ellipse(x0 + ic * 0.28 + qx * u * 1.05, cy - ic * 0.5 + ic * 0.28 + qy * u * 1.05, u * 0.52, u * 0.52, 0, 0, 6.283);
        g.stroke();
      });
      g.fillStyle = gr; g.textBaseline = 'alphabetic';
      g.fillText('Clarix', x0 + ic + fs * 0.35, cy + fs * 0.3);
      const d = g.getImageData(0, 0, W, H).data;
      const step = Math.max(2, Math.round(W / 480));
      P = [];
      for (let j = 0; j < H; j += step) {
        for (let i = 0; i < W; i += step) {
          const k = (j * W + i) * 4;
          if (d[k + 3] > 120) {
            const ang = Math.random() * 6.283;
            const rr = Math.pow(Math.random(), 0.5) * Math.max(W, H) * 0.6;
            P.push({ tx: i, ty: j, sx: W / 2 + Math.cos(ang) * rr * 1.1, sy: H / 2 + Math.sin(ang) * rr * 0.55, c: `rgb(${d[k]},${d[k + 1]},${d[k + 2]})`, z: (Math.random() * 0.5 + 0.8) * step * 0.7, ox: 0, oy: 0 });
          }
        }
      }
      const colors = ['#e4285a', '#3b6bff', '#b138e8'];
      dust = Array.from({ length: 46 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2 + 1, c: colors[i % 3], s: Math.random() * 0.6 + 0.2, a: Math.random() * 6.28 }));
    }

    function draw(t: number) {
      if (!cx) return;
      cx.clearRect(0, 0, W, H);
      const pp = progress.current;
      const a = still ? 1 : ease(clamp((pp - 0.05) / 0.5, 0, 1));
      const disp = ease(clamp((pp - 0.9) / 0.1, 0, 1));
      for (let n = 0; n < P.length; n++) {
        const q = P[n];
        let x = q.sx + (q.tx - q.sx) * a;
        let y = q.sy + (q.ty - q.sy) * a;
        if (a > 0.98 && !still) { x += Math.sin(t / 900 + n) * 0.5; y += Math.cos(t / 1100 + n) * 0.5; }
        const dx = x - mx, dy = y - my, dd = dx * dx + dy * dy;
        if (dd < 7000) { const f = (1 - dd / 7000) * 22, l = Math.sqrt(dd) || 1; q.ox += (dx / l * f - q.ox) * 0.2; q.oy += (dy / l * f - q.oy) * 0.2; }
        else { q.ox *= 0.9; q.oy *= 0.9; }
        cx.fillStyle = q.c;
        cx.fillRect(x + q.ox, y + q.oy - disp * 40, q.z, q.z);
      }
      dust.forEach((d) => {
        const o = still ? 0 : Math.sin((t / 1500) * d.s + d.a) * 10;
        cx.fillStyle = d.c; cx.beginPath(); cx.arc(d.x + o, d.y + o * 0.6, d.r, 0, 6.283); cx.fill();
      });
    }

    function loop(t?: number) {
      if (!alive) return;
      if (!visible && !still) { running = false; return; }
      draw(t ?? 0);
      if (!still) raf = requestAnimationFrame(loop);
    }

    const onMove = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; };
    const onLeave = () => { mx = my = -999; };
    const onResize = () => { build(); if (still) draw(0); };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !running) { running = true; loop(); }
    }, { rootMargin: '100px' });
    io.observe(sec);
    const fontsReady: Promise<unknown> = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => { if (alive) { build(); if (still) draw(0); } });
    return () => {
      alive = false; cancelAnimationFrame(raf); io.disconnect();
      cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <section id="pinnacle" ref={section}>
      <div className="pview">
        <canvas id="sparks" ref={canvas} aria-label="Clarix logo assembled from particles" />
        <h2>The pinnacle of generative art</h2>
        <div className="tag"><span>(A)</span><span>[001 /004]</span></div>
        <p className="pl">Experience a new paradigm where your imagination meets our computational engine. Build entire worlds without writing a single line of code.</p>
        <p className="pr">Designed for <b>visionaries</b></p>
      </div>
    </section>
  );
}

/* ---------------- future + footer ---------------- */
const COLUMNS = [
  { title: 'Products', links: ['Studio', 'Engine', 'Enterprise'] },
  { title: 'Learn', links: ['Blog', 'Research', 'Documentation'] },
  { title: 'About', links: ['Company', 'Careers', 'Contact'] },
  { title: 'Legal', links: ['Terms & Conditions', 'Privacy Policy'] },
];

function Future() {
  const [message, setMessage] = useState('');
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // BACKEND: send the address to your own mailing service. Nothing is transmitted from this prototype.
    setMessage('You’re on the list. We’ll be in touch.');
    e.currentTarget.reset();
  };
  return (
    <section id="future">
      <h3>The future of <b>digital art</b></h3>
      <footer>
        <div>
          <h4>Clarix</h4>
          <p className="sub">Sign up to receive updates.</p>
          <form onSubmit={onSubmit}>
            <input type="email" name="email" placeholder="Enter your email" aria-label="Email address" required />
            <button className="submit" type="submit">Submit</button>
          </form>
          <p id="thanks" role="status">{message}</p>
          <p className="fine">By subscribing you agree to our Privacy Policy and provide consent to receive updates from our company.</p>
        </div>
        <div className="cols">
          {COLUMNS.map((c) => (
            <div key={c.title}><b>{c.title}</b>{c.links.map((l) => <a key={l} href="#future" onClick={(e) => e.preventDefault()}>{l}</a>)}</div>
          ))}
        </div>
        <div className="copy">© 2026 Clarix. All rights reserved.</div>
      </footer>
    </section>
  );
}

/* ---------------- page ---------------- */
export default function Landing() {
  useEffect(() => { document.title = 'Clarix — AI Harness Agent'; }, []);
  return (
    <>
      <ClarixNavigation />
      <div className="landing">
      <RobotBackdrop />
      <header className="top">
        <nav aria-label="Main">
          <Link to="/">Home ↗</Link>
          <Link to="/overview">Console ↗</Link>
          <Link to="/architecture">Architecture ↗</Link>
          <Link to="/settings">Settings ↗</Link>
        </nav>
      </header>
      <main>
        <Story />
        <Unlock />
        <Pinnacle />
        <Future />
      </main>
      </div>
    </>
  );
}
