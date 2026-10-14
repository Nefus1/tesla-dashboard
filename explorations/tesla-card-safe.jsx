// Safe variation: conventional HA dark Lovelace card
// Stacks well-known HA card patterns (entity rows, mushroom-style chips,
// progress bars). Reads like a real lovelace dashboard card you'd recognize.

const HA_DARK = {
  bg: '#111111',           // ha-card-background (dark)
  card: '#1c1c1c',         // primary-background-color
  cardEl: '#252525',       // secondary-background-color (chips, sliders)
  border: 'rgba(255,255,255,0.06)',
  text: '#e1e1e1',         // primary-text-color
  textDim: 'rgba(225,225,225,0.55)', // secondary-text-color
  textFaint: 'rgba(225,225,225,0.35)',
  accent: '#03a9f4',       // ha default primary
  green: '#43a047',
  amber: '#ffa726',
  red: '#e53935',
  divider: 'rgba(255,255,255,0.05)',
};

// Tesla paint swatches → realistic body color when rendering the car
const PAINT = {
  'Pearl White':     { body: '#eef0ee', spec: '#ffffff', shade: '#9a9d9b' },
  'Solid Black':     { body: '#0c0d0e', spec: '#2a2c2f', shade: '#000000' },
  'Midnight Silver': { body: '#3a3d40', spec: '#5b6064', shade: '#1a1c1e' },
  'Deep Blue':       { body: '#1a3253', spec: '#2c5183', shade: '#0b1a2d' },
  'Red Multi-Coat':  { body: '#8b1418', spec: '#c5202b', shade: '#4a0808' },
  'Quicksilver':     { body: '#a8adb3', spec: '#d8dde2', shade: '#5a5e63' },
  'Stealth Grey':    { body: '#4a4d50', spec: '#6c7074', shade: '#26282a' },
  'Ultra Red':       { body: '#bb1a1f', spec: '#e83a40', shade: '#5a0a0d' },
};

// Inline icons — material-ish, stroke-based to match HA's mdi feel
const Icon = ({ name, size = 20, color = 'currentColor' }) => {
  const paths = {
    car: 'M5 11l1.5-4.5C6.8 5.6 7.6 5 8.5 5h7c.9 0 1.7.6 2 1.5L19 11M5 11h14M5 11v6h2v-2h10v2h2v-6M7.5 14a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
    battery: 'M7 4h2V2h6v2h2a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z',
    bolt: 'M11 21h-1l1-7H6l8-13h1l-1 7h5l-8 13z',
    plug: 'M11 3v4M13 3v4M7 9h10v3a5 5 0 01-5 5 5 5 0 01-5-5V9zm5 8v4',
    thermo: 'M12 3a3 3 0 013 3v9.5a4 4 0 11-6 0V6a3 3 0 013-3zm0 11.5V6',
    fan: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M12 4c1 2 1 4 0 6M12 14c-1 2-1 4 0 6M4 12c2-1 4-1 6 0M14 12c2 1 4 1 6 0',
    lock: 'M6 10V8a6 6 0 1112 0v2h1a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h8V8a4 4 0 10-8 0v2z',
    unlock: 'M6 10V8a6 6 0 0111.6-2M6 10H5a1 1 0 00-1 1v9a1 1 0 001 1h14a1 1 0 001-1v-9a1 1 0 00-1-1H6z',
    frunk: 'M3 12l2-5a3 3 0 013-2h8a3 3 0 013 2l2 5M3 12v6h2v-2h14v2h2v-6M3 12h18',
    tire: 'M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0M12 3v3M12 18v3M3 12h3M18 12h3',
    chevron: 'M9 6l6 6-6 6',
    minus: 'M5 12h14',
    plus: 'M12 5v14M5 12h14',
    energy: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
    sentry: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z',
    location: 'M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7zm0 5a2 2 0 100 4 2 2 0 000-4z',
    wifi: 'M5 12.5a10 10 0 0114 0M8 15.5a6 6 0 018 0M12 19h.01',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
};

// Top-down Model Y silhouette in CSS/SVG. Stylized but recognizable.
const ModelYTop = ({ paint, locked, frunkOpen, width = 200 }) => {
  const p = PAINT[paint] || PAINT['Quicksilver'];
  const ratio = 2.05; // L/W of Model Y top-down
  const h = width * ratio;
  return (
    <svg width={width} height={h} viewBox="0 0 200 410" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={p.shade} />
          <stop offset="0.5" stopColor={p.body} />
          <stop offset="1" stopColor={p.shade} />
        </linearGradient>
        <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(20,30,45,0.95)" />
          <stop offset="0.5" stopColor="rgba(60,80,110,0.65)" />
          <stop offset="1" stopColor="rgba(20,30,45,0.95)" />
        </linearGradient>
        <radialGradient id="hl" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {/* Soft ground shadow */}
      <ellipse cx="100" cy="395" rx="78" ry="6" fill="rgba(0,0,0,0.4)" />
      {/* Body — Model Y proportions: rounded, slightly tapered nose */}
      <path d="M 40 30
               C 40 12, 60 4, 100 4
               C 140 4, 160 12, 160 30
               L 162 200
               L 162 360
               C 162 388, 140 400, 100 400
               C 60 400, 38 388, 38 360
               L 38 200 Z"
            fill="url(#bodyGrad)" stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
      {/* Body sheen */}
      <path d="M 40 30
               C 40 12, 60 4, 100 4
               C 140 4, 160 12, 160 30
               L 162 360
               C 162 388, 140 400, 100 400
               C 60 400, 38 388, 38 360 Z"
            fill="url(#hl)" />
      {/* One-piece glass roof — Model Y's signature */}
      <path d="M 55 70
               Q 50 85, 50 120
               L 50 290
               Q 50 320, 55 335
               L 145 335
               Q 150 320, 150 290
               L 150 120
               Q 150 85, 145 70 Z"
            fill="url(#glassGrad)" />
      {/* Windshield/rear-glass division lines (subtle) */}
      <line x1="55" y1="160" x2="145" y2="160" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <line x1="55" y1="245" x2="145" y2="245" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      {/* Side mirrors */}
      <ellipse cx="36" cy="120" rx="6" ry="9" fill={p.body} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
      <ellipse cx="164" cy="120" rx="6" ry="9" fill={p.body} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
      {/* Headlights */}
      <path d="M 50 18 Q 60 10, 75 12 L 75 22 Q 60 22, 50 26 Z" fill="rgba(255,240,200,0.6)" />
      <path d="M 150 18 Q 140 10, 125 12 L 125 22 Q 140 22, 150 26 Z" fill="rgba(255,240,200,0.6)" />
      {/* Tail light bar */}
      <rect x="48" y="378" width="104" height="3" rx="1.5" fill="rgba(220,40,40,0.65)" />
      {/* Frunk seam — opens forward */}
      {frunkOpen ? (
        <g>
          <path d="M 45 40 L 155 40 L 152 -10 L 48 -10 Z"
                fill={p.body} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
          <path d="M 50 -8 L 150 -8 L 148 35 L 52 35 Z"
                fill="rgba(0,0,0,0.45)" />
          <text x="100" y="20" textAnchor="middle" fill="rgba(255,255,255,0.6)"
                fontSize="9" fontFamily="ui-sans-serif" letterSpacing="0.08em">FRUNK</text>
        </g>
      ) : (
        <path d="M 50 35 L 150 35 L 152 65 L 48 65 Z"
              fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
      )}
      {/* Door seams */}
      <line x1="40" y1="155" x2="50" y2="155" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <line x1="40" y1="240" x2="50" y2="240" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <line x1="40" y1="320" x2="50" y2="320" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <line x1="160" y1="155" x2="150" y2="155" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <line x1="160" y1="240" x2="150" y2="240" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      <line x1="160" y1="320" x2="150" y2="320" stroke="rgba(0,0,0,0.3)" strokeWidth="0.6" />
      {/* Charge port indicator (rear left) */}
      <circle cx="42" cy="345" r="2" fill={locked ? 'rgba(255,255,255,0.3)' : '#03a9f4'} />
    </svg>
  );
};

// Slim animated battery bar
const BatteryBar = ({ pct, charging, color = HA_DARK.green }) => {
  const fill = charging ? HA_DARK.green : pct < 20 ? HA_DARK.red : pct < 40 ? HA_DARK.amber : color;
  return (
    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.07)',
                  borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: fill,
                    transition: 'width 600ms ease-out, background 200ms',
                    boxShadow: charging ? `0 0 8px ${fill}` : 'none' }} />
      {charging && (
        <div style={{ position: 'absolute', inset: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                      transform: 'translateX(-100%)',
                      animation: 'haShimmer 1.6s ease-in-out infinite' }} />
      )}
    </div>
  );
};

// HA-style entity row
const EntityRow = ({ icon, name, value, valueColor, onClick, last }) => (
  <div onClick={onClick}
       style={{ display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', cursor: onClick ? 'pointer' : 'default',
                borderBottom: last ? 'none' : `1px solid ${HA_DARK.divider}` }}>
    <div style={{ width: 36, height: 36, borderRadius: 18,
                  background: 'rgba(3,169,244,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: HA_DARK.accent, flexShrink: 0 }}>
      <Icon name={icon} size={20} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, color: HA_DARK.text, fontWeight: 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {name}
      </div>
    </div>
    <div style={{ fontSize: 14, color: valueColor || HA_DARK.textDim, fontWeight: 500,
                  fontVariant: 'tabular-numeric', flexShrink: 0 }}>
      {value}
    </div>
  </div>
);

// Pill-style action chip (mushroom-card vibe)
const Chip = ({ icon, label, active, onClick, accent = HA_DARK.accent }) => (
  <button onClick={onClick}
          style={{ flex: 1, padding: '14px 8px',
                   background: active ? `${accent}22` : HA_DARK.cardEl,
                   border: `1px solid ${active ? accent + '55' : 'transparent'}`,
                   borderRadius: 12, color: active ? accent : HA_DARK.text,
                   display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                   cursor: 'pointer', fontFamily: 'inherit',
                   transition: 'all 160ms ease' }}>
    <Icon name={icon} size={22} />
    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.1 }}>{label}</span>
  </button>
);

// Stepper for charge limit
const ChargeLimitStepper = ({ value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <button onClick={() => onChange(Math.max(50, value - 5))}
            style={{ width: 28, height: 28, borderRadius: 14, border: 'none',
                     background: HA_DARK.cardEl, color: HA_DARK.text, cursor: 'pointer',
                     display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="minus" size={14} />
    </button>
    <div style={{ minWidth: 44, textAlign: 'center', fontSize: 14,
                  color: HA_DARK.text, fontWeight: 500 }}>
      {value}%
    </div>
    <button onClick={() => onChange(Math.min(100, value + 5))}
            style={{ width: 28, height: 28, borderRadius: 14, border: 'none',
                     background: HA_DARK.cardEl, color: HA_DARK.text, cursor: 'pointer',
                     display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="plus" size={14} />
    </button>
  </div>
);

function TeslaCardSafe({ paint = 'Quicksilver', state, onState }) {
  const s = state;
  const range = Math.round(s.battery * 3.2); // ~320mi at 100%
  const cabinTemp = s.preconditioning ? 70 : 58;
  const tempColor = cabinTemp > 75 ? HA_DARK.red : cabinTemp < 60 ? HA_DARK.accent : HA_DARK.green;

  return (
    <div style={{ width: 380, fontFamily: 'ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif',
                  color: HA_DARK.text }}>
      {/* Card 1: Header / battery */}
      <div style={{ background: HA_DARK.card, borderRadius: 12, marginBottom: 8,
                    border: `1px solid ${HA_DARK.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 14px',
                      display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flexShrink: 0 }}>
            <ModelYTop paint={paint} locked={s.locked} frunkOpen={s.frunkOpen} width={64} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: HA_DARK.text }}>
                Model Y
              </div>
              <div style={{ fontSize: 11, color: HA_DARK.textFaint, letterSpacing: 0.4,
                            textTransform: 'uppercase' }}>
                {s.charging ? 'Charging' : s.plugged ? 'Plugged in' : 'Parked'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 300, fontVariantNumeric: 'tabular-nums',
                             color: HA_DARK.text, lineHeight: 1 }}>
                {s.battery}
              </span>
              <span style={{ fontSize: 14, color: HA_DARK.textDim }}>%</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: HA_DARK.textDim }}>
                · {range} mi
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              <BatteryBar pct={s.battery} charging={s.charging} />
            </div>
            {s.charging && (
              <div style={{ marginTop: 8, fontSize: 11, color: HA_DARK.green,
                            display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="bolt" size={12} />
                <span>+ 32 mi/hr · full at 11:42 PM</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card 2: Quick chips */}
      <div style={{ background: HA_DARK.card, borderRadius: 12, marginBottom: 8,
                    border: `1px solid ${HA_DARK.border}`, padding: 10,
                    display: 'flex', gap: 8 }}>
        <Chip icon={s.locked ? 'lock' : 'unlock'}
              label={s.locked ? 'Locked' : 'Unlocked'}
              active={!s.locked}
              accent={s.locked ? HA_DARK.green : HA_DARK.amber}
              onClick={() => onState({ ...s, locked: !s.locked })} />
        <Chip icon="frunk" label="Frunk" active={s.frunkOpen}
              onClick={() => onState({ ...s, frunkOpen: !s.frunkOpen })} />
        <Chip icon="fan" label="Climate" active={s.preconditioning}
              accent={HA_DARK.accent}
              onClick={() => onState({ ...s, preconditioning: !s.preconditioning })} />
      </div>

      {/* Card 3: Entities */}
      <div style={{ background: HA_DARK.card, borderRadius: 12, marginBottom: 8,
                    border: `1px solid ${HA_DARK.border}` }}>
        <EntityRow icon="thermo" name="Cabin temperature"
                   value={`${cabinTemp}°F`} valueColor={tempColor} />
        <EntityRow icon="energy" name="Energy used today" value="14.2 kWh" />
        <EntityRow icon="tire" name="Tire pressure" value="42 / 42 / 41 / 42 PSI" last />
      </div>

      {/* Card 4: Charge limit */}
      <div style={{ background: HA_DARK.card, borderRadius: 12,
                    border: `1px solid ${HA_DARK.border}`,
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18,
                        background: 'rgba(3,169,244,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: HA_DARK.accent }}>
            <Icon name="plug" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 14, color: HA_DARK.text }}>Charge limit</div>
            <div style={{ fontSize: 11, color: HA_DARK.textFaint, marginTop: 2 }}>
              Daily target
            </div>
          </div>
        </div>
        <ChargeLimitStepper value={s.chargeLimit}
                            onChange={(v) => onState({ ...s, chargeLimit: v })} />
      </div>
    </div>
  );
}

window.TeslaCardSafe = TeslaCardSafe;
window.ModelYTop = ModelYTop;
window.PAINT = PAINT;
window.HA_DARK = HA_DARK;
window.TeslaIcon = Icon;
