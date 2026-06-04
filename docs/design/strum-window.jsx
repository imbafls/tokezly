/* ============================================================
   STRUM — tiny runtime UI (capsule + popups + toast) and the
   Settings window. WinUI 3 / Fluent. Exported to window.
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

/* ---------------- Fluent System Icons (subset) ---------------- */
const I = {
  mic: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  wave: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  sparkle: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3.2c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5 3.6-.5 5-1.9 5.5-5.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M18.5 14.5c.25 1.6.9 2.25 2.5 2.5-1.6.25-2.25.9-2.5 2.5-.25-1.6-.9-2.25-2.5-2.5 1.6-.25 2.25-.9 2.5-2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>),
  chip: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  cmd: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M7 9h.01M11 9h.01M15 9h.01M7.5 14h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  sliders: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="16" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.6"/><circle cx="8" cy="17" r="2.3" stroke="currentColor" strokeWidth="1.6"/></svg>),
  globe: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14 0 17M12 3.5c-2.5 2.5-2.5 14 0 17" stroke="currentColor" strokeWidth="1.5"/></svg>),
  translate: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 6h7M7.5 6v1.5C7.5 11 5.5 13 3.5 14M5 10c1.5 2 3.5 3.5 5.5 4M12 20l3.5-9 3.5 9M13.2 17h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  download: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  check: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M5 12.5 10 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  clock: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5"/><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  history: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 12a8 8 0 1 1 2.4 5.7M4 12H3M4 12l-.2-3.2M12 8v4.2l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  caret: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  x: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  min: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  max: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>),
  info: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6"/><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  warn: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 4 2.5 20h19L12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  doc: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M7 3h7l4 4v14H7zM14 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9.5 12h5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>),
  gauge: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M4 16a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M12 16l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="12" cy="16" r="1.4" fill="currentColor"/></svg>),
  key: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><circle cx="8" cy="9" r="4" stroke="currentColor" strokeWidth="1.6"/><path d="M11 11l8 8M16 16l2-2M18 18l2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  layers: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 16.5l9 5 9-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>),
  plug: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  shield: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M12 3l7 3v5.5c0 4.2-2.9 7-7 8.5-4.1-1.5-7-4.3-7-8.5V6l7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  cloud: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><path d="M7 18a4 4 0 0 1-.5-7.97 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 17.5 18H7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>),
  lock: (p) => (<svg viewBox="0 0 24 24" fill="none" {...p}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
};

/* ---------------- shared data ---------------- */
const TRANSCRIPT = "the websocket reconnect logic doesn't back off — it hammers the endpoint every hundred milliseconds, we need exponential backoff with jitter";
const COMMIT_OUT = "fix(ws): add exponential backoff with jitter to reconnect";
const RAW_MESSY = "um so the the websocket reconnect it doesn't back off it just uh hammers the endpoint";
const CLEAN_OUT = "The WebSocket reconnect doesn't back off — it just hammers the endpoint.";
const ENGINES = [
  { name:"Parakeet V3", desc:"NVIDIA · fast & accurate. Default.", acc:.92, spd:.96, local:true, ml:true, active:true },
  { name:"Whisper Large v3", desc:"OpenAI · highest accuracy, slower.", acc:.98, spd:.55, local:true, ml:true, size:"1.5 GB" },
  { name:"Moonshine V2", desc:"English only. High quality, tiny.", acc:.86, spd:.94, local:true, size:"192 MB" },
  { name:"Canary 180M Flash", desc:"Very fast. EN/DE/ES/FR + translation.", acc:.83, spd:.99, local:true, tr:true, size:"146 MB" },
];
const REFINE_MODELS = [
  { name:"Gemma 3 4B", desc:"On-device · QAT int4. Fast, private. Default.", acc:.9, spd:.92, local:true, active:true },
  { name:"Gemma 3 1B", desc:"On-device · tiny, for low-RAM machines.", acc:.78, spd:.99, local:true },
  { name:"Claude Haiku", desc:"Cloud · top quality. Needs cloud turned on.", acc:.96, spd:.95, cloud:true, locked:true },
];

/* ---------------- pieces ---------------- */
function Kbd({ children, lg }){ return <span className={"kbd"+(lg?" lg":"")}>{children}</span>; }
function KeyCombo({ keys, lg }){
  return <span className="kdrow">{keys.map((k,i)=>(<React.Fragment key={i}>{i>0&&<span className="plus">+</span>}<Kbd lg={lg}>{k}</Kbd></React.Fragment>))}</span>;
}
/* WinUI ProgressRing */
function Ring({ size=14 }){
  return <svg className="spinner" style={{width:size,height:size}} viewBox="0 0 24 24" fill="none"><circle className="spin-rot" cx="12" cy="12" r="8.5" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="20 40"/></svg>;
}
function useTyper(text, run, speed=24){
  const [n,setN] = useState(run? 0 : text.length);
  useEffect(()=>{
    if(!run){ setN(text.length); return; }
    setN(0); let i=0;
    const id=setInterval(()=>{ i+=1; setN(i); if(i>=text.length) clearInterval(id); }, speed);
    return ()=>clearInterval(id);
  },[text,run,speed]);
  return text.slice(0,n);
}
function Waveform({ active, bars=30, h=18 }){
  const [amps, setAmps] = useState(() => Array.from({length:bars}, ()=>0.12));
  useEffect(()=>{
    if(!active){ setAmps(Array.from({length:bars},()=>0.12)); return; }
    let raf, t=0;
    const tick=()=>{
      t+=0.4;
      setAmps(prev=>prev.map((_,i)=>{
        const env = Math.sin((i/bars)*Math.PI);
        const v = (Math.sin(t+i*0.6)*0.5+0.5)*Math.random()*0.85+0.12;
        return Math.max(0.12, v*env*1.2);
      }));
      raf=requestAnimationFrame(()=>setTimeout(tick,72));
    };
    tick();
    return ()=>cancelAnimationFrame(raf);
  },[active,bars]);
  return (<div className="wave" style={{height:h}}>{amps.map((a,i)=>(<span key={i} className={"b"+(active?"":" idle")} style={{height:`${Math.round(a*(h-2))+2}px`}}/>))}</div>);
}

/* ============================================================
   StrumWindow — variant-driven tiny runtime UI + settings
   ============================================================ */
function modeForVariant(v){ return (v==='promptIdle'||v==='refining'||v==='promptDone') ? 'prompt':'std'; }
function StrumWindow({ variant="idle", interactive=false, runKey=0, refineKey=0, scrubNonce=0 }){
  const [phase, setPhase] = useState(variant);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef([]);
  const clearTimers = ()=>{ timerRef.current.forEach(t=>clearTimeout(t)||clearInterval(t)); timerRef.current=[]; };

  useEffect(()=>{ clearTimers(); setPhase(variant); /* eslint-disable-next-line */ },[scrubNonce]);

  const runDictate = useCallback(()=>{
    clearTimers(); setElapsed(0); setPhase('listening');
    const iv=setInterval(()=>setElapsed(e=>+(e+0.1).toFixed(1)), 100); timerRef.current.push(iv);
    timerRef.current.push(setTimeout(()=>{ clearInterval(iv); setPhase('transcribing'); }, 2200));
    timerRef.current.push(setTimeout(()=>setPhase('done'), 2200+TRANSCRIPT.length*22+700));
  },[]);
  const runRefine = useCallback(()=>{
    clearTimers(); setPhase('refining');
    timerRef.current.push(setTimeout(()=>setPhase('promptDone'), COMMIT_OUT.length*28+900));
  },[]);
  useEffect(()=>{ if(runKey>0) runDictate(); /* eslint-disable-next-line */ },[runKey]);
  useEffect(()=>{ if(refineKey>0) runRefine(); /* eslint-disable-next-line */ },[refineKey]);
  useEffect(()=>()=>clearTimers(),[]);

  if(variant==='settings') return <EnginePickerWindow/>;
  if(variant==='settingsPrompt') return <EnginePickerWindow page="prompt"/>;

  /* PROMPT command popup */
  if(phase==='promptIdle') return <CommandPopup/>;

  /* LISTENING — wave capsule */
  if(phase==='listening'){
    return (
      <div className="cap listening">
        <span className="reddot"/>
        <span className="cap-lbl">REC</span>
        <Waveform active bars={30} h={20}/>
        <span className="timer">{elapsed.toFixed(1)}s</span>
      </div>
    );
  }

  /* DONE / PROMPT DONE — paste toast */
  if(phase==='done' || phase==='promptDone' || phase==='cleanDone'){
    const sub = phase==='promptDone' ? '· commit message' : phase==='cleanDone' ? '· cleaned' : '· verbatim';
    return (
      <div className="cap toast">
        <span className="checkwrap"><I.check/></span>
        <span className="toast-t">Pasted to cursor</span>
        <span className="toast-sub">{sub}</span>
      </div>
    );
  }

  /* TRANSCRIBING — small streaming popup */
  if(phase==='transcribing'){
    return (
      <Popup title="Transcribing" eng="Parakeet V3" engStatus="ok">
        <TranscribeBody/>
      </Popup>
    );
  }

  /* CLEANING — the default AI polish */
  if(phase==='cleaning'){
    return (
      <Popup title="Cleaning" eng="Gemma 3 4B" engStatus="ok" accent>
        <CleanBody/>
      </Popup>
    );
  }

  /* REFINING — small AI rewrite popup */
  if(phase==='refining'){
    return (
      <Popup title="Refining" eng="Gemma 3 4B" engStatus="ok" accent>
        <RefineBody/>
      </Popup>
    );
  }

  /* IDLE — minimal trigger pill */
  return (
    <div className={"cap idle"+(interactive?" tappable":"")} onClick={interactive?runDictate:undefined}>
      <span className="cap-ico"><I.mic/></span>
      <span className="cap-hint">Hold <span className="kdrow"><Kbd>Ctrl</Kbd><span className="plus">+</span><Kbd>Space</Kbd></span> to dictate</span>
    </div>
  );
}

/* small popup shell (Acrylic flyout) */
function Popup({ title, eng, engStatus="ok", accent, children }){
  return (
    <div className={"pop"+(accent?" accent":"")}>
      <span className="top-accent"/>
      <div className="pop-head">
        <Ring size={15}/>
        <span className="pop-ttl">{accent && <I.sparkle style={{width:13,height:13,marginRight:5,verticalAlign:-2,color:'var(--acc)'}}/>}{title}…</span>
        <span className="pop-eng"><span className={"dot"+(engStatus==='off'?' off':'')}/>{eng}</span>
      </div>
      <div className="pop-body">{children}</div>
    </div>
  );
}

function TranscribeBody(){
  const typed = useTyper(TRANSCRIPT, true, 22);
  const streaming = typed.length < TRANSCRIPT.length;
  return (
    <div>
      <div className="transcript">{typed}{streaming && <span className="caret"/>}</div>
      <div className="metaline"><span>{streaming?'streaming':'done'}</span><span className="sp">·</span><span>184 wpm</span><span className="lat"><I.clock style={{width:11,height:11}}/> <b>{streaming?'38 ms':'31 ms'}</b></span></div>
    </div>
  );
}
function RefineBody(){
  const typed = useTyper(COMMIT_OUT, true, 28);
  const streaming = typed.length < COMMIT_OUT.length;
  return (
    <div>
      <div className="refine-raw"><span className="rl">heard</span>{TRANSCRIPT}</div>
      <div className="refine-out"><span className="rl">“make it a commit message”</span><div className="codeblk">{typed}{streaming && <span className="caret"/>}</div></div>
      <div className="metaline"><span>{streaming?'rewriting':'done'}</span><span className="lat"><I.clock style={{width:11,height:11}}/> <b>{streaming?'412 ms':'388 ms'}</b></span></div>
    </div>
  );
}
function CleanBody(){
  const typed = useTyper(CLEAN_OUT, true, 24);
  const streaming = typed.length < CLEAN_OUT.length;
  return (
    <div>
      <div className="refine-raw"><span className="rl">heard</span>{RAW_MESSY}</div>
      <div className="refine-out"><span className="rl">cleaned</span><div className="codeblk" style={{fontFamily:'var(--sans)'}}>{typed}{streaming && <span className="caret"/>}</div></div>
      <div className="metaline"><span>{streaming?'cleaning':'done'}</span><span className="lat"><I.clock style={{width:11,height:11}}/> <b>{streaming?'120 ms':'104 ms'}</b></span></div>
    </div>
  );
}

/* PROMPT command popup (AutoSuggestBox) */
const PRESETS = [["commit message","Recent"],["slack standup",""],["fix grammar",""],["bullet points",""]];
function CommandPopup(){
  return (
    <div className="cmd">
      <div className="cmd-field">
        <span className="slash"><I.sparkle/></span>
        <div className="cmd-input">
          <div className="cmd-lead">PROMPT · rewrite dictation</div>
          <div className="cmd-val"><span className="ph">make it a commit message…</span><span className="caret"/></div>
        </div>
        <span className="cmd-kbd"><Kbd>Enter</Kbd></span>
      </div>
      <div className="cmd-list">
        {PRESETS.map(([p,tag],i)=>(
          <div className="ci" key={i}><span className="h">/</span><span className="ci-t">{p}</span>{tag && <span className="ci-tag">{tag}</span>}</div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   WinUI controls (ToggleSwitch, Slider, ComboBox, NumberBox,
   TextBox, RadioButtons, SettingsCard, SettingsExpander)
   ============================================================ */
function Toggle({ on=false }){
  const [v,setV] = useState(on);
  return <button className={"toggle"+(v?" on":"")} onClick={()=>setV(!v)} role="switch" aria-checked={v}><span className="knob"/></button>;
}
function Slider({ value=0.3, label }){
  const [v,setV] = useState(value);
  const pct = Math.round(v*100);
  const onClick = (e)=>{ const r=e.currentTarget.getBoundingClientRect(); setV(Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))); };
  return (
    <div className="slider">
      <span className="strack" onClick={onClick}><span className="sfill" style={{width:pct+"%"}}/><span className="sthumb" style={{left:pct+"%"}}/></span>
      <span className="sval">{label? label(v): v.toFixed(2)}</span>
    </div>
  );
}
function Combo({ value, items }){
  const [open,setOpen] = useState(false);
  const [val,setVal] = useState(value);
  return (
    <div className="comboWrap">
      <button className="combo" onClick={()=>setOpen(o=>!o)}><span>{val}</span><I.caret/></button>
      {open && items && (
        <div className="combo-pop">{items.map((it,i)=>(<div key={i} className={"ci"+(it===val?" on":"")} onClick={()=>{setVal(it);setOpen(false);}}>{it===val&&<I.check style={{width:13,height:13}}/>}<span>{it}</span></div>))}</div>
      )}
    </div>
  );
}
function NumberBox({ value=4000, suffix="ms", step=250 }){
  const [v,setV] = useState(value);
  return (
    <div className="numbox">
      <span className="nv">{v.toLocaleString()} {suffix}</span>
      <span className="spin">
        <button className="sb" onClick={()=>setV(v+step)}><svg viewBox="0 0 24 24" fill="none" style={{width:11,height:11}}><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        <button className="sb" onClick={()=>setV(Math.max(0,v-step))}><svg viewBox="0 0 24 24" fill="none" style={{width:11,height:11}}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
      </span>
    </div>
  );
}
function TextBox({ children, area, mask }){
  return <div className={"textbox"+(area?" area":"")+(mask?" mask":"")}>{children}</div>;
}
function Radios({ options, value }){
  const [val,setVal] = useState(value);
  return (
    <div className="radios">
      {options.map((o,i)=>(<button key={i} className={"radio"+(o===val?" on":"")} onClick={()=>setVal(o)}><span className="rc"/><span>{o}</span></button>))}
    </div>
  );
}
function SetCard({ icon:Ic, title, desc, children, last }){
  return (
    <div className="set-card" style={last?{marginBottom:0}:null}>
      {Ic && <span className="ic"><Ic/></span>}
      <span className="tx"><span className="t">{title}</span>{desc && <span className="d">{desc}</span>}</span>
      <span className="ctl">{children}</span>
    </div>
  );
}
function Expander({ icon:Ic, title, desc, badge, defaultOpen, rows }){
  const [open,setOpen] = useState(defaultOpen);
  return (
    <div className={"expander"+(open?" open":"")}>
      <div className="exp-head" onClick={()=>setOpen(o=>!o)}>
        {Ic && <span className="ic"><Ic/></span>}
        <span className="tx"><span className="t">{title}</span>{desc && <span className="d">{desc}</span>}</span>
        {badge && <span className="exp-badge">{badge}</span>}
        <I.caret className="chev"/>
      </div>
      {open && (
        <div className="exp-body">
          {rows.map((r,i)=>(
            <div className="erow" key={i}>
              <span className="tx"><span className="t">{r.t}</span>{r.d && <span className="d">{r.d}</span>}</span>
              <span className="ctl">{r.ctl}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SETTINGS WINDOW — Mica + NavigationView + SettingsCard
   ============================================================ */
function EngineMeter({ label, v }){
  return (<div className="meter"><span style={{width:30}}>{label}</span><span className="track"><span className="fill" style={{width:`${Math.round(v*100)}%`}}/></span></div>);
}
function EngineCard({ e, radio, selected }){
  return (
    <div className={"eng-card"+(e.active||selected?" active":"")+(e.locked?" locked":"")}>
      <div>
        <div className="nm">{radio && (e.locked ? <span className="lockico"><I.lock/></span> : <span className={"rc"+((e.active||selected)?" on":"")}/>)}{e.name} {e.active && !radio && <span className="badge"><I.check style={{width:11,height:11,verticalAlign:-2}}/> Active</span>} {e.local && <span className="badge local">Local</span>}{e.cloud && <span className="badge cloud">Cloud</span>}</div>
        <div className="desc">{e.desc}</div>
        <div className="tags">
          {e.ml && <span><I.globe/> Multi-language</span>}
          {!e.ml && !e.tr && !e.cloud && <span><I.globe/> English</span>}
          {e.tr && <span><I.translate/> Translate → EN</span>}
          {e.cloud && <span><I.plug/> API</span>}
        </div>
      </div>
      <div className="eng-meta">
        <EngineMeter label="acc" v={e.acc}/>
        <EngineMeter label="spd" v={e.spd}/>
        {e.size && <div className="dl"><I.download/> {e.size}</div>}
        {!e.size && e.active && <div className="dl" style={{color:'var(--ok)'}}><span style={{width:6,height:6,borderRadius:99,background:'var(--ok)',display:'inline-block'}}/> running</div>}
      </div>
    </div>
  );
}

function PromptModePage(){
  return (
    <div className="set-main">
      <h4>AI Rewrite</h4>
      <p className="sd">An optional layer on top of transcription. Off, Strum is a plain transcriber. On, it polishes what you said — fully on-device by default.</p>

      <div className="ai-master">
        <span className="ic"><I.sparkle/></span>
        <span className="tx"><span className="t">AI rewrite</span><span className="d">The whole feature, on or off. When off, dictation is pasted verbatim — just speech-to-text.</span></span>
        <Toggle on/>
      </div>

      <div className="fl-banner">
        <span className="fl-ico"><I.shield/></span>
        <div className="fl-tx"><b>Fully Local</b><span>Rewrites run 100% on-device — audio &amp; text never leave this machine.</span></div>
        <span className="fl-badge">Default</span>
      </div>

      <p className="set-group-lbl">Local model</p>
      {REFINE_MODELS.map((e,i)=><EngineCard key={i} e={e} radio/>)}

      <p className="set-group-lbl" style={{marginTop:18}}>Behavior</p>
      <Expander icon={I.gauge} title="Sampling & output" desc="Temperature, length, streaming" defaultOpen rows={[
        { t:"Temperature", d:"Lower = more literal", ctl:<Slider value={0.3}/> },
        { t:"Response length", d:"Token budget for the rewrite", ctl:<Combo value="Balanced" items={["Concise","Balanced","Verbose"]}/> },
        { t:"Stream tokens live", d:"Show text as it generates", ctl:<Toggle on/> },
        { t:"Preview before paste", d:"Confirm the rewrite first", ctl:<Toggle/> },
      ]}/>
      <Expander icon={I.doc} title="Context & instructions" desc="What the model sees with your speech" defaultOpen rows={[
        { t:"Use selected text as context", d:"Pass the current selection", ctl:<Toggle on/> },
        { t:"Include clipboard", d:"Append clipboard contents", ctl:<Toggle/> },
        { t:"Auto-detect code blocks", d:"Format commits, diffs, JSON", ctl:<Toggle on/> },
        { t:"System prompt", d:"Prepended to every rewrite", ctl:<TextBox area>You are a terminal-grade editor. Keep it terse, technical, and faithful to intent.<span className="caret"/></TextBox> },
      ]}/>

      <p className="set-group-lbl" style={{marginTop:18}}>Local engine</p>
      <SetCard icon={I.layers} title="Fallback model" desc="Used if the primary times out"><Combo value="Gemma 3 1B · local" items={["None","Gemma 3 1B · local","Gemma 3 12B · local"]}/></SetCard>
      <SetCard icon={I.clock} title="Request timeout" desc="Cancel and fall back after"><NumberBox value={4000} suffix="ms"/></SetCard>
      <SetCard icon={I.chip} title="Compute" desc="Where local inference runs"><Radios options={["GPU","CPU"]} value="GPU"/></SetCard>

      <p className="set-group-lbl" style={{marginTop:18}}>Cloud refinement · opt-in</p>
      <SetCard icon={I.cloud} title="Use a cloud model" desc="Default is fully local. Turn on to send rewrites to a cloud provider for top-tier quality."><Toggle/></SetCard>
      <div className="cloud-gate">
        <div className="cg-hint"><I.lock/> Turn on cloud refinement to set up a connection</div>
        <SetCard icon={I.key} title="Sign in (SSO)" desc="Authenticate with your provider — stores an auth token"><button className="ssobtn">Sign in</button></SetCard>
        <SetCard icon={I.plug} title="API key" desc="Or paste a provider key — kept in the OS vault" last><TextBox mask>sk-•••••••••••3f2a</TextBox></SetCard>
      </div>
    </div>
  );
}

function EnginesPage(){
  return (
    <div className="set-main">
      <h4>Engines</h4>
      <p className="sd">Transcription engines run the ASR — the base of the app. The optional <b>AI Rewrite</b> adds a refinement model on top. Local models keep audio on-device.</p>
      <p className="set-group-lbl">Transcription · ASR</p>
      {ENGINES.map((e,i)=><EngineCard key={i} e={e}/>)}
      <p className="set-group-lbl" style={{marginTop:18}}>Refinement · AI Rewrite (optional)</p>
      {REFINE_MODELS.map((e,i)=><EngineCard key={i} e={e}/>)}
    </div>
  );
}

function EnginePickerWindow({ page="engines" }){
  const nav = [
    ["General", I.sliders, false],
    ["Engines", I.chip, page==='engines'],
    ["AI Rewrite", I.sparkle, page==='prompt'],
    ["Shortcuts", I.cmd, false],
    ["History", I.history, false],
  ];
  return (
    <div className="win settings">
      <div className="win-chrome">
        <div className="ttl"><svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><rect x="2" y="2" width="20" height="20" rx="5" stroke="var(--acc)" strokeWidth="1.5"/><path d="M7 15.5c1.5-7 3-7 4.5 0M16.5 8.5c-1.5 7-3 7-4.5 0" stroke="var(--acc)" strokeWidth="1.5" strokeLinecap="round"/></svg> Strum — Settings</div>
        <div className="winbtns">
          <div className="wb"><I.min/></div>
          <div className="wb"><I.max/></div>
          <div className="wb close"><I.x/></div>
        </div>
      </div>
      <div className="settings-body">
        <nav className="set-nav">
          {nav.map(([label,Ic,on],i)=>(<a key={i} className={on?"on":""}><Ic/> {label}</a>))}
          <div className="set-foot">Parakeet V3 · ready<br/>v0.8.3 · check for updates</div>
        </nav>
        {page==='prompt' ? <PromptModePage/> : <EnginesPage/>}
      </div>
    </div>
  );
}

Object.assign(window, { StrumWindow, EnginePickerWindow, KeyCombo, Kbd, Ring, I });
