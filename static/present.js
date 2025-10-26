document.addEventListener('DOMContentLoaded', () => {
  const slideContent = document.getElementById('slide-content');
  const slideCounter = document.getElementById('slide-counter');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  let cells = [];
  let currentSlide = 0;

  function loadNotebook() {
    try {
      const raw = sessionStorage.getItem('jupyter-ish-presentation-data');
      
      

      if (!raw) {
        slideContent.innerHTML = '<h1>Presentation Data Not Found</h1><p>Please generate the presentation from the main notebook window again.</p>';
        cells = [];
        return;
      }
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.cells)) {
        cells = data.cells.filter(cell => !cell.isPresentHidden);
      }
    } catch (e) {
      console.error('Failed to load notebook for presentation', e);
      slideContent.innerHTML = '<h1>Error loading notebook data</h1>';
    }
  }

  function renderSlide() {
    if (cells.length === 0) {
      slideContent.innerHTML = '<h1>No content to present</h1>';
      slideCounter.textContent = '0 / 0';
      return;
    }

    const cell = cells[currentSlide];
    slideContent.innerHTML = ''; // Clear previous content

    switch (cell.type) {
      case 'markdown':
        slideContent.innerHTML = (window.marked && typeof window.marked.parse === 'function')
          ? window.marked.parse(cell.code)
          : `<h1>${cell.code}</h1>`;
        break;
      case 'dot':
        if (cell.output && cell.output.trim() !== '') {
            slideContent.innerHTML = cell.output;
        } else if (window.Viz) {
          const viz = new window.Viz();
          viz.renderSVGElement(cell.code)
            .then(svg => { slideContent.appendChild(svg); })
            .catch(err => { slideContent.innerHTML = `<h1>DOT Render Error</h1><pre>${err}</pre>`; });
        } else {
          slideContent.innerHTML = '<h1>Viz.js not available</h1>';
        }
        break;
      case 'image':
        if (cell.output && cell.output.trim() !== '') {
            slideContent.innerHTML = cell.output;
        } else {
            const img = new Image();
            img.src = cell.code;
            slideContent.appendChild(img);
        }
        break;
      case 'code':
      default:
        renderCodeCell(cell);
        break;
    }

    slideCounter.textContent = `${currentSlide + 1} / ${cells.length}`;
  }

  async function runCode(cell, container) {
    try {
      const res = await fetch('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cell.code })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || `Server Error: ${res.status}`);
      }
      const data = await res.json();
      const outputDiv = document.createElement('div');
      outputDiv.className = 'code-output';
      const out = [];
      if (data.stdout) out.push(data.stdout);
      if (data.result) out.push(String(data.result));
      if (data.stderr) out.push(`[stderr]\n${data.stderr}`);
      if (data.error) {
        out.push(`[error]\n${data.error}\n${data.traceback || ''}`);
        outputDiv.classList.add('error');
      }
      outputDiv.textContent = out.join('\n');
      container.appendChild(outputDiv);
    } catch (e) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'code-output error';
      errorDiv.textContent = e.message;
      container.appendChild(errorDiv);
    }
  }

  function renderCodeCell(cell) {
    const codePre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.textContent = cell.code;
    codePre.appendChild(codeEl);
    slideContent.appendChild(codePre);

    if (cell.output && cell.output.trim() !== '') {
        const outputDiv = document.createElement('div');
        outputDiv.className = 'code-output';
        outputDiv.innerHTML = cell.output;
        slideContent.appendChild(outputDiv);
    } else {
        runCode(cell, slideContent);
    }
  }

  function next() {
    if (currentSlide < cells.length - 1) {
      currentSlide++;
      renderSlide();
    }
  }

  function prev() {
    if (currentSlide > 0) {
      currentSlide--;
      renderSlide();
    }
  }

  // Event Listeners
  prevBtn.onclick = prev;
  nextBtn.onclick = next;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'Escape') window.close();
  });

  // Initial Load
  loadNotebook();
  renderSlide();
});