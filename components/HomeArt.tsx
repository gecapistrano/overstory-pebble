/* Procedural vector illustrations for listings (exterior + interiors).
   Real photos (MLS / agent uploads) replace these when present. */
import type { Listing } from "@/lib/types";

type P = { wall: string; roof: string; trim: string; accent: string; glass: string; sky: string; floor: string; ground: string };
const PAL: Record<string, P> = {
  gothic: { wall: "#8A8682", roof: "#3E3C42", trim: "#2B2A2E", accent: "#6E7F5A", glass: "#C9D3D9", sky: "#E3E7EC", floor: "#5B4636", ground: "#9DB08A" },
  minimalist: { wall: "#F5F3EF", roof: "#E3DED7", trim: "#2A2A2A", accent: "#C9A27A", glass: "#BFD8E2", sky: "#EAF2F6", floor: "#D9C3A3", ground: "#B9C9A6" },
  artsy: { wall: "#E07A55", roof: "#2F7F7F", trim: "#F2C14E", accent: "#3B5BA9", glass: "#CFE6EA", sky: "#FDEBDD", floor: "#C99B6D", ground: "#A9C28F" },
  "modern farmhouse": { wall: "#FBFAF7", roof: "#2B2B2B", trim: "#1F1F1F", accent: "#B08455", glass: "#C8DCE4", sky: "#E7EFF3", floor: "#C8A57D", ground: "#A8C090" },
  colonial: { wall: "#A9473A", roof: "#4A4A50", trim: "#F5EFE3", accent: "#2F3B33", glass: "#CAD8DE", sky: "#E9EEF2", floor: "#8B5E3C", ground: "#9FB989" },
  victorian: { wall: "#A9BFA1", roof: "#6C5058", trim: "#F7EDE8", accent: "#E8B9B9", glass: "#D3E1E4", sky: "#F4E8EA", floor: "#A07650", ground: "#A3BE8C" },
  industrial: { wall: "#8E4B3A", roof: "#3A3A3E", trim: "#2B2B2E", accent: "#D9A05B", glass: "#A9C2CF", sky: "#E6EAEE", floor: "#7A7570", ground: "#A6B596" },
  craftsman: { wall: "#7D7F55", roof: "#5A4636", trim: "#EFE6D2", accent: "#B5683C", glass: "#CBD9DC", sky: "#F1ECE2", floor: "#9A6B43", ground: "#A6BC8B" },
  contemporary: { wall: "#5E6670", roof: "#3C424A", trim: "#FFFFFF", accent: "#8A5E3C", glass: "#B5D2DE", sky: "#E8EFF4", floor: "#B48A62", ground: "#A9BF97" },
  scandinavian: { wall: "#F3EEE6", roof: "#3D3D3D", trim: "#2F2F2F", accent: "#D2B48C", glass: "#CFE2EA", sky: "#EEF3F6", floor: "#E2CDAA", ground: "#B5C9A2" },
  land: { wall: "#fff", roof: "#fff", trim: "#6B5A45", accent: "#E9C46A", glass: "#fff", sky: "#F6E7DA", floor: "#fff", ground: "#9CBF7E" },
};

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function Tree({ x, y, s = 1, c = "#7FA06A" }: { x: number; y: number; s?: number; c?: string }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x={-3} y={-6} width={6} height={26} rx={2} fill="#7A5A3E" />
      <circle cx={0} cy={-22} r={20} fill={c} />
      <circle cx={-11} cy={-12} r={13} fill={shade(c, -0.12)} />
      <circle cx={10} cy={-30} r={11} fill={shade(c, 0.12)} />
    </g>
  );
}

function Win({ x, y, w, h, p, arch = false, round = false, grid = 1 }: { x: number; y: number; w: number; h: number; p: P; arch?: boolean; round?: boolean; grid?: number }) {
  if (round) return <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} fill={p.glass} stroke={p.trim} strokeWidth={4} />;
  const d = arch ? `M${x},${y + h} L${x},${y + w * 0.5} Q${x + w / 2},${y - w * 0.5} ${x + w},${y + w * 0.5} L${x + w},${y + h} Z` : "";
  return (
    <g>
      {arch ? <path d={d} fill={p.glass} stroke={p.trim} strokeWidth={3} /> : <rect x={x} y={y} width={w} height={h} fill={p.glass} stroke={p.trim} strokeWidth={3} rx={1} />}
      <line x1={x + w / 2} y1={y + (arch ? w * 0.2 : 0)} x2={x + w / 2} y2={y + h} stroke={p.trim} strokeWidth={2} />
      {grid > 1 && <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={p.trim} strokeWidth={2} />}
      <path d={`M${x + 4},${y + h - 4} L${x + w * 0.4},${y + (arch ? w * 0.4 : 4)}`} stroke="#fff" strokeOpacity={0.55} strokeWidth={3} />
    </g>
  );
}

function Exterior({ l, p, r }: { l: Listing; p: P; r: () => number }) {
  const st = l.style;
  const ground = <rect x={0} y={232} width={400} height={68} fill={p.ground} />;
  const path = <path d="M190,300 L200,240 L222,240 L240,300 Z" fill={shade(p.ground, 0.35)} />;
  const trees = (
    <>
      <Tree x={40 + r() * 20} y={232} s={1.1} />
      <Tree x={360 - r() * 20} y={232} s={0.95} c="#8DB074" />
    </>
  );
  if (l.kind === "land") {
    return (
      <g>
        <circle cx={300} cy={80} r={28} fill={p.accent} />
        <path d="M0,190 Q100,150 200,180 T400,170 L400,300 L0,300 Z" fill="#B9D29C" />
        <path d="M0,230 Q120,195 230,225 T400,215 L400,300 L0,300 Z" fill={p.ground} />
        {[...Array(9)].map((_, i) => (
          <g key={i}>
            <rect x={20 + i * 45} y={238} width={4} height={30} fill={p.trim} />
          </g>
        ))}
        <rect x={20} y={246} width={364} height={3} fill={p.trim} />
        <rect x={20} y={258} width={364} height={3} fill={p.trim} />
        <Tree x={90} y={200} s={1.3} c="#6F955C" />
        <Tree x={130} y={196} s={0.9} />
        <Tree x={330} y={190} s={1.1} c="#7FA06A" />
      </g>
    );
  }
  if (l.kind === "commercial") {
    return (
      <g>
        {ground}
        <rect x={70} y={70} width={260} height={162} fill={p.wall} />
        <rect x={70} y={60} width={260} height={14} fill={p.roof} />
        <path d="M80,130 L320,130 L330,150 L70,150 Z" fill="#E5322D" />
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${70 + i * 43.3},150 l21.6,0 l0,8 a10.8,8 0 0 1 -21.6,0 Z`} fill={i % 2 ? "#fff" : "#E5322D"} />)}
        <rect x={84} y={165} width={232} height={67} fill={p.glass} stroke={p.trim} strokeWidth={4} />
        <rect x={185} y={170} width={30} height={62} fill={shade(p.glass, -0.15)} stroke={p.trim} strokeWidth={3} />
        {[0, 1, 2, 3].map((i) => <Win key={i} x={90 + i * 58} y={86} w={38} h={32} p={p} />)}
        {trees}
      </g>
    );
  }
  if (st === "minimalist" || st === "contemporary") {
    return (
      <g>
        {ground}
        {trees}
        <rect x={90} y={120} width={150} height={112} fill={p.wall} />
        <rect x={180} y={80} width={150} height={80} fill={shade(p.wall, st === "minimalist" ? -0.06 : 0.12)} />
        <rect x={180} y={160} width={150} height={72} fill={p.glass} stroke={p.trim} strokeWidth={3} />
        {[0, 1, 2].map((i) => <line key={i} x1={230 + i * 50 - 25} y1={160} x2={230 + i * 50 - 25} y2={232} stroke={p.trim} strokeWidth={2} />)}
        <rect x={195} y={92} width={120} height={54} fill={p.glass} stroke={p.trim} strokeWidth={3} />
        {[...Array(9)].map((_, i) => <rect key={i} x={98 + i * 9} y={132} width={5} height={60} fill={p.accent} />)}
        <rect x={108} y={196} width={30} height={36} fill={p.accent} />
        <rect x={84} y={114} width={162} height={7} fill={p.roof} />
        <rect x={174} y={74} width={162} height={7} fill={p.roof} />
        {path}
      </g>
    );
  }
  if (st === "industrial") {
    return (
      <g>
        {ground}
        <rect x={80} y={50} width={240} height={182} fill={p.wall} />
        {[...Array(12)].map((_, i) => <line key={i} x1={80} y1={60 + i * 15} x2={320} y2={60 + i * 15} stroke={shade(p.wall, -0.15)} strokeWidth={1} />)}
        <rect x={74} y={44} width={252} height={10} fill={p.roof} />
        {[0, 1, 2].map((row) => [0, 1, 2].map((c) => (
          <g key={`${row}${c}`}>
            <rect x={98 + c * 74} y={68 + row * 52} width={56} height={40} fill={p.glass} stroke={p.trim} strokeWidth={3} />
            <line x1={98 + c * 74 + 18.6} y1={68 + row * 52} x2={98 + c * 74 + 18.6} y2={108 + row * 52} stroke={p.trim} strokeWidth={2} />
            <line x1={98 + c * 74 + 37.3} y1={68 + row * 52} x2={98 + c * 74 + 37.3} y2={108 + row * 52} stroke={p.trim} strokeWidth={2} />
            <line x1={98 + c * 74} y1={88 + row * 52} x2={154 + c * 74} y2={88 + row * 52} stroke={p.trim} strokeWidth={2} />
          </g>
        )))}
        <rect x={182} y={200} width={36} height={32} fill={p.trim} />
        <path d="M176,196 L224,196 L218,186 L182,186 Z" fill={p.accent} />
        {trees}
      </g>
    );
  }
  // pitched-roof family
  const steep = st === "gothic" ? 105 : st === "craftsman" ? 45 : st === "modern farmhouse" ? 80 : 70;
  const bodyY = 125;
  const asym = st === "artsy";
  return (
    <g>
      {ground}
      {trees}
      {st === "colonial" && <rect x={260} y={70} width={20} height={50} fill={shade(p.wall, -0.2)} />}
      <rect x={95} y={bodyY} width={210} height={107} fill={p.wall} />
      {st === "modern farmhouse" && [...Array(21)].map((_, i) => <line key={i} x1={100 + i * 10} y1={bodyY} x2={100 + i * 10} y2={232} stroke={shade(p.wall, -0.06)} strokeWidth={2} />)}
      {st === "colonial" && [...Array(7)].map((_, i) => <line key={i} x1={95} y1={bodyY + 12 + i * 14} x2={305} y2={bodyY + 12 + i * 14} stroke={shade(p.wall, -0.18)} strokeWidth={1} />)}
      {asym ? (
        <path d={`M85,${bodyY + 4} L250,${bodyY - 55} L315,${bodyY - 20} L315,${bodyY + 4} Z`} fill={p.roof} />
      ) : (
        <path d={`M82,${bodyY + 4} L200,${bodyY - steep} L318,${bodyY + 4} Z`} fill={p.roof} />
      )}
      {st === "gothic" && <path d={`M196,${bodyY - steep - 30} L200,${bodyY - steep - 45} L204,${bodyY - steep - 30} L204,${bodyY - steep + 4} L196,${bodyY - steep + 4} Z`} fill={p.trim} />}
      {st === "victorian" && (
        <g>
          <path d={`M${200 - 30},${bodyY - 10} L200,${bodyY - 48} L${230},${bodyY - 10} Z`} fill={p.accent} />
          <rect x={95} y={204} width={210} height={6} fill={p.trim} />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={100 + i * 33} y={208} width={4} height={24} fill={p.trim} />)}
        </g>
      )}
      {st === "craftsman" && (
        <g>
          <rect x={95} y={196} width={210} height={8} fill={p.trim} />
          {[0, 1, 2].map((i) => <path key={i} d={`M${108 + i * 85},232 l6,-28 l10,0 l6,28 Z`} fill="#A79A88" />)}
        </g>
      )}
      {asym && (
        <g>
          <circle cx={150} cy={150} r={10} fill={p.accent} />
          <circle cx={270} cy={210} r={16} fill={p.trim} opacity={0.9} />
          <path d="M100,225 Q130,200 160,222" stroke={p.accent} strokeWidth={6} fill="none" />
          <Win x={232} y={bodyY - 25} w={40} h={40} p={p} round />
        </g>
      )}
      {/* windows */}
      {(st === "colonial" ? [110, 160, 230, 270] : [118, 252]).map((x, i) => (
        <g key={i}>
          {st === "colonial" && <rect x={x - 7} y={bodyY + 18} width={6} height={36} fill={p.accent} />}
          <Win x={x} y={bodyY + 18} w={st === "colonial" ? 26 : 34} h={36} p={p} arch={st === "gothic"} grid={2} />
          {st === "colonial" && <rect x={x + 27} y={bodyY + 18} width={6} height={36} fill={p.accent} />}
        </g>
      ))}
      {st === "gothic" && <Win x={185} y={bodyY - 50} w={30} h={40} p={p} arch />}
      {(st === "scandinavian" || st === "modern farmhouse") && <Win x={180} y={bodyY - 38} w={40} h={30} p={p} />}
      {/* door */}
      <rect x={185} y={182} width={30} height={50} fill={st === "artsy" ? p.accent : st === "scandinavian" ? p.accent : shade(p.roof, 0.1)} rx={st === "gothic" ? 14 : 2} />
      <circle cx={208} cy={208} r={2.4} fill={p.trim === "#2B2A2E" ? "#E9C46A" : "#E9C46A"} />
      {path}
      {l.light > 0.8 && <circle cx={355} cy={45} r={22} fill="#F7D774" opacity={0.85} />}
    </g>
  );
}

function Interior({ l, p, room, r }: { l: Listing; p: P; room: "living" | "bedroom" | "kitchen"; r: () => number }) {
  const wall = l.style === "gothic" ? shade(p.wall, 0.35) : l.style === "artsy" ? "#F6E3D3" : l.style === "industrial" ? shade(p.wall, 0.15) : shade(p.wall, l.style === "craftsman" || l.style === "victorian" ? 0.55 : 0.2);
  const big = l.light > 0.78;
  const winW = big ? 150 : 90;
  const winX = room === "kitchen" ? 40 : 230 - winW / 2 + 40;
  const art = l.style === "artsy";
  return (
    <g>
      <rect width={400} height={300} fill={wall} />
      {l.style === "industrial" && [...Array(14)].map((_, i) => <line key={i} x1={0} y1={14 + i * 14} x2={400} y2={14 + i * 14} stroke={shade(p.wall, -0.05)} strokeWidth={1} />)}
      {/* window */}
      <rect x={winX} y={30} width={winW} height={big ? 160 : 110} fill="#EAF4F8" stroke={p.trim === "#FFFFFF" ? "#333" : p.trim} strokeWidth={5} rx={l.style === "gothic" ? 0 : 2} />
      <line x1={winX + winW / 2} y1={30} x2={winX + winW / 2} y2={big ? 190 : 140} stroke={p.trim === "#FFFFFF" ? "#333" : p.trim} strokeWidth={3} />
      <Tree x={winX + winW * 0.3} y={big ? 200 : 150} s={0.8} c="#9CC38A" />
      {big && <path d={`M${winX},${190} L${winX + winW},${190} L${winX + winW + 90},300 L${winX - 60},300 Z`} fill="#FFF6D8" opacity={0.55} />}
      {/* floor */}
      <rect x={0} y={222} width={400} height={78} fill={p.floor} />
      {[...Array(8)].map((_, i) => <line key={i} x1={i * 55} y1={222} x2={i * 55 - 30} y2={300} stroke={shade(p.floor, -0.12)} strokeWidth={1.5} />)}
      {room === "living" && (
        <g>
          <ellipse cx={150} cy={262} rx={120} ry={20} fill={art ? "#3B5BA9" : shade(p.accent, 0.4)} opacity={0.75} />
          <rect x={50} y={180} width={180} height={52} rx={14} fill={art ? "#F2C14E" : l.style === "gothic" ? "#5C4A5A" : shade(p.accent, 0.1)} />
          <rect x={50} y={160} width={180} height={34} rx={14} fill={art ? shade("#F2C14E", -0.08) : l.style === "gothic" ? "#4D3C4B" : shade(p.accent, -0.05)} />
          <rect x={70} y={170} width={36} height={26} rx={8} fill={art ? "#E07A55" : "#F4EFE7"} />
          <rect x={250} y={232} width={70} height={8} rx={3} fill={shade(p.floor, -0.3)} />
          <rect x={256} y={240} width={4} height={18} fill={shade(p.floor, -0.3)} /><rect x={310} y={240} width={4} height={18} fill={shade(p.floor, -0.3)} />
          {(art ? [[40, 60, 50, 60, "#3B5BA9"], [100, 50, 40, 40, "#E07A55"], [100, 98, 40, 30, "#2F7F7F"], [150, 70, 30, 46, "#F2C14E"]] : [[90, 70, 70, 50, shade(p.accent, -0.1)]]).map(([x, y, w, h, c], i) => (
            <g key={i}><rect x={x as number} y={y as number} width={w as number} height={h as number} fill="#fff" /><rect x={(x as number) + 4} y={(y as number) + 4} width={(w as number) - 8} height={(h as number) - 8} fill={c as string} /></g>
          ))}
          {(l.ambience.includes("cozy") || l.ambience.includes("warm")) && (
            <g><rect x={340} y={150} width={4} height={80} fill="#333" /><path d="M326,150 L358,150 L350,128 L334,128 Z" fill="#F2C14E" /><circle cx={342} cy={160} r={30} fill="#FFE7A8" opacity={0.25} /></g>
          )}
        </g>
      )}
      {room === "bedroom" && (
        <g>
          <rect x={60} y={150} width={14} height={90} fill={shade(p.floor, -0.3)} />
          <rect x={70} y={200} width={220} height={38} rx={6} fill="#fff" />
          <rect x={150} y={196} width={140} height={44} rx={6} fill={art ? "#2F7F7F" : shade(p.accent, 0.35)} />
          <rect x={84} y={186} width={46} height={18} rx={7} fill="#F4EFE7" />
          <rect x={300} y={205} width={36} height={34} fill={shade(p.floor, -0.2)} />
          <circle cx={318} cy={196} r={8} fill="#F2C14E" />
        </g>
      )}
      {room === "kitchen" && (
        <g>
          <rect x={190} y={60} width={190} height={50} fill={shade(p.accent, 0.2)} />
          <rect x={190} y={168} width={190} height={58} fill={shade(p.accent, 0.1)} />
          <rect x={186} y={160} width={198} height={10} fill={l.style === "minimalist" ? "#fff" : "#E8E2D8"} />
          {[0, 1, 2].map((i) => <rect key={i} x={200 + i * 60} y={180} width={50} height={40} fill="none" stroke={shade(p.accent, -0.15)} strokeWidth={2} />)}
          <rect x={70} y={200} width={90} height={10} fill={shade(p.floor, -0.25)} />
          <rect x={80} y={210} width={6} height={40} fill={shade(p.floor, -0.25)} /><rect x={144} y={210} width={6} height={40} fill={shade(p.floor, -0.25)} />
          <circle cx={240} cy={50} r={9} fill="#F2C14E" /><line x1={240} y1={0} x2={240} y2={41} stroke="#333" strokeWidth={2} />
          <circle cx={320} cy={50} r={9} fill="#F2C14E" /><line x1={320} y1={0} x2={320} y2={41} stroke="#333" strokeWidth={2} />
        </g>
      )}
      {/* plant */}
      <g transform={`translate(${room === "kitchen" ? 40 : 30 + r() * 4},236)`}>
        <path d="M-10,0 L10,0 L7,22 L-7,22 Z" fill="#C9734F" />
        <path d="M0,0 Q-22,-30 -6,-46 Q0,-20 0,0 Q8,-40 22,-38 Q10,-16 0,0" fill="#5E9A62" />
      </g>
    </g>
  );
}

export default function HomeArt({ listing, variant = "exterior", className = "" }: { listing: Listing; variant?: "exterior" | "living" | "bedroom" | "kitchen"; className?: string }) {
  if (listing.photos?.length) {
    const idx = ["exterior", "living", "bedroom", "kitchen"].indexOf(variant) % listing.photos.length;
    // Listing CDNs can refuse hotlinks: fall back to the first photo (the Matterport scan thumbnail), then to the illustration.
    const first = listing.photos[0];
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={listing.photos[idx]}
        alt={listing.title}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`object-cover ${className}`}
        onError={(e) => {
          const img = e.currentTarget;
          if (img.dataset.fallback) return;
          img.dataset.fallback = "1";
          img.src = img.src === first ? "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" : first;
        }}
      />
    );
  }
  const p = PAL[listing.style] || PAL.contemporary;
  const r = rng(listing.artSeed + variant.length * 31);
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={listing.title}>
      <defs>
        <linearGradient id={`sky${listing.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={shade(p.sky, -0.04)} />
          <stop offset="1" stopColor={shade(p.sky, 0.5)} />
        </linearGradient>
      </defs>
      {variant === "exterior" ? (
        <>
          <rect width={400} height={300} fill={`url(#sky${listing.id})`} />
          <ellipse cx={90} cy={60} rx={40} ry={10} fill="#fff" opacity={0.7} />
          <ellipse cx={250} cy={40} rx={30} ry={8} fill="#fff" opacity={0.6} />
          <Exterior l={listing} p={p} r={r} />
        </>
      ) : (
        <Interior l={listing} p={p} room={variant} r={r} />
      )}
    </svg>
  );
}
