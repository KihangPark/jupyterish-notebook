const cellsEl = document.getElementById('cells');
const addCellBtn = document.getElementById('addCell');
const addMdCellBtn = document.getElementById('addMdCell');
const addDotCellBtn = document.getElementById('addDotCell');
const addImageCellBtn = document.getElementById('addImageCell');
const exportBtn = document.getElementById('exportBtn');
const fnameInput = document.getElementById('fnameInput');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const fileList = document.getElementById('fileList');
const restoreBtn = document.getElementById('restoreBtn');
const clearAutosaveBtn = document.getElementById('clearAutosaveBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importJsonFile = document.getElementById('importJsonFile');
const dotTplSelect = document.getElementById('dotTemplateSelect');
const insertDotTplBtn = document.getElementById('insertDotTplBtn');
const presentBtn = document.getElementById('presentBtn');

function createCell(id, type = 'code') {
  const wrapper = document.createElement('div');
  wrapper.className = 'cell';
  wrapper.dataset.id = id;
  wrapper.dataset.type = type;

  const input = document.createElement('textarea');
  input.className = 'cell-input';
  if (type === 'markdown') input.placeholder = '# Markdown here';
  else if (type === 'dot') input.placeholder = 'DOT graph here (e.g., digraph G { A->B })';
  else if (type === 'image') input.placeholder = 'Image URL or data URI or /fs/...';
  else input.placeholder = '# Python code here';

  const runBtn = document.createElement('button');
  runBtn.textContent = (type === 'markdown' || type === 'dot' || type === 'image') ? '▶ Render' : '▶ Run';
  if (type === 'markdown') {
    runBtn.onclick = async () => {
      try {
        const md = input.value || '';
        const html = (window.marked && typeof window.marked.parse === 'function')
          ? window.marked.parse(md)
          : simpleMarkdown(md);
        output.innerHTML = html;
        output.className = 'cell-output';
      } catch (e) {
        output.textContent = 'Render Error: ' + e;
        output.className = 'cell-output error';
      }
    };
  } else if (type === 'dot') {
    runBtn.onclick = async () => {
      try {
        const code = input.value || '';
        if (window.Viz) {
          const viz = new window.Viz();
          viz.renderSVGElement(code).then(svg => {
            output.innerHTML = '';
            output.appendChild(svg);
          }).catch(err => {
            output.textContent = 'Viz Render Error: ' + err;
            output.className = 'cell-output error';
          });
        } else {
          output.textContent = 'Viz.js not available. Ensure viz.js + full.render.js are loaded';
          output.className = 'cell-output error';
        }
      } catch (e) {
        output.textContent = 'Viz Render Error: ' + e;
        output.className = 'cell-output error';
      }
    };
  } else if (type === 'image') {
    runBtn.onclick = async () => {
      try {
        const src = (input.value || '').trim();
        if (!src) { output.textContent = 'Enter image URL or data URI or /fs path'; output.className = 'cell-output error'; return; }
        const img = new Image();
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.alt = src;
        img.onload = () => { output.innerHTML = ''; output.appendChild(img); output.className = 'cell-output'; };
        img.onerror = () => { output.textContent = 'Failed to load image: ' + src; output.className = 'cell-output error'; };
        img.src = src;
      } catch (e) {
        output.textContent = 'Image Render Error: ' + e;
        output.className = 'cell-output error';
      }
    };
  } else {
    runBtn.onclick = async () => {
      runBtn.disabled = true;
      const code = input.value;
      try {
        const res = await fetch('/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cell_id: id, code })
        });

        if (!res.ok) {
          let errorText = `Server Error: ${res.status} ${res.statusText}`;
          try {
            const errorData = await res.json();
            if (errorData.detail) {
              errorText += '\n' + (typeof errorData.detail === 'object' ? JSON.stringify(errorData.detail) : errorData.detail);
            }
          } catch (e) { /* Ignore JSON parsing errors */ }
          throw new Error(errorText);
        }

        const data = await res.json();
        const out = [];
        if (data.stdout) out.push(data.stdout);
        if (data.result) out.push(String(data.result));
        if (data.stderr) out.push('[stderr]\n' + data.stderr);
        
        if (data.error) {
          out.push('[error]\n' + data.error + (data.traceback ? '\n' + data.traceback : ''));
        }
        
        output.textContent = out.join('\n');
        output.className = 'cell-output' + (data.error ? ' error' : '');

      } catch (e) {
        output.textContent = e.message;
        output.className = 'cell-output error';
      } finally {
        runBtn.disabled = false;
      }
    };
  }

  const output = document.createElement('pre');
  output.className = 'cell-output';

  // Shortcuts
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      runBtn.click();
      const newId = 'cell_' + Date.now();
      const newCell = createCell(newId, 'code');
      if (wrapper.nextSibling) cellsEl.insertBefore(newCell, wrapper.nextSibling); else cellsEl.appendChild(newCell);
      const ni = newCell.querySelector('.cell-input'); if (ni) ni.focus();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runBtn.click();
      let cur = wrapper.nextElementSibling;
      while (cur) {
        if (cur.classList && cur.classList.contains('cell') && (cur.dataset.type || 'code') === 'code') {
          const ci = cur.querySelector('.cell-input');
          if (ci) ci.focus();
          break;
        }
        cur = cur.nextElementSibling;
      }
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = wrapper.previousElementSibling;
      if (prev) {
        cellsEl.insertBefore(wrapper, prev);
        scheduleAutoSave();
        setActiveCell(wrapper, input);
        input.focus();
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      const next = wrapper.nextElementSibling;
      if (next) {
        cellsEl.insertBefore(next, wrapper);
        scheduleAutoSave();
        setActiveCell(wrapper, input);
        input.focus();
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
      e.preventDefault();
      wrapper.remove();
      scheduleAutoSave();
    }
  });

  // Double click expand/collapse
  wrapper.addEventListener('dblclick', () => {
    const expanded = wrapper.classList.toggle('expanded');
    if (expanded) {
      requestAnimationFrame(() => { input.style.height = 'auto'; input.style.height = input.scrollHeight + 'px'; });
    } else { input.style.height = ''; }
  });

  // controls
  const controls = document.createElement('div');
  controls.className = 'cell-controls';
  const upBtn = document.createElement('button'); upBtn.textContent = '⬆ Move Up';
  upBtn.onclick = () => { const prev = wrapper.previousElementSibling; if (prev) { cellsEl.insertBefore(wrapper, prev); scheduleAutoSave(); setActiveCell(wrapper, input); input.focus(); } };
  const downBtn = document.createElement('button'); downBtn.textContent = '⬇ Move Down';
  downBtn.onclick = () => { const next = wrapper.nextElementSibling; if (next) { cellsEl.insertBefore(next, wrapper); scheduleAutoSave(); setActiveCell(wrapper, input); input.focus(); } };
  const delBtn = document.createElement('button'); delBtn.textContent = '🗑 Delete';
  delBtn.onclick = () => { wrapper.remove(); scheduleAutoSave(); };

  const foldBtn = document.createElement('button');
        foldBtn.textContent = '▼ Collapse';
        foldBtn.onclick = () => {
          const isCollapsed = wrapper.classList.toggle('cell-collapsed');
          foldBtn.textContent = isCollapsed ? '▶ Expand' : '▼ Collapse';
          scheduleAutoSave();
        };
  
        const copyBtn = document.createElement('button');
              copyBtn.textContent = '❐ Copy';
              copyBtn.onclick = () => {
                const code = input.value;
                navigator.clipboard.writeText(code).then(() => {
                  const originalText = copyBtn.textContent;
                  copyBtn.textContent = '✓ Copied!';
                  setTimeout(() => {
                    copyBtn.textContent = originalText;
                  }, 1500);
                }).catch(err => {
                  console.error('Failed to copy text: ', err);
                  alert('Failed to copy text.');
                });
              };
        
              const hideBtn = document.createElement('button');
              hideBtn.textContent = '👁 Hide in Present';
              hideBtn.onclick = () => {
                const isHidden = wrapper.classList.toggle('is-present-hidden');
                hideBtn.textContent = isHidden ? '🙉 Show in Present' : '👁 Hide in Present';
                scheduleAutoSave();
              };
        
              controls.appendChild(upBtn); controls.appendChild(downBtn); controls.appendChild(delBtn); controls.appendChild(foldBtn); controls.appendChild(copyBtn); controls.appendChild(hideBtn);  // Gutter with line numbers (editor-like)
  const gutter = document.createElement('div');
  gutter.className = 'cell-gutter';
  const gutterLines = document.createElement('pre');
  gutterLines.className = 'gutter-lines';
  gutter.appendChild(gutterLines);

  // Cell type badge
  const badge = document.createElement('div');
  badge.className = 'cell-badge ' + badgeClassFor(type);
  badge.textContent = type.toUpperCase();

  wrapper.appendChild(gutter);
  wrapper.appendChild(badge);
  wrapper.appendChild(input);
  wrapper.appendChild(runBtn);
  wrapper.appendChild(controls);
  wrapper.appendChild(output);

  // Attach gutter behaviors
  try { attachGutter(wrapper, input, gutter, gutterLines, output); } catch(_) {}

  // Mark cell active on interactions
  const markActive = () => setActiveCell(wrapper, input);
  wrapper.addEventListener('mousedown', markActive);
  input.addEventListener('focus', markActive);
  runBtn.addEventListener('mousedown', markActive);
  output.addEventListener('mousedown', markActive);
  controls.addEventListener('mousedown', markActive);

  // DnD
  wrapper.setAttribute('draggable', 'true');
  ensureDropIndicator();
  wrapper.addEventListener('dragstart', (e) => {
    wrapper.classList.add('dragging');
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  });
  wrapper.addEventListener('dragend', () => { wrapper.classList.remove('dragging'); removeDropIndicator(); scheduleAutoSave(); });
  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const bounds = wrapper.getBoundingClientRect();
    const before = (e.clientY - bounds.top) < bounds.height / 2;
    positionDropIndicator(wrapper, before);
    autoScrollIfNeeded(e.clientY);
  });
  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/plain');
    if (!srcId) return;
    const srcEl = Array.from(document.querySelectorAll('.cell')).find(c => c.dataset.id === srcId);
    if (!srcEl || srcEl === wrapper) return;
    const bounds = wrapper.getBoundingClientRect();
    const before = (e.clientY - bounds.top) < bounds.height / 2;
    if (before) cellsEl.insertBefore(srcEl, wrapper);
    else { if (wrapper.nextSibling) cellsEl.insertBefore(srcEl, wrapper.nextSibling); else cellsEl.appendChild(srcEl); }
    removeDropIndicator(); scheduleAutoSave();
  });
  return wrapper;
}

function addCell() { const id = 'cell_' + Date.now(); const cell = createCell(id, 'code'); insertAfterActive(cell); scheduleAutoSave(); setActiveCell(cell, cell.querySelector('.cell-input')); }
function addMdCell() { const id = 'cell_' + Date.now(); const cell = createCell(id, 'markdown'); insertAfterActive(cell); scheduleAutoSave(); setActiveCell(cell, cell.querySelector('.cell-input')); }
function addDotCell() { const id = 'cell_' + Date.now(); const cell = createCell(id, 'dot'); insertAfterActive(cell); scheduleAutoSave(); setActiveCell(cell, cell.querySelector('.cell-input')); }
function addImageCell() { const id = 'cell_' + Date.now(); const cell = createCell(id, 'image'); insertAfterActive(cell); scheduleAutoSave(); setActiveCell(cell, cell.querySelector('.cell-input')); }

// Bindings
if (addCellBtn) addCellBtn.onclick = addCell;
if (addMdCellBtn) addMdCellBtn.onclick = addMdCell;
if (addDotCellBtn) addDotCellBtn.onclick = addDotCell;
if (addImageCellBtn) addImageCellBtn.onclick = addImageCell;
if (exportBtn) exportBtn.onclick = exportScript;
if (saveBtn) saveBtn.onclick = saveNotebook;
if (loadBtn) loadBtn.onclick = loadNotebook;
if (restoreBtn) restoreBtn.onclick = () => { restoreFromAutosave(true); };
if (clearAutosaveBtn) clearAutosaveBtn.onclick = clearAutosave;
if (exportJsonBtn) exportJsonBtn.onclick = exportNotebookJson;
if (importJsonBtn) importJsonBtn.onclick = () => importJsonFile && importJsonFile.click();
if (importJsonFile) importJsonFile.addEventListener('change', handleImportJson, false);
if (insertDotTplBtn) insertDotTplBtn.onclick = insertDotTemplate;
if (presentBtn) {
  presentBtn.onclick = () => {
    try {
      const cells = Array.from(document.querySelectorAll('.cell')).map(cell => ({
        id: cell.dataset.id,
        type: cell.dataset.type || 'code',
        code: cell.querySelector('.cell-input')?.value || '',
        output: cell.querySelector('.cell-output')?.innerHTML || '',
        isPresentHidden: cell.classList.contains('is-present-hidden')
      }));
      const payload = { ts: Date.now(), cells };
      sessionStorage.setItem('jupyter-ish-presentation-data', JSON.stringify(payload));
      window.open('static/present.html', '_blank');
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        alert('Presentation failed: The notebook content is too large to be transferred. Please reduce the size of your outputs.');
      } else {
        alert('An unexpected error occurred while preparing the presentation.');
      }
      console.error('Presentation prep error:', e);
    }
  };
}

refreshList().catch(()=>{});
restoreFromAutosave();
if (!cellsEl.querySelector('.cell')) { try { addCell(); } catch(_) {} }
// initialize tabs
initTabs();

// Export current notebook to .py and save to server
function exportScript() {
  const ts = (function(){ const d = new Date(); const pad = (n)=> String(n).padStart(2,'0'); return (d.getFullYear().toString()+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds())); })();
  const rawName = (fnameInput?.value || '').trim();
  const safeBase = sanitizeBaseName(rawName);
  const filename = (safeBase ? (safeBase + '_') : '') + ts + '.py';
  const lines = [];
  lines.push('#!/usr/bin/env python3');
  lines.push('# Exported script ' + ts + ' from Jupyter-ish');
  lines.push('');
  const cells = Array.from(document.querySelectorAll('.cell'));
  for (const cell of cells) {
    const id = cell.dataset.id || '';
    const type = cell.dataset.type || 'code';
    const code = cell.querySelector('.cell-input')?.value || '';
    if (type === 'code') { lines.push(`# --- cell: ${id} (code) ---`); lines.push(code); lines.push(''); }
    else { lines.push(`# --- cell: ${id} (${type}) ---`); for (const l of code.split('\n')) lines.push('# '+l); lines.push(''); }
  }
  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/x-python' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  fetch('/export_script', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: rawName, content }) })
    .then(r=>r.json()).then(j=>{ if (j && j.saved) console.log('Server-side script saved:', j.filename); else console.warn('Server-side save failed', j); })
    .catch(err=> console.warn('Server-side save error', err));
}

function sanitizeBaseName(s) { return (s || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120); }

function simpleMarkdown(md) {
  return (window.marked && typeof window.marked.parse === 'function') ? window.marked.parse(md) : md.split('\n').map(line => {
    if (/^###\s+/.test(line)) return '<h3>' + line.replace(/^###\s+/, '') + '</h3>';
    if (/^##\s+/.test(line)) return '<h2>' + line.replace(/^##\s+/, '') + '</h2>';
    if (/^#\s+/.test(line)) return '<h1>' + line.replace(/^#\s+/, '') + '</h1>';
    return '<p>' + line + '</p>';
  }).join('');
}

// Autosave
const AUTOSAVE_KEY = 'farm_api_codex_04:autosave';
let _saveTimer = null;
function scheduleAutoSave() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(doAutosave, 400); }
function doAutosave() {
  _saveTimer = null;
  try {
    const cells = Array.from(document.querySelectorAll('.cell')).map(cell => ({
      id: cell.dataset.id,
      type: cell.dataset.type || 'code',
      code: cell.querySelector('.cell-input')?.value || '',
      isPresentHidden: cell.classList.contains('is-present-hidden')
    }));
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ts: Date.now(), cells }));
  } catch (e) { console.warn('autosave error', e); }
}
function restoreFromAutosave(explicit=false) {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.cells)) return;
    if (explicit && !confirm('Restore autosaved session? Current cells will be replaced.')) return;
    cellsEl.innerHTML = '';
    for (const c of data.cells) {
      const type = c.type || 'code';
      const cell = createCell(c.id || ('cell_' + Date.now()), type);
      cell.querySelector('.cell-input').value = c.code || '';
      cellsEl.appendChild(cell);
      const input = cell.querySelector('.cell-input'); if (input) input.addEventListener('input', scheduleAutoSave);
    }
  } catch (e) { console.warn('autosave restore error', e); }
}
function clearAutosave() { try { localStorage.removeItem(AUTOSAVE_KEY); alert('Autosave cleared.'); } catch (e) { console.warn('clear autosave error', e); } }

// Observe new cells to bind autosave input
const _obs = new MutationObserver((mut) => { for (const m of mut) { for (const node of m.addedNodes) { if (node.nodeType === 1 && node.classList.contains('cell')) { const ta = node.querySelector('.cell-input'); if (ta) ta.addEventListener('input', scheduleAutoSave); } } } });
_obs.observe(cellsEl, { childList: true });

// DnD helpers
let _dropIndicator = null; function ensureDropIndicator(){ if (!_dropIndicator) { _dropIndicator = document.createElement('div'); _dropIndicator.className = 'drop-indicator'; }}
function positionDropIndicator(targetCell, before){ if (!_dropIndicator) return; if (before) cellsEl.insertBefore(_dropIndicator, targetCell); else { if (targetCell.nextSibling) cellsEl.insertBefore(_dropIndicator, targetCell.nextSibling); else cellsEl.appendChild(_dropIndicator);} }
function removeDropIndicator(){ if (_dropIndicator && _dropIndicator.parentNode) { _dropIndicator.parentNode.removeChild(_dropIndicator); } }
let _scrollTimer = null; function autoScrollIfNeeded(clientY){ const margin=60, speed=12, vh=window.innerHeight||document.documentElement.clientHeight; let dy=0; if (clientY<margin) dy=-speed; else if (clientY>(vh-margin)) dy=speed; if (dy!==0){ if (_scrollTimer) clearInterval(_scrollTimer); _scrollTimer=setInterval(()=>window.scrollBy(0,dy),16);} else { if (_scrollTimer){ clearInterval(_scrollTimer); _scrollTimer=null; } } }

// Notebook file ops
async function saveNotebook() {
  const cells = Array.from(document.querySelectorAll('.cell')).map(cell => ({ id: cell.dataset.id, type: cell.dataset.type || 'code', code: cell.querySelector('.cell-input').value, output: cell.querySelector('.cell-output').textContent }));
  const baseName = (fnameInput?.value || '').trim();
  const res = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cells, name: baseName }) });
  const data = await res.json(); alert('Saved: ' + data.filename); await refreshList();
}
async function refreshList(){ const res = await fetch('/list'); const data = await res.json(); fileList.innerHTML=''; (data.files||[]).forEach(f=>{ const opt=document.createElement('option'); opt.value=f; opt.textContent=f; fileList.appendChild(opt); }); }
async function loadNotebook(){ const f = fileList.value; if (!f) return; const res = await fetch('/load?file=' + encodeURIComponent(f)); const data = await res.json(); cellsEl.innerHTML=''; (data.cells||[]).forEach(c=>{ const type=c.type||'code'; const cell=createCell(c.id||('cell_'+Date.now()), type); cell.querySelector('.cell-input').value=c.code||''; cell.querySelector('.cell-output').textContent=c.output||''; cellsEl.appendChild(cell); }); }

// Export/Import JSON
function exportNotebookJson(){ try { const cells = Array.from(document.querySelectorAll('.cell')).map(cell => ({ id: cell.dataset.id, type: cell.dataset.type || 'code', code: cell.querySelector('.cell-input')?.value || '' })); const payload = { exported_at: new Date().toISOString(), app: 'farm_api_codex_04', cells }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='notebook_export_'+Date.now()+'.json'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },0);} catch(e){ alert('Export failed: '+e); } }
function handleImportJson(ev){ const f=ev.target.files&&ev.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(String(reader.result||'{}')); if(!data||!Array.isArray(data.cells)) throw new Error('Invalid JSON structure'); if(!confirm('Import will replace current cells. Continue?')) return; cellsEl.innerHTML=''; for(const c of data.cells){ const type=c.type||'code'; const cell=createCell(c.id||('cell_'+Date.now()), type); cell.querySelector('.cell-input').value=c.code||''; cellsEl.appendChild(cell);} scheduleAutoSave(); alert('Import completed.'); } catch(e){ alert('Import failed: '+e);} finally { ev.target.value=''; } }; reader.onerror=()=>{ alert('Failed to read file.'); ev.target.value=''; }; reader.readAsText(f); }

// DOT templates
function getDotTemplate(key){
  switch(key){
    case 'flow':
      return `digraph G {\n  rankdir=TB;\n  node [shape=box, style=rounded];\n  Start -> "Check";\n  "Check" -> Done [label="Yes"];\n  "Check" -> Retry [label="No"];\n}`;
    case 'cluster':
      return `digraph Clustered {\n  graph [splines=true, bgcolor="#ffffff"];\n  node  [shape=ellipse, fontname="Helvetica"];\n  subgraph cluster_api { label="API"; color="#88c"; A1[label="Gateway"]; A2[label="Auth"]; }\n  subgraph cluster_db  { label="DB";  color="#c88"; D1[label="Postgres"]; }\n  A1 -> A2 -> D1;\n}`;
    case 'seq':
      return `digraph Seq {\n  rankdir=LR; node [shape=box];\n  User -> API [label="GET /status"];\n  API  -> User [label="200 OK"];\n}`;
    case 'deps':
      return `digraph Deps {\n  rankdir=LR; node[shape=box, style=rounded];\n  A -> B -> C;\n  B -> D [label="fallback"];\n}`;
    case 'state':
      return `digraph StateMachine {\n  rankdir=LR;\n  node [shape=circle];\n  OFF -> ON [label = "turn on"];\n  ON -> OFF [label = "turn off"];\n}`;
    case 'tree':
      return `digraph Tree {\n  node [shape=record];\n  root [label="<f0> | <f1> Root | <f2>"];\n  c1 [label="<f0> | <f1> Child 1 | <f2>"];\n  c2 [label="<f0> | <f1> Child 2 | <f2>"];\n  root:f0 -> c1;\n  root:f2 -> c2;\n}`;
    default:
      return '';
  }
}
function insertDotTemplate(){
  const key = dotTplSelect && dotTplSelect.value || '';
  const tpl = getDotTemplate(key);
  if (!tpl) return;
  const active = document.activeElement && document.activeElement.closest && document.activeElement.closest('.cell');
  if (active && (active.dataset.type === 'dot')){
    const ta = active.querySelector('.cell-input'); if (ta) { ta.value = tpl; ta.focus(); scheduleAutoSave(); }
  } else {
    const id = 'cell_' + Date.now();
    const cell = createCell(id, 'dot');
    insertAfterActive(cell);
    const ta = cell.querySelector('.cell-input'); if (ta) { ta.value = tpl; ta.focus(); }
    scheduleAutoSave();
  }
}

// --- Gutter helpers ---
function attachGutter(wrapper, textarea, gutter, linesEl, outputEl) {
  const update = () => {
    const value = textarea.value || '';
    const lineCount = value.split('\n').length || 1;
    const nums = [];
    for (let i=1;i<=lineCount;i++) nums.push(String(i));
    linesEl.textContent = nums.join('\n');
    // height & scroll sync
    const h = Math.max(textarea.offsetHeight || 0, (outputEl && outputEl.offsetHeight) || 0);
    gutter.style.height = h + 'px';
    linesEl.style.transform = 'translateY(' + (-textarea.scrollTop) + 'px)';
  };
  // initial
  update();
  // events
  textarea.addEventListener('input', update);
  textarea.addEventListener('scroll', update);
  const ro = new ResizeObserver(update);
  try { ro.observe(textarea); } catch(_){ /* optional */ }
}

// --- Badge helpers ---
function badgeClassFor(type){
  switch(type){
    case 'dot': return 'badge-dot';
    case 'markdown': return 'badge-markdown';
    case 'image': return 'badge-image';
    case 'code':
    default:
      return 'badge-code';
  }
}

// --- Tabs (editable, persistent) ---
const TABS_KEY = 'farm_api_codex_04:tabs';
function initTabs(){
  const bar = document.getElementById('tabbar'); if (!bar) return;
  const tabs = Array.from(bar.querySelectorAll('.tab'));
  const saved = loadTabs();
  if (saved && saved.names) {
    tabs.forEach((t,i)=>{ if (saved.names[i]) t.textContent = saved.names[i]; });
  }
  if (saved && typeof saved.active === 'number' && tabs[saved.active]) {
    tabs.forEach(t=>t.classList.remove('active'));
    tabs[saved.active].classList.add('active');
  }
  updateTitleFromTabs();
  tabs.forEach((t,i)=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(tb=>tb.classList.remove('active'));
      t.classList.add('active');
      persistTabs();
      updateTitleFromTabs();
    });
    t.addEventListener('input', ()=>{ limitTabLength(t); });
    t.addEventListener('blur', ()=>{ persistTabs(); updateTitleFromTabs(); });
    t.addEventListener('keydown', (e)=>{
      if (e.key==='Enter'){ e.preventDefault(); t.blur(); }
    });
  });
}
function limitTabLength(el){ if (el.textContent.length>48) el.textContent = el.textContent.slice(0,48); }
function loadTabs(){ try{ return JSON.parse(localStorage.getItem(TABS_KEY)||'null'); }catch(_){ return null; } }
function persistTabs(){
  const bar = document.getElementById('tabbar'); if (!bar) return;
  const tabs = Array.from(bar.querySelectorAll('.tab'));
  const names = tabs.map(t=>t.textContent.trim());
  const active = tabs.findIndex(t=>t.classList.contains('active'));
  localStorage.setItem(TABS_KEY, JSON.stringify({ names, active }));
}
function updateTitleFromTabs(){
  const bar = document.getElementById('tabbar'); if (!bar) return;
  const active = bar.querySelector('.tab.active');
  if (active){ document.title = `${active.textContent} · Dummy Jupyter‑ish Notebook`; }
}

// --- Active cell helpers & targeted inserts ---
function setActiveCell(wrapper, inputEl){
  Array.from(document.querySelectorAll('.cell.active')).forEach(c=>c.classList.remove('active'));
  wrapper.classList.add('active');
  if (inputEl) try { inputEl.focus(); } catch(_) {}
}
function getActiveCell(){ return document.querySelector('.cell.active'); }
function insertAfterActive(newCell){
  const active = getActiveCell();
  if (active && active.parentNode === cellsEl){
    if (active.nextSibling) cellsEl.insertBefore(newCell, active.nextSibling); else cellsEl.appendChild(newCell);
  } else {
    cellsEl.appendChild(newCell);
  }
}
