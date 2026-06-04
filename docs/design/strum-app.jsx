/* ============================================================
   STRUM — mounts: playground, icon grid, shortcut table,
   and all static window previews.
   ============================================================ */
const { createRoot } = ReactDOM;
function mount(sel, el){ const node = document.querySelector(sel); if(node) createRoot(node).render(el); }

/* ---------------- Playground ---------------- */
const PG_STATES = [
  ['idle','idle'],['listening','listening'],['transcribing','transcribe'],
  ['promptIdle','prompt /'],['refining','refine'],['done','toast'],['settings','settings'],
];
function Playground(){
  const [variant,setVariant] = useState('idle');
  const [nonce,setNonce] = useState(0);
  const [runKey,setRun] = useState(0);
  const [refineKey,setRefine] = useState(0);

  const scrub = (v)=>{ setVariant(v); setNonce(n=>n+1); };
  const dictate = ()=>{ setVariant('idle'); setNonce(n=>n+1); setRun(k=>k+1); };
  const refine  = ()=>{ setVariant('promptIdle'); setNonce(n=>n+1); setRefine(k=>k+1); };

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:54,width:'100%'}}>
      <div className="play-controls" style={{position:'relative',zIndex:3}}>
        <button className="btn-run" onClick={dictate}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          Dictate
        </button>
        <button className="btn-ghost" onClick={refine}>
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Refine
        </button>
        <div className="seg">
          {PG_STATES.map(([v,l])=>(
            <button key={v} className={variant===v?'on':''} onClick={()=>scrub(v)}>{l}</button>
          ))}
        </div>
      </div>
      <StrumWindow interactive variant={variant} scrubNonce={nonce} runKey={runKey} refineKey={refineKey}/>
    </div>
  );
}

/* ---------------- Icon grid ---------------- */
const ICON_SET = [
  ['mic','dictate'],['wave','listen'],['sparkle','refine'],['cmd','command'],
  ['chip','engine'],['sliders','settings'],['globe','language'],['translate','translate'],
  ['download','model'],['clock','latency'],['history','history'],['check','done'],
];
function IconGrid(){
  return (<>{ICON_SET.map(([k,t])=>{ const Ico = I[k]; return (
    <div className="ico-cell" key={k}><Ico/><span className="t">{t}</span></div>
  );})}</>);
}

/* ---------------- Shortcut table ---------------- */
const SHORTCUTS = [
  { keys:['Ctrl','Space'], name:'Dictate', desc:'Start/stop verbatim transcription · paste at cursor', acc:true },
  { keys:['Ctrl','Shift','Space'], name:'Prompt Mode', desc:'Dictate, then rewrite with the active instruction', acc:true },
  { keys:['/'], name:'Inline refine', desc:'Type in the bar to open the prompt field', inline:true },
  { keys:['Ctrl','Shift','V'], name:'Re-paste', desc:'Paste the previous result again' },
  { keys:['Ctrl','Shift','E'], name:'Engine picker', desc:'Open the engine / model switcher' },
  { keys:['Esc'], name:'Cancel', desc:'Stop recording · drop the AI rewrite' },
  { keys:['Enter'], name:'Accept', desc:'Confirm prompt & paste' },
  { keys:['Ctrl',','], name:'Settings', desc:'Open preferences' },
];
function ShortcutTable(){
  return (
    <div>
      {SHORTCUTS.map((s,i)=>(
        <div key={i} style={{display:'grid',gridTemplateColumns:'210px 150px 1fr',alignItems:'center',gap:16,
          padding:'13px 18px', borderBottom: i<SHORTCUTS.length-1?'1px solid var(--line)':'none'}}>
          <div>{s.inline
            ? <span className="kdrow"><Kbd lg>/</Kbd><span style={{color:'var(--tx-4)',fontSize:11,marginLeft:8}}>in bar</span></span>
            : <KeyCombo keys={s.keys} lg/>}
          </div>
          <div style={{fontFamily:'var(--mono)',fontSize:12.5,color: s.acc?'var(--acc-2)':'var(--tx)',fontWeight:600,letterSpacing:'.01em',display:'flex',alignItems:'center',gap:8}}>
            {s.acc && <span style={{width:5,height:5,borderRadius:99,background:'var(--acc)',boxShadow:'0 0 7px var(--acc-glow)'}}/>}
            {s.name}
          </div>
          <div style={{fontFamily:'var(--mono)',fontSize:11.5,color:'var(--tx-3)',lineHeight:1.5}}>{s.desc}</div>
        </div>
      ))}
      <div style={{padding:'14px 18px 8px',fontFamily:'var(--mono)',fontSize:10.5,color:'var(--tx-4)',letterSpacing:'.04em'}}>
        ▸ All bindings are global &amp; remappable · <span style={{color:'var(--acc)'}}>accent dot</span> = mode trigger · glyphs follow host OS (Windows shown)
      </div>
    </div>
  );
}

/* ---------------- mount everything ---------------- */
mount('#icon-grid', <IconGrid/>);
mount('#shortcut-table', <ShortcutTable/>);
mount('[data-mount="hero"]', <StrumWindow variant="listening"/>);
mount('[data-mount="anatomy"]', <StrumWindow variant="listening"/>);
mount('[data-mount="playground"]', <Playground/>);
mount('[data-mount="mode-std"]', <StrumWindow variant="cleaning"/>);
mount('[data-mount="mode-prompt"]', <StrumWindow variant="promptIdle"/>);
mount('[data-mount="fb-listen"]', <StrumWindow variant="listening"/>);
mount('[data-mount="fb-trans"]', <StrumWindow variant="transcribing"/>);
mount('[data-mount="fb-refine"]', <StrumWindow variant="refining"/>);
mount('[data-mount="eng-chip"]', <StrumWindow variant="transcribing"/>);
mount('[data-mount="eng-picker"]', <StrumWindow variant="settings"/>);
mount('[data-mount="ai-settings"]', <StrumWindow variant="settingsPrompt"/>);

/* UI across configurations */
mount('[data-mount="cfg-stt-idle"]', <StrumWindow variant="idle"/>);
mount('[data-mount="cfg-stt-listen"]', <StrumWindow variant="listening"/>);
mount('[data-mount="cfg-stt-toast"]', <StrumWindow variant="done"/>);
mount('[data-mount="cfg-ai-idle"]', <StrumWindow variant="idle"/>);
mount('[data-mount="cfg-ai-listen"]', <StrumWindow variant="listening"/>);
mount('[data-mount="cfg-ai-clean"]', <StrumWindow variant="cleaning"/>);
mount('[data-mount="cfg-ai-toast"]', <StrumWindow variant="cleanDone"/>);
