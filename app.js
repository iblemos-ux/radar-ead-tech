(() => {
  const $ = s => document.querySelector(s);
  const state = { opps: [], log: [], mine: {}, sel: null, erro: false };
  const STORE = 'radar-ead-acompanhamento';
  try { state.mine = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { state.mine = {}; }
  const DAY = 864e5;
  const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const parse = s => { if (!s) return null; const [y,m,d] = String(s).slice(0,10).split('-').map(Number); return y ? new Date(y, m-1, d) : null; };
  const fmt = s => { const d = parse(s); return d ? d.toLocaleDateString('pt-BR') : 'NÃO INFORMADO'; };
  const daysTo = s => { const d = parse(s); return d ? Math.round((d - today())/DAY) : null; };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function phase(o){
    const ini = daysTo(o.inscricaoInicio), fim = daysTo(o.inscricaoFim);
    if (o.situacao === 'AGUARDANDO CONFIRMAÇÃO OFICIAL') return {k:'futura', label:'Aguardando confirmação'};
    if (fim !== null && fim < 0) return {k:'enc', label:'Encerrada'};
    if (ini !== null && ini > 0) return {k:'futura', label:'Inscrições futuras'};
    if (fim !== null && fim <= 7) return {k:'prazo', label:'Prazo encerrando'};
    return {k:'aberta', label:'Inscrições abertas'};
  }
  const tipoRank = {'Graduação':0,'Técnico':1,'FIC':2,'Livre':2,'Extensão':2};
  const phaseRank = {prazo:0, aberta:0, futura:1, enc:3};
  function sortOpps(a,b){
    const pa = phase(a).k, pb = phase(b).k;
    return (phaseRank[pa]-phaseRank[pb]) || ((a.viabilidade||'C').localeCompare(b.viabilidade||'C'))
      || ((tipoRank[a.tipo]??3)-(tipoRank[b.tipo]??3)) || ((daysTo(a.inscricaoFim)??9999)-(daysTo(b.inscricaoFim)??9999));
  }

  function filtered(){
    const q = $('#q').value.trim().toLowerCase(), sit = $('#f-sit').value, via = $('#f-via').value, tipo = $('#f-tipo').value, mine = $('#f-mine').value, hide = $('#f-hide').checked;
    return state.opps.filter(o => {
      const ph = phase(o).k, m = state.mine[o.id]?.status || 'none';
      if (hide && (o.viabilidade === 'D' || ph === 'enc') && !via && sit !== 'encerradas') return false;
      if (q && ![o.curso,o.instituicao,o.estado,o.edital,o.area].join(' ').toLowerCase().includes(q)) return false;
      if (sit === 'abertas' && !(ph === 'aberta' || ph === 'prazo')) return false;
      if (sit === 'prazo' && ph !== 'prazo') return false;
      if (sit === 'futuras' && ph !== 'futura') return false;
      if (sit === 'encerradas' && ph !== 'enc') return false;
      if (via && o.viabilidade !== via) return false;
      if (tipo && o.tipo !== tipo) return false;
      if (mine && m !== mine) return false;
      return true;
    }).sort(sortOpps);
  }

  const mineLabel = {interesse:'Tenho interesse', inscrito:'Inscrito', descartado:'Descartado'};

  function renderSummary(){
    const live = state.opps.filter(o => ['aberta','prazo'].includes(phase(o).k));
    $('#s-open').textContent = live.length;
    $('#s-open-sub').textContent = `${state.opps.length} oportunidades no acervo`;
    $('#s-pe').textContent = live.filter(o => o.viabilidade === 'A' || o.viabilidade === 'B').length;
    const next = live.filter(o => o.viabilidade !== 'D' && daysTo(o.inscricaoFim) !== null).sort((a,b) => daysTo(a.inscricaoFim)-daysTo(b.inscricaoFim))[0];
    if (next){ const d = daysTo(next.inscricaoFim); $('#s-next').textContent = d === 0 ? 'Hoje' : `${d} dia${d===1?'':'s'}`; $('#s-next-sub').textContent = `${next.curso} · ${next.instituicao}`; }
    else { $('#s-next').textContent = '–'; $('#s-next-sub').textContent = 'nenhum prazo em aberto'; }
    $('#s-new').textContent = state.opps.filter(o => { const d = daysTo(o.primeiraDeteccao); return d !== null && d >= -7; }).length;
    const last = state.log[0];
    $('#lastcheck').innerHTML = last ? `Última verificação: <b class="mono">${fmt(last.data)}</b><br>${esc(last.resumo || '')}` : (state.erro ? 'Não foi possível carregar os dados. Atualize a página.' : 'Carregando dados…');
  }

  function renderRuler(){
    const svg = $('#ruler'), W = 1000, L = 30, R = 970, span = 60, x = d => L + (R-L) * (d/span);
    const css = getComputedStyle(document.documentElement), col = v => css.getPropertyValue(v).trim();
    let out = `<line x1="${L}" y1="70" x2="${R}" y2="70" stroke="${col('--line')}" stroke-width="2"/>`;
    for (let d = 0; d <= span; d += 7){
      const dt = new Date(today().getTime() + d*DAY);
      out += `<line x1="${x(d)}" y1="64" x2="${x(d)}" y2="76" stroke="${col('--line')}" stroke-width="1.5"/>`
           + `<text x="${x(d)}" y="96" text-anchor="middle" font-size="12" font-family="JetBrains Mono, monospace" fill="${col('--muted')}">${d===0?'hoje':dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>`;
    }
    out += `<rect x="${x(0)}" y="66" width="${x(7)-x(0)}" height="8" fill="${col('--vD-soft')}"/>`;
    const items = state.opps.filter(o => ['aberta','prazo'].includes(phase(o).k)).map(o => ({o, d: daysTo(o.inscricaoFim)})).filter(i => i.d !== null && i.d <= span).sort((a,b)=>a.d-b.d)
      .filter(function(i){ const k = i.o.edital ? `${i.o.instituicao}|${i.o.edital}|${i.d}` : i.o.id; if (this[k]) { this[k].n++; return false; } i.n = 1; this[k] = i; return true; }, {});
    const lanes = [];
    items.forEach(({o,d,n}) => {
      const cx = x(d); let lane = lanes.findIndex(e => cx - e > 150); if (lane < 0){ lane = lanes.length; lanes.push(0); } lanes[lane] = cx;
      const y = 48 - (lane % 3) * 16, c = col('--v' + (o.viabilidade||'C'));
      const label = n > 1 ? `${o.instituicao} · ${n} cursos` : (o.curso.length > 22 ? o.curso.slice(0,21)+'…' : o.curso);
      out += `<g style="cursor:pointer" data-id="${esc(o.id)}"><line x1="${cx}" y1="${y+4}" x2="${cx}" y2="70" stroke="${c}" stroke-width="1.5"/><circle cx="${cx}" cy="70" r="6" fill="${c}"/>`
           + `<text x="${Math.min(cx+6, W-150)}" y="${y}" font-size="12.5" font-weight="600" font-family="Public Sans, sans-serif" fill="${col('--ink')}">${esc(label)}</text></g>`;
    });
    if (!items.length) out += `<text x="${W/2}" y="40" text-anchor="middle" font-size="14" fill="${col('--muted')}" font-family="Public Sans, sans-serif">Sem prazos de encerramento nos próximos 60 dias</text>`;
    svg.innerHTML = out;
    svg.querySelectorAll('g[data-id]').forEach(g => g.addEventListener('click', () => select(g.dataset.id)));
  }

  function renderList(){
    const rows = filtered(), list = $('#list');
    if (!state.opps.length){
      list.innerHTML = `<div class="empty"><h3>Nenhuma oportunidade no acervo</h3>As oportunidades aparecem aqui assim que o monitor verificar um edital em fonte oficial. Cada execução diária grava as novidades e o histórico de verificação.</div>`;
      return;
    }
    if (!rows.length){ list.innerHTML = `<div class="empty"><h3>Nada com esses filtros</h3>Desmarque "Ocultar D e encerradas" ou limpe a busca para ver o acervo completo.</div>`; return; }
    const groups = [], byKey = {};
    rows.forEach(o => { const k = o.edital ? `${o.instituicao}|${o.edital}` : o.id; if (!byKey[k]) groups.push(byKey[k] = []); byKey[k].push(o); });
    const daysCell = o => {
      const ph = phase(o), d = daysTo(o.inscricaoFim), ini = daysTo(o.inscricaoInicio);
      return ph.k === 'futura' && ini !== null ? `<div class="d">${ini}</div><small>dias p/ abrir</small>`
        : ph.k === 'enc' ? `<div class="d" style="color:var(--muted)">—</div><small>encerrada</small>`
        : d !== null ? `<div class="d ${d<=7?'urg':''}">${d}</div><small>dia${d===1?'':'s'} p/ fechar</small>` : `<small>prazo n/inf.</small>`;
    };
    const card = o => {
      const ph = phase(o), m = state.mine[o.id]?.status, daysHtml = daysCell(o);
      return `<button class="item" data-id="${esc(o.id)}" aria-current="${state.sel===o.id}">
        <span class="grade g-${esc(o.viabilidade||'C')}" title="Viabilidade ${esc(o.viabilidade||'C')}">${esc(o.viabilidade||'C')}</span>
        <span style="min-width:0"><h3>${esc(o.curso)}</h3>
          <div class="meta">${esc(o.instituicao)} · ${esc(o.estado)} · ${esc(o.tipo)}</div>
          <span class="chips"><span class="chip st-${ph.k}">${ph.label}</span>${o.edital?`<span class="chip mono">${esc(o.edital)}</span>`:''}${m?`<span class="chip mine">${mineLabel[m]}</span>`:''}</span>
        </span>
        <span class="days">${daysHtml}</span></button>`;
    };
    const shortName = c => c.replace(/^(Tecnologia|Técnico) em /, '');
    const groupCard = g => {
      const o = g[0], ph = phase(o), best = g.map(x => x.viabilidade || 'C').sort()[0];
      return `<div class="item group" aria-current="${g.some(x => x.id === state.sel)}">
        <span class="grade g-${esc(best)}" title="Melhor viabilidade do edital: ${esc(best)}">${esc(best)}</span>
        <span style="min-width:0"><h3>${esc(o.instituicao)} · ${g.length} cursos</h3>
          <div class="meta">${esc(o.estado)} · ${esc(o.tipo)} · <span class="mono">${esc(o.edital)}</span></div>
          <span class="courses">${g.map(x => { const m = state.mine[x.id]?.status; return `<button type="button" class="course" data-id="${esc(x.id)}" aria-current="${state.sel === x.id}">${esc(shortName(x.curso))}${m ? ` · ${mineLabel[m]}` : ''}</button>`; }).join('')}</span>
          <span class="chips"><span class="chip st-${ph.k}">${ph.label}</span></span>
        </span>
        <span class="days">${daysCell(o)}</span></div>`;
    };
    list.innerHTML = groups.map(g => g.length === 1 ? card(g[0]) : groupCard(g)).join('');
    list.querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', () => select(b.dataset.id)));
  }

  const FIELDS = [
    ['Instituição','instituicao'],['Estado','estado'],['Tipo','tipo'],['Área','area'],['Situação','situacao'],['Inscrições',o=>`${fmt(o.inscricaoInicio)} a ${fmt(o.inscricaoFim)}`],
    ['Duração / carga horária','cargaHoraria'],['Vagas','vagas'],['Mensalidade','mensalidade'],['Taxa de inscrição','taxa'],['Certificado ou diploma','certificado'],
    ['Polos disponíveis','polos'],['Morador de PE pode participar?','pePodeParticipar'],['Atividades presenciais','atividadesPresenciais'],['Aulas síncronas obrigatórias','aulasSincronas'],
    ['Provas presenciais','provasPresenciais'],['Processo seletivo','processoSeletivo'],['Classificação de viabilidade',o=>`${o.viabilidade} · ${({A:'Alta viabilidade',B:'Viabilidade condicionada',C:'Pendente',D:'Incompatível'})[o.viabilidade]||''}`],
    ['Link oficial do edital','linkEdital'],['Link oficial de inscrição','linkInscricao'],['Data da verificação',o=>fmt(o.dataVerificacao)],['Observações importantes','observacoes']
  ];
  const val = (o,f) => typeof f === 'function' ? f(o) : o[f];
  const showVal = v => {
    const s = String(v ?? '').trim();
    if (!s) return `<span class="pend">NÃO INFORMADO</span>`;
    if (/^https?:\/\//.test(s)) return `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\//,''))}</a>`;
    return esc(s).replace(/(PENDENTE DE CONFIRMAÇÃO|NÃO INFORMADO)/g,'<span class="pend">$1</span>');
  };

  function reportText(o){
    return [`CURSO: ${o.curso}`, ...FIELDS.map(([l,f]) => `${l.toUpperCase()}: ${String(val(o,f) ?? '').trim() || 'NÃO INFORMADO'}`)].join('\n');
  }

  function renderSheet(){
    const o = state.opps.find(x => x.id === state.sel), el = $('#sheet');
    if (!o){ el.innerHTML = `<div class="empty" style="border:0">${state.opps.length ? '<h3>Selecione uma oportunidade</h3>A ficha mostra todos os campos do edital no formato padronizado, com o item que fundamenta cada informação crítica.' : '<h3>A ficha aparece aqui</h3>Quando houver oportunidades no acervo, escolha uma na lista para ver os detalhes.'}</div>`; return; }
    const ph = phase(o), m = state.mine[o.id] || {};
    const alerts = [];
    if (/obrigat/i.test(o.atividadesPresenciais||'') || /presencial/i.test(o.provasPresenciais||'') && !/^n[aã]o/i.test(o.provasPresenciais||'')) alerts.push(['','Há exigência presencial a considerar: veja Atividades e Provas presenciais.']);
    if (o.viabilidade === 'D') alerts.push(['bad','Classificada como incompatível com participação a partir de Pernambuco.']);
    if (ph.k === 'prazo') alerts.push(['bad', `Inscrições encerram em ${daysTo(o.inscricaoFim)} dia(s), em ${fmt(o.inscricaoFim)}.`]);
    el.innerHTML = `
      <div class="sheet-head">
        <span class="label">Curso</span>
        <h2>${esc(o.curso)}</h2>
        <div class="row"><span class="grade g-${esc(o.viabilidade)}" style="width:34px;height:34px;font-size:17px">${esc(o.viabilidade)}</span><span class="chip st-${ph.k}">${ph.label}</span>${o.edital?`<span class="chip mono">${esc(o.edital)}</span>`:''}</div>
      </div>
      ${alerts.map(([c,t]) => `<div class="alertbox ${c}">${esc(t)}</div>`).join('')}
      <dl class="fields">${FIELDS.map(([l,f]) => `<dt>${l}</dt><dd>${showVal(val(o,f))}</dd>`).join('')}
        ${(o.fontes||[]).length ? `<dt>Fontes consultadas</dt><dd>${o.fontes.map(u=>showVal(u)).join('<br>')}</dd>` : ''}
      </dl>
      <div class="track">
        <span class="label">Meu acompanhamento</span>
        <div class="seg" id="seg">${Object.entries(mineLabel).map(([k,l]) => `<button type="button" data-k="${k}" aria-pressed="${m.status===k}">${l}</button>`).join('')}</div>
        <textarea id="note" placeholder="Anotações: documentos a separar, polo escolhido, dúvidas para a coordenação…">${esc(m.nota||'')}</textarea>
        <div class="actions">
          <button class="btn" id="save" type="button">Salvar acompanhamento</button>
          <button class="btn ghost" id="copy" type="button">Copiar ficha</button>
          <span class="toast" id="toast" role="status"></span>
        </div>
      </div>`;
    let pick = m.status || null;
    el.querySelectorAll('#seg button').forEach(b => b.addEventListener('click', () => {
      pick = pick === b.dataset.k ? null : b.dataset.k;
      el.querySelectorAll('#seg button').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === pick));
    }));
    $('#save').addEventListener('click', () => saveMine(o.id, pick, $('#note').value));
    $('#copy').addEventListener('click', async () => {
      const t = reportText(o);
      try { await navigator.clipboard.writeText(t); $('#toast').textContent = 'Ficha copiada.'; }
      catch { const ta = $('#note'); const keep = ta.value; ta.value = t; ta.select(); $('#toast').textContent = 'Texto selecionado: use Ctrl+C. Não salve agora.'; setTimeout(()=>{ ta.value = keep; }, 8000); }
    });
  }

  async function saveMine(id, status, nota){
    const next = {...state.mine};
    if (!status && !nota.trim()) delete next[id]; else next[id] = {status: status || null, nota: nota.trim(), em: new Date().toISOString().slice(0,10)};
    try { localStorage.setItem(STORE, JSON.stringify(next)); state.mine = next; $('#toast').textContent = 'Acompanhamento salvo neste navegador.'; renderList(); }
    catch { $('#toast').textContent = 'O navegador bloqueou o salvamento. Verifique se a navegação anônima está desligada.'; }
  }

  function renderLog(){
    $('#log').innerHTML = state.log.length ? state.log.map(v => `<li><span class="mono">${fmt(v.data)}</span><span>${esc(v.resumo||'')}${v.fontesConsultadas?` <span style="color:var(--muted)">· ${esc(v.fontesConsultadas)}</span>`:''}</span></li>`).join('')
      : `<li><span></span><span style="color:var(--muted)">O monitor registra aqui cada execução, inclusive as que não encontram novidades.</span></li>`;
  }

  function select(id){ state.sel = id; renderList(); renderSheet(); if (matchMedia('(max-width:900px)').matches) $('#sheet').scrollIntoView({behavior:'smooth',block:'start'}); }
  function renderAll(){ renderSummary(); renderRuler(); renderList(); renderSheet(); renderLog(); }

  ['#q','#f-sit','#f-via','#f-tipo','#f-mine','#f-hide'].forEach(s => $(s).addEventListener('input', renderList));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', renderRuler);
  new MutationObserver(renderRuler).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});

  renderAll();

  // Carrega o arquivo de dados que a varredura diária atualiza no repositório
  fetch('dados.json?v=' + Date.now(), {cache: 'no-store'})
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(dados => {
      state.opps = dados.oportunidades || [];
      state.log = (dados.verificacoes || []).slice().sort((a,b) => String(b.data).localeCompare(String(a.data)));
      const first = state.opps.filter(o => o.viabilidade !== 'D' && phase(o).k !== 'enc').sort(sortOpps)[0];
      state.sel = first?.id || null;
      renderAll();
    })
    .catch(() => { state.erro = true; renderSummary(); });
})();
