// Bold variation: hero Tesla dashboard
// Big top-down vehicle render flanked by orbital data, glassy controls underneath.
// Still HA-friendly (cards, entities) but pushes the visual treatment.

const Icon2 = window.TeslaIcon;
const ModelY2 = window.ModelYTop;
const PAINT2 = window.PAINT;

const HA_BOLD = {
  bg: '#0a0a0c',
  card: 'linear-gradient(180deg, #1a1a1d 0%, #131316 100%)',
  cardSolid: '#16161a',
  cardEl: '#222226',
  border: 'rgba(255,255,255,0.07)',
  borderHi: 'rgba(255,255,255,0.14)',
  text: '#f4f4f6',
  textDim: 'rgba(244,244,246,0.55)',
  textFaint: 'rgba(244,244,246,0.32)',
  accent: '#5cb8ff',
  green: '#3ddc97',
  amber: '#ffb84d',
  red: '#ff5b5b',
};

// Curved/arc data label that orbits the vehicle render
const OrbitLabel = ({ label, value, valueColor, side, top, accent }) => {
  const align = side === 'left' ? 'flex-end' : 'flex-start';
  const lineDir = side === 'left' ? 'row' : 'row-reverse';
  return (
    <div style={{ position: 'absolute', top, [side]: 0,
                  display: 'flex', flexDirection: 'column', alignItems: align, gap: 4 }}>
      <div style={{ display: 'flex', flexDirection: lineDir, alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3,
                      background: accent || HA_BOLD.accent,
                      boxShadow: `0 0 8px ${accent || HA_BOLD.accent}` }} />
        <div style={{ width: 36, height: 1, background: HA_BOLD.borderHi }} />
      </div>
      <div style={{ fontSize: 10, color: HA_BOLD.textFaint, letterSpacing: '0.12em',
                    textTransform: 'uppercase', fontWeight: 500, textAlign: side }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 300, color: valueColor || HA_BOLD.text,
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1, textAlign: side,
                    fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
};

// Big arc-style battery ring (around the car)
const BatteryArc = ({ pct, charging }) => {
  // Arc spans from bottom-left around to bottom-right (270° arc)
  const cx = 200, cy = 220, r = 175;
  const startAngle = 135, endAngle = 405; // 270 degrees
  const totalArc = endAngle - startAngle;
  const fillAngle = startAngle + (totalArc * pct) / 100;

  const polar = (angle) => {
    const rad = (angle - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };

  const arcPath = (a1, a2) => {
    const [x1, y1] = polar(a1);
    const [x2, y2] = polar(a2);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const color = charging ? HA_BOLD.green : pct < 20 ? HA_BOLD.red : pct < 40 ? HA_BOLD.amber : HA_BOLD.accent;

  return (
    <svg width="400" height="440" viewBox="0 0 400 440"
         style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="arcGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.9" />
          <stop offset="1" stopColor={color} stopOpacity="0.6" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* Track */}
      <path d={arcPath(startAngle, endAngle)} fill="none"
            stroke={HA_BOLD.border} strokeWidth="2" />
      {/* Tick marks every 10% */}
      {[...Array(11)].map((_, i) => {
        const a = startAngle + (totalArc * i) / 10;
        const [x1, y1] = polar(a);
        const rIn = r - 5;
        const radIn = (a - 90) * Math.PI / 180;
        const x2 = cx + rIn * Math.cos(radIn);
        const y2 = cy + rIn * Math.sin(radIn);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                     stroke={i % 5 === 0 ? HA_BOLD.borderHi : HA_BOLD.border}
                     strokeWidth="1" />;
      })}
      {/* Fill */}
      {pct > 0 && (
        <>
          <path d={arcPath(startAngle, fillAngle)} fill="none"
                stroke={color} strokeWidth="3" strokeLinecap="round"
                style={{ transition: 'all 600ms ease' }} />
          {charging && (
            <path d={arcPath(startAngle, fillAngle)} fill="none"
                  stroke={color} strokeWidth="6" strokeLinecap="round"
                  filter="url(#glow)" opacity="0.6" />
          )}
        </>
      )}
      {/* Endpoint marker */}
      {pct > 0 && pct < 100 && (() => {
        const [ex, ey] = polar(fillAngle);
        return <circle cx={ex} cy={ey} r="5" fill={color}
                       style={{ filter: `drop-shadow(0 0 6px ${color})` }} />;
      })()}
    </svg>
  );
};

// Glassy action button (hero CTA-style)
const GlassButton = ({ icon, label, active, onClick, accent = HA_BOLD.accent }) => (
  <button onClick={onClick}
          style={{ flex: 1, padding: '16px 12px',
                   background: active
                     ? `linear-gradient(180deg, ${accent}33, ${accent}11)`
                     : 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
                   border: `1px solid ${active ? accent + '66' : HA_BOLD.border}`,
                   borderRadius: 14,
                   color: active ? accent : HA_BOLD.text,
                   display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                   cursor: 'pointer', fontFamily: 'inherit',
                   transition: 'all 220ms cubic-bezier(0.2, 0, 0, 1)',
                   boxShadow: active
                     ? `0 0 0 1px ${accent}33, 0 8px 24px -8px ${accent}66`
                     : '0 1px 0 rgba(255,255,255,0.04) inset' }}>
    <Icon2 name={icon} size={22} />
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                   textTransform: 'uppercase' }}>
      {label}
    </span>
  </button>
);

// Mini-stat tile under the hero
const StatTile = ({ icon, label, value, sub, accent = HA_BOLD.accent }) => (
  <div style={{ flex: 1, padding: '14px 16px',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                border: `1px solid ${HA_BOLD.border}`,
                borderRadius: 14,
                display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8,
                    background: `${accent}1f`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: accent }}>
        <Icon2 name={icon} size={16} />
      </div>
      <span style={{ fontSize: 9, color: HA_BOLD.textFaint, letterSpacing: '0.12em',
                     textTransform: 'uppercase', fontWeight: 500 }}>
        {label}
      </span>
    </div>
    <div>
      <div style={{ fontSize: 20, fontWeight: 300, color: HA_BOLD.text,
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: HA_BOLD.textDim, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  </div>
);

// Charge limit slider — custom track
const ChargeLimitSlider = ({ value, onChange }) => {
  const trackRef = React.useRef(null);
  const dragging = React.useRef(false);

  const handleMove = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const pct = Math.max(50, Math.min(100, Math.round((x / rect.width) * 100)));
    const snapped = Math.round(pct / 5) * 5;
    onChange(snapped);
  };

  React.useEffect(() => {
    const move = (e) => { if (dragging.current) handleMove(e); };
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, []);

  return (
    <div style={{ padding: '14px 16px',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                  border: `1px solid ${HA_BOLD.border}`,
                  borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: HA_BOLD.textFaint, letterSpacing: '0.12em',
                       textTransform: 'uppercase', fontWeight: 500 }}>
          Charge limit
        </span>
        <span style={{ fontSize: 22, fontWeight: 300, color: HA_BOLD.text,
                       fontVariantNumeric: 'tabular-nums' }}>
          {value}<span style={{ fontSize: 13, color: HA_BOLD.textDim, marginLeft: 2 }}>%</span>
        </span>
      </div>
      <div ref={trackRef}
           onMouseDown={(e) => { dragging.current = true; handleMove(e); }}
           onTouchStart={(e) => { dragging.current = true; handleMove(e); }}
           style={{ position: 'relative', height: 28, cursor: 'pointer',
                    display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4,
                      background: 'rgba(255,255,255,0.06)', borderRadius: 2 }} />
        {/* daily zone (50-80) */}
        <div style={{ position: 'absolute', left: '0%', width: '60%', height: 4,
                      background: 'rgba(61,220,151,0.15)', borderRadius: 2 }} />
        {/* trip zone (80-100) */}
        <div style={{ position: 'absolute', left: '60%', width: '40%', height: 4,
                      background: 'rgba(255,184,77,0.15)', borderRadius: 2 }} />
        {/* fill */}
        <div style={{ position: 'absolute', left: 0, height: 4,
                      width: `${((value - 50) / 50) * 100}%`,
                      background: value > 80 ? HA_BOLD.amber : HA_BOLD.green,
                      borderRadius: 2,
                      transition: dragging.current ? 'none' : 'all 200ms ease' }} />
        {/* knob */}
        <div style={{ position: 'absolute', left: `${((value - 50) / 50) * 100}%`,
                      transform: 'translateX(-50%)',
                      width: 22, height: 22, borderRadius: 11,
                      background: HA_BOLD.text,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.1)',
                      transition: dragging.current ? 'none' : 'all 200ms ease' }} />
        {/* tick markers */}
        {[50, 60, 70, 80, 90, 100].map(t => (
          <div key={t} style={{ position: 'absolute', left: `${((t - 50) / 50) * 100}%`,
                                top: 18, fontSize: 9, color: HA_BOLD.textFaint,
                                transform: 'translateX(-50%)',
                                fontVariantNumeric: 'tabular-nums' }}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
};

function TeslaCardBold({ paint = 'Quicksilver', state, onState }) {
  const s = state;
  const range = Math.round(s.battery * 3.2);
  const cabinTemp = s.preconditioning ? 70 : 58;

  return (
    <div style={{ width: 440, padding: 0,
                  fontFamily: 'ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif',
                  color: HA_BOLD.text }}>
      {/* Hero card */}
      <div style={{ background: HA_BOLD.card, borderRadius: 18,
                    border: `1px solid ${HA_BOLD.border}`,
                    boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
                    overflow: 'hidden', marginBottom: 10 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '16px 20px 0' }}>
          <div>
            <div style={{ fontSize: 11, color: HA_BOLD.textFaint, letterSpacing: '0.16em',
                          textTransform: 'uppercase', fontWeight: 600 }}>
              Tesla · Model Y
            </div>
            <div style={{ fontSize: 14, color: HA_BOLD.textDim, marginTop: 4,
                          display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon2 name="location" size={12} />
              <span>Home · Garage</span>
              <span style={{ color: HA_BOLD.textFaint }}>·</span>
              <Icon2 name="wifi" size={12} />
              <span>Strong</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px',
                        background: s.charging ? 'rgba(61,220,151,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${s.charging ? 'rgba(61,220,151,0.3)' : HA_BOLD.border}`,
                        borderRadius: 999 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3,
                          background: s.charging ? HA_BOLD.green : HA_BOLD.textDim,
                          boxShadow: s.charging ? `0 0 6px ${HA_BOLD.green}` : 'none',
                          animation: s.charging ? 'haPulse 1.6s ease-in-out infinite' : 'none' }} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                           textTransform: 'uppercase',
                           color: s.charging ? HA_BOLD.green : HA_BOLD.textDim }}>
              {s.charging ? 'Charging' : s.plugged ? 'Plugged in' : 'Ready'}
            </span>
          </div>
        </div>

        {/* Hero center: car + arc + orbit data */}
        <div style={{ position: 'relative', width: 400, height: 440,
                      margin: '8px auto 0' }}>
          <BatteryArc pct={s.battery} charging={s.charging} />

          <div style={{ position: 'absolute', left: '50%', top: 12,
                        transform: 'translateX(-50%)' }}>
            <ModelY2 paint={paint} locked={s.locked} frunkOpen={s.frunkOpen} width={188} />
          </div>

          {/* Orbit labels */}
          <OrbitLabel label="Battery" value={`${s.battery}%`} side="left" top={70}
                      accent={s.charging ? HA_BOLD.green : HA_BOLD.accent} />
          <OrbitLabel label="Range" value={`${range} mi`} side="right" top={70} />
          <OrbitLabel label="Cabin" value={`${cabinTemp}°`} side="left" top={310}
                      accent={s.preconditioning ? HA_BOLD.accent : HA_BOLD.textDim}
                      valueColor={s.preconditioning ? HA_BOLD.accent : HA_BOLD.text} />
          <OrbitLabel label="Limit" value={`${s.chargeLimit}%`} side="right" top={310}
                      accent={s.chargeLimit > 80 ? HA_BOLD.amber : HA_BOLD.green} />

          {/* Charging detail at bottom */}
          {s.charging && (
            <div style={{ position: 'absolute', left: '50%', bottom: -4,
                          transform: 'translateX(-50%)',
                          fontSize: 11, color: HA_BOLD.green,
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px',
                          background: 'rgba(61,220,151,0.08)',
                          border: '1px solid rgba(61,220,151,0.2)',
                          borderRadius: 999 }}>
              <Icon2 name="bolt" size={12} />
              <span style={{ fontWeight: 500 }}>+ 32 mi/hr</span>
              <span style={{ color: HA_BOLD.textDim }}>·</span>
              <span style={{ color: HA_BOLD.textDim }}>Full at 11:42 PM</span>
            </div>
          )}
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', gap: 8, padding: '16px 16px 16px' }}>
          <GlassButton icon={s.locked ? 'lock' : 'unlock'}
                       label={s.locked ? 'Locked' : 'Unlocked'}
                       active={!s.locked}
                       accent={s.locked ? HA_BOLD.green : HA_BOLD.amber}
                       onClick={() => onState({ ...s, locked: !s.locked })} />
          <GlassButton icon="frunk"
                       label={s.frunkOpen ? 'Frunk Open' : 'Frunk'}
                       active={s.frunkOpen}
                       accent={HA_BOLD.amber}
                       onClick={() => onState({ ...s, frunkOpen: !s.frunkOpen })} />
          <GlassButton icon="fan"
                       label={s.preconditioning ? 'Climate On' : 'Climate'}
                       active={s.preconditioning}
                       accent={HA_BOLD.accent}
                       onClick={() => onState({ ...s, preconditioning: !s.preconditioning })} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <StatTile icon="energy" label="Today" value="14.2"
                  sub="kWh used" accent={HA_BOLD.accent} />
        <StatTile icon="tire" label="Tires" value="42"
                  sub="PSI · all nominal" accent={HA_BOLD.green} />
      </div>

      {/* Charge limit slider */}
      <ChargeLimitSlider value={s.chargeLimit}
                         onChange={(v) => onState({ ...s, chargeLimit: v })} />
    </div>
  );
}

window.TeslaCardBold = TeslaCardBold;
window.HA_BOLD = HA_BOLD;
