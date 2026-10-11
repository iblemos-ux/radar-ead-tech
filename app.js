(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const STORE = 'radar-ead-acompanhamento';
  const DAY = 864e5;

  const state = { opps: [], log: [], mine: {}, sel: null, erro: false, sort: { k: 'prazo', dir: 1 } };
  try { state.mine = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { state.mine = {}; }

  // ---------- utilidades ----------
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const parse = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const fmt = s => { const d = parse(s); return d ? d.toLocaleDateString('pt-BR') : 'NÃO INFORMADO'; };
  const fmtDM = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const daysTo = s => { const d = parse(s); return d ? Math.round((d - today()) / DAY) : null; };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const VIAB = { A: 'Alta viabilidade', B: 'Viabilidade condicionada', C: 'Pendente', D: 'Incompatível' };
  const mineLabel = { interesse: 'Tenho interesse', inscrito: 'Inscrito', descartado: 'Descartado' };
  const inst = o => String(o.instituicao || '').split(' · ')[0];
  const campus = o => String(o.instituicao || '').split(' · ').slice(1).join(' · ');
  const curto = c => String(c || '').replace(/^(Tecnologia|Técnico|Técnico Subsequente) em /, '').replace(/\s*\([^)]*\)\s*$/, '');
  const via = o => o.viabilidade || 'C';

  function phase(o) {
    const ini = daysTo(o.inscricaoInicio), fim = daysTo(o.inscricaoFim);
    if (o.situacao === 'AGUARDANDO CONFIRMAÇÃO OFICIAL') return { k: 'futura', label: 'Aguardando confirmação' };
    if (fim !== null && fim < 0) return { k: 'enc', label: 'Encerrada' };
    if (ini !== null && ini > 0) return { k: 'futura', label: 'Inscrições futuras' };
    if (fim !== null && fim <= 7) return { k: 'prazo', label: 'Prazo encerrando' };
    return { k: 'aberta', label: 'Inscrições abertas' };
  }
  const isOpen = o => ['aberta', 'prazo'].includes(phase(o).k);
  const phaseRank = { prazo: 0, aberta: 0, futura: 1, enc: 3 };
  const tipoRank = { 'Graduação': 0, 'Especialização': 0, 'Técnico': 1, 'FIC': 2, 'Livre': 2, 'Extensão': 2 };
  const byPriority = (a, b) => (phaseRank[phase(a).k] - phaseRank[phase(b).k]) || via(a).localeCompare(via(b))
    || ((tipoRank[a.tipo] ?? 3) - (tipoRank[b.tipo] ?? 3)) || ((daysTo(a.inscricaoFim) ?? 9999) - (daysTo(b.inscricaoFim) ?? 9999));

  // Agrupa cursos do mesmo edital da mesma instituição/campus
  function agrupar(list) {
    const map = new Map();
    list.forEach(o => { const k = o.edital ? `${o.instituicao}|${o.edital}` : o.id; if (!map.has(k)) map.set(k, []); map.get(k).push(o); });
    return [...map.values()].map(items => {
      items.sort(byPriority);
      const o = items[0];
      const fims = items.map(x => daysTo(x.inscricaoFim)).filter(d => d !== null);
      return { items, o, best: items.map(via).sort()[0], fim: fims.length ? Math.min(...fims) : null, ph: phase(o) };
    });
  }

  // ---------- resumo ----------
  function renderKpis() {
    const open = state.opps.filter(isOpen);
    const editais = agrupar(open).length;
    $('#k-open').textContent = open.length;
    $('#k-open-sub').textContent = `${plural(editais, 'edital', 'editais')} · ${state.opps.length} no acervo`;
    const a = open.filter(o => via(o) === 'A').length, b = open.filter(o => via(o) === 'B').length;
    $('#k-pe').textContent = a + b;
    $('#k-pe-sub').textContent = `A: ${a} · B: ${b} · inscrições abertas`;
    const urg = open.filter(o => via(o) !== 'D' && daysTo(o.inscricaoFim) !== null && daysTo(o.inscricaoFim) <= 7)
      .sort((x, y) => daysTo(x.inscricaoFim) - daysTo(y.inscricaoFim));
    $('#k-7').textContent = urg.length;
    if (urg.length) { const d = daysTo(urg[0].inscricaoFim); $('#k-7-sub').textContent = `Próximo: ${inst(urg[0])} · ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}`; }
    else $('#k-7-sub').textContent = 'Nenhum prazo A, B ou C nesta semana';
    const novas = state.opps.filter(o => { const d = daysTo(o.primeiraDeteccao); return d !== null && d >= -7; });
    $('#k-new').textContent = novas.length;
    $('#k-new-sub').textContent = novas.length ? `${novas.filter(o => via(o) !== 'D').length} com viabilidade A, B ou C` : 'Sem novidades na semana';
    const last = state.log[0];
    $('#lastcheck').innerHTML = state.erro ? 'Não foi possível carregar os dados. Tente atualizar.'
      : last ? `Última verificação: <b>${esc(fmt(last.data))}</b>` : 'Carregando dados…';
  }

  // ---------- cronograma ----------
  function renderGantt() {
    const el = $('#gantt'), comD = $('#g-d').checked;
    const gs = agrupar(state.opps.filter(o => ['aberta', 'prazo', 'futura'].includes(phase(o).k) && (comD || via(o) !== 'D') && daysTo(o.inscricaoFim) !== null))
      .sort((x, y) => (x.fim - y.fim) || x.best.localeCompare(y.best));
    if (!gs.length) { el.innerHTML = `<p class="g-empty">Nenhum edital com inscrições abertas ou futuras${comD ? '' : ' nas viabilidades A, B ou C'}.</p>`; return; }
    const maxFim = Math.max(...gs.map(g => g.fim));
    const start = -14, end = Math.max(42, Math.min(119, Math.ceil((maxFim + 6) / 7) * 7));
    const pct = d => ((Math.min(Math.max(d, start), end) - start) / (end - start)) * 100;
    const ticks = []; for (let d = start; d <= end; d += 7) ticks.push(d);
    const tickHtml = ticks.map((d, i) => `<span class="g-tick${d === 0 ? ' today' : ''}${(i - ticks.indexOf(0)) % 2 ? ' odd' : ''}" style="left:${pct(d)}%">${d === 0 ? 'hoje' : fmtDM(new Date(today().getTime() + d * DAY))}</span>`).join('');
    const gridHtml = ticks.map(d => `<i class="g-grid" style="left:${pct(d)}%"></i>`).join('');
    const zone = `<i class="g-zone" style="left:${pct(0)}%;width:${pct(7) - pct(0)}%"></i>`;
    const now = `<i class="g-now" style="left:calc(${pct(0)}% - 1px)"></i>`;
    const selKey = (() => { const s = state.opps.find(o => o.id === state.sel); return s ? (s.edital ? `${s.instituicao}|${s.edital}` : s.id) : null; })();

    el.innerHTML = `<div class="g-head" aria-hidden="true"><span class="g-lab"></span><div class="g-track">${tickHtml}</div><span></span></div>` + gs.map(g => {
      const o = g.o, ini = daysTo(o.inscricaoInicio) ?? start, fim = g.fim, fut = ini > 0;
      const left = pct(ini), right = pct(fim), width = Math.max(right - left, 0.8);
      const remLeft = Math.max(pct(0), left), remW = fut ? 0 : Math.max(right - remLeft, 0);
      const clipL = ini < start, clipR = fim > end;
      const nome = [inst(o), campus(o).replace(/^Campus /, '')].filter(Boolean).join(' · ');
      const sub = g.items.map(x => curto(x.curso)).join(' · ');
      const key = o.edital ? `${o.instituicao}|${o.edital}` : o.id;
      const dias = fut ? `abre em ${plural(ini, 'dia', 'dias')}` : fim === 0 ? 'encerra hoje' : `${plural(fim, 'dia', 'dias')}`;
      const tip = `<b>${esc(nome)}</b>${esc(campus(o) || o.estado || '')}<br>Inscrições: ${esc(fmt(o.inscricaoInicio))} a ${esc(fmt(o.inscricaoFim))}<br>Viabilidade ${esc(g.best)} · ${esc(VIAB[g.best])}`;
      return `<button type="button" class="g-row v-${esc(g.best)}" data-id="${esc(o.id)}" aria-current="${key === selKey}" data-tip="${esc(tip)}" aria-label="${esc(nome)}, inscrições até ${esc(fmt(o.inscricaoFim))}">
        <span class="g-lab"><b>${esc(nome)}</b><span>${esc(sub)}</span></span>
        <span class="g-track">${gridHtml}${zone}<span class="g-bar${fut ? ' fut' : ''}${clipL ? ' clip-l' : ''}${clipR ? ' clip-r' : ''}" style="left:${left}%;width:${width}%">${remW ? `<span class="rem" style="width:${(remW / width) * 100}%"></span>` : ''}</span>${now}</span>
        <span class="g-end${!fut && fim <= 7 ? ' urg' : ''}"><b>${esc(fmtDM(parse(o.inscricaoFim)))}</b><small>${esc(dias)}</small></span>
      </button>`;
    }).join('');
    $$('.g-row', el).forEach(r => {
      r.addEventListener('click', () => select(r.dataset.id, true));
      r.addEventListener('mousemove', e => showTip(r.dataset.tip, e));
      r.addEventListener('mouseleave', hideTip);
    });
  }
  function showTip(html, e) {
    const t = $('#tip'); t.innerHTML = html; t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 8) + 'px';
    t.style.top = (e.clientY + 16 + h > window.innerHeight ? e.clientY - h - 12 : e.clientY + 16) + 'px';
  }
  function hideTip() { $('#tip').hidden = true; }

  // ---------- tabela ----------
  function filtrados() {
    const q = $('#q').value.trim().toLowerCase(), sit = $('#f-sit').value, v = $('#f-via').value, tipo = $('#f-tipo').value, mine = $('#f-mine').value, hide = $('#f-hide').checked;
    return state.opps.filter(o => {
      const ph = phase(o).k, m = state.mine[o.id]?.status || 'none';
      if (hide && sit !== 'encerradas' && ph === 'enc') return false;
      if (q && ![o.curso, o.instituicao, o.estado, o.edital, o.area].join(' ').toLowerCase().includes(q)) return false;
      if (sit === 'abertas' && !(ph === 'aberta' || ph === 'prazo')) return false;
      if (sit === 'prazo' && !(ph === 'prazo')) return false;
      if (sit === 'futuras' && ph !== 'futura') return false;
      if (sit === 'encerradas' && ph !== 'enc') return false;
      if (v && via(o) !== v) return false;
      if (tipo && o.tipo !== tipo) return false;
      if (mine && m !== mine) return false;
      return true;
    });
  }
  function renderTable() {
    const list = filtrados(), gs = agrupar(list), { k, dir } = state.sort;
    const cmp = {
      prazo: (a, b) => (phaseRank[a.ph.k] - phaseRank[b.ph.k]) || ((a.fim ?? 9999) - (b.fim ?? 9999)) || a.best.localeCompare(b.best),
      viab: (a, b) => a.best.localeCompare(b.best) || ((a.fim ?? 9999) - (b.fim ?? 9999)),
      nome: (a, b) => inst(a.o).localeCompare(inst(b.o), 'pt-BR') || campus(a.o).localeCompare(campus(b.o), 'pt-BR'),
    }[k];
    gs.sort((a, b) => cmp(a, b) * dir);
    $$('.sort').forEach(s => { if (s.dataset.k === k) s.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending'); else s.removeAttribute('aria-sort'); });
    const total = state.opps.length;
    $('#count').textContent = total ? `${plural(list.length, 'curso', 'cursos')} em ${plural(gs.length, 'edital', 'editais')} · ${total} no acervo` : ' ';
    const tb = $('#rows');
    if (!total) { tb.innerHTML = `<tr class="empty-row"><td colspan="5">${state.erro ? 'Os dados não carregaram. Use “Atualizar agora”.' : 'Carregando oportunidades…'}</td></tr>`; return; }
    if (!gs.length) { tb.innerHTML = `<tr class="empty-row"><td colspan="5">Nenhuma oportunidade com esses filtros. Limpe a busca ou desmarque “Ocultar D e encerradas”.</td></tr>`; return; }
    tb.innerHTML = gs.map(g => {
      const o = g.o, sel = g.items.some(x => x.id === state.sel), fim = g.fim, fut = g.ph.k === 'futura', ini = daysTo(o.inscricaoInicio);
      const dias = g.ph.k === 'enc' ? 'encerrada' : fut && ini !== null && ini > 0 ? `abre em ${plural(ini, 'dia', 'dias')}` : fim === null ? '' : fim === 0 ? 'encerra hoje' : `faltam ${plural(fim, 'dia', 'dias')}`;
      const cursos = g.items.map(x => { const m = state.mine[x.id]?.status; return `<button type="button" class="course" data-id="${esc(x.id)}" aria-current="${x.id === state.sel}">${esc(curto(x.curso))}${m ? `<span class="mine-tag">· ${esc(mineLabel[m])}</span>` : ''}</button>`; }).join('');
      return `<tr data-id="${esc(o.id)}" aria-current="${sel}">
        <td><span class="grade g-${esc(g.best)}" title="${esc(VIAB[g.best])}">${esc(g.best)}</span></td>
        <td class="c-op"><div class="op-name">${esc(inst(o))}${campus(o) ? ` <span class="op-meta">· ${esc(campus(o))}</span>` : ''}</div><div class="op-meta op-ed" title="${esc(o.edital || '')}">${esc(o.edital || 'Inscrição contínua')}</div><div class="courses">${cursos}</div></td>
        <td class="c-uf">${esc(o.estado)}</td>
        <td class="c-tipo">${esc(o.tipo)}</td>
        <td class="c-dl">${o.inscricaoFim ? `<span class="dl-date">${esc(fmt(o.inscricaoFim))}</span>` : '<span class="dl-date">—</span>'}<span class="dl-days${!fut && fim !== null && fim <= 7 && fim >= 0 ? ' urg' : ''}">${esc(dias)}</span>${g.ph.k === 'aberta' ? '' : `<span class="chip st-${g.ph.k}">${esc(g.ph.label)}</span>`}</td>
      </tr>`;
    }).join('');
    $$('tr[data-id]', tb).forEach(tr => tr.addEventListener('click', e => { const b = e.target.closest('.course'); select(b ? b.dataset.id : tr.dataset.id, true); }));
  }

  // ---------- ficha ----------
  const SEC = {
    pe: [['Morador de PE pode participar?', 'pePodeParticipar'], ['Atividades presenciais', 'atividadesPresenciais'], ['Aulas síncronas obrigatórias', 'aulasSincronas'], ['Provas presenciais', 'provasPresenciais'], ['Polos disponíveis', 'polos']],
    sel: [['Processo seletivo', 'processoSeletivo'], ['Taxa de inscrição', 'taxa'], ['Vagas', 'vagas'], ['Período de inscrição', o => `${fmt(o.inscricaoInicio)} a ${fmt(o.inscricaoFim)}`]],
    curso: [['Tipo', 'tipo'], ['Área', 'area'], ['Duração / carga horária', 'cargaHoraria'], ['Mensalidade', 'mensalidade'], ['Certificado ou diploma', 'certificado'], ['Situação oficial', 'situacao']],
  };
  const FICHA = [['INSTITUIÇÃO', 'instituicao'], ['ESTADO', 'estado'], ['TIPO', 'tipo'], ['SITUAÇÃO', 'situacao'], ['INSCRIÇÕES', o => `${fmt(o.inscricaoInicio)} a ${fmt(o.inscricaoFim)}`],
    ['DURAÇÃO/CARGA HORÁRIA', 'cargaHoraria'], ['VAGAS', 'vagas'], ['MENSALIDADE', 'mensalidade'], ['TAXA DE INSCRIÇÃO', 'taxa'], ['CERTIFICADO OU DIPLOMA', 'certificado'], ['POLOS DISPONÍVEIS', 'polos'],
    ['MORADOR DE PERNAMBUCO PODE PARTICIPAR?', 'pePodeParticipar'], ['ATIVIDADES PRESENCIAIS', 'atividadesPresenciais'], ['AULAS SÍNCRONAS OBRIGATÓRIAS', 'aulasSincronas'], ['PROVAS PRESENCIAIS', 'provasPresenciais'],
    ['PROCESSO SELETIVO', 'processoSeletivo'], ['CLASSIFICAÇÃO DE VIABILIDADE', o => `${via(o)} · ${VIAB[via(o)]}`], ['LINK OFICIAL DO EDITAL', 'linkEdital'], ['LINK OFICIAL DE INSCRIÇÃO', 'linkInscricao'],
    ['DATA DA VERIFICAÇÃO', o => fmt(o.dataVerificacao)], ['OBSERVAÇÕES IMPORTANTES', 'observacoes']];
  const val = (o, f) => typeof f === 'function' ? f(o) : o[f];
  const show = v => {
    const s = String(v ?? '').trim();
    if (!s) return '<span class="pend">NÃO INFORMADO</span>';
    if (/^https?:\/\//.test(s)) return `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\//, ''))}</a>`;
    return esc(s).replace(/(PENDENTE DE CONFIRMAÇÃO|NÃO INFORMADO)/g, '<span class="pend">$1</span>');
  };
  const dl = (o, rows) => `<dl class="fields">${rows.map(([l, f]) => `<dt>${esc(l)}</dt><dd>${show(val(o, f))}</dd>`).join('')}</dl>`;

  function renderSheet() {
    const el = $('#sheet'), o = state.opps.find(x => x.id === state.sel);
    if (!o) {
      el.innerHTML = `<div class="sheet-empty">${state.opps.length ? '<h3>Selecione uma oportunidade</h3>Clique numa linha do cronograma ou da tabela para ver a ficha completa do edital.' : '<h3>A ficha aparece aqui</h3>Assim que os dados carregarem, escolha uma oportunidade.'}</div>`;
      return;
    }
    const ph = phase(o), fim = daysTo(o.inscricaoFim), ini = daysTo(o.inscricaoInicio), m = state.mine[o.id] || {};
    const irmaos = state.opps.filter(x => o.edital && x.edital === o.edital && x.instituicao === o.instituicao).sort(byPriority);
    const alerts = [];
    if (ph.k === 'enc') alerts.push(['', 'Edital encerrado, mantido como registro de referência. Serve para acompanhar a próxima turma desta instituição.']);
    if (via(o) === 'D') alerts.push(['bad', 'Classificada como incompatível com participação a partir de Pernambuco.']);
    else if (/obrigat/i.test(o.atividadesPresenciais || '') || /^sim/i.test(o.provasPresenciais || '') || /^sim/i.test(o.atividadesPresenciais || '')) alerts.push(['', 'Há exigência presencial a considerar. Confira a seção de elegibilidade.']);
    const prazo = ph.k === 'enc' ? 'Inscrições encerradas' : ph.k === 'futura' && ini > 0 ? `Abre em ${plural(ini, 'dia', 'dias')}` : fim === null ? 'Prazo não informado' : fim === 0 ? 'Encerra hoje' : `Faltam ${plural(fim, 'dia', 'dias')}`;
    el.innerHTML = `
      <div class="sh-head">
        <span class="label">${esc(o.instituicao)} · ${esc(o.estado)}</span>
        <h2>${esc(o.curso)}</h2>
        <div class="sh-row"><span class="grade g-${esc(via(o))}">${esc(via(o))}</span><span class="chip">${esc(VIAB[via(o)])}</span><span class="chip st-${ph.k}">${esc(ph.label)}</span>${o.edital ? `<span class="chip mono">${esc(o.edital)}</span>` : ''}</div>
        ${irmaos.length > 1 ? `<div class="sh-tabs" role="tablist" aria-label="Cursos do mesmo edital">${irmaos.map(x => `<button type="button" class="course" role="tab" data-id="${esc(x.id)}" aria-current="${x.id === o.id}" aria-selected="${x.id === o.id}">${esc(curto(x.curso))}</button>`).join('')}</div>` : ''}
      </div>
      <div class="deadline${ph.k !== 'futura' && ph.k !== 'enc' && fim !== null && fim <= 7 ? ' urg' : ''}"><span>Inscrições: <b>${esc(fmt(o.inscricaoInicio))}</b> a <b>${esc(fmt(o.inscricaoFim))}</b></span><span class="left">${esc(prazo)}</span></div>
      <div class="actions">
        ${o.linkInscricao ? `<a class="btn small" href="${esc(o.linkInscricao)}" target="_blank" rel="noopener">Página de inscrição ↗</a>` : ''}
        ${o.linkEdital && o.linkEdital !== o.linkInscricao ? `<a class="btn small ghost" href="${esc(o.linkEdital)}" target="_blank" rel="noopener">Abrir edital ↗</a>` : ''}
      </div>
      ${alerts.map(([c, t]) => `<div class="alertbox ${c}">${esc(t)}</div>`).join('')}
      <div class="sec pe"><h3>Elegibilidade para quem mora em Pernambuco</h3>${dl(o, SEC.pe)}</div>
      <div class="sec"><h3>Seleção</h3>${dl(o, SEC.sel)}</div>
      <div class="sec"><h3>Curso</h3>${dl(o, SEC.curso)}</div>
      ${o.observacoes ? `<div class="sec"><h3>Observações</h3><p class="obs">${show(o.observacoes)}</p></div>` : ''}
      ${(o.fontes || []).length ? `<div class="sec"><h3>Fontes consultadas</h3><ul class="sources">${o.fontes.map(u => `<li>${show(u)}</li>`).join('')}</ul></div>` : ''}
      <p class="verif">Verificado em ${esc(fmt(o.dataVerificacao))}${o.primeiraDeteccao ? ` · detectado em ${esc(fmt(o.primeiraDeteccao))}` : ''}</p>
      <div class="track">
        <span class="label">Meu acompanhamento</span>
        <div class="seg" id="seg">${Object.entries(mineLabel).map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${m.status === k}">${l}</button>`).join('')}</div>
        <textarea id="note" placeholder="Anotações: documentos a separar, polo escolhido, dúvidas para a coordenação…">${esc(m.nota || '')}</textarea>
        <div class="sh-row">
          <button class="btn small" id="save" type="button">Salvar acompanhamento</button>
          <button class="btn small ghost" id="copy" type="button">Copiar ficha</button>
          <span class="toast" id="toast" role="status"></span>
        </div>
      </div>`;
    $$('.sh-tabs .course', el).forEach(b => b.addEventListener('click', () => select(b.dataset.id)));
    let pick = m.status || null;
    $$('#seg button', el).forEach(b => b.addEventListener('click', () => {
      pick = pick === b.dataset.k ? null : b.dataset.k;
      $$('#seg button', el).forEach(x => x.setAttribute('aria-pressed', x.dataset.k === pick));
    }));
    $('#save', el).addEventListener('click', () => salvar(o.id, pick, $('#note', el).value));
    $('#copy', el).addEventListener('click', async () => {
      const txt = [`CURSO: ${o.curso}`, ...FICHA.map(([l, f]) => `${l}: ${String(val(o, f) ?? '').trim() || 'NÃO INFORMADO'}`)].join('\n');
      try { await navigator.clipboard.writeText(txt); $('#toast', el).textContent = 'Ficha copiada.'; }
      catch { $('#toast', el).textContent = 'O navegador bloqueou a cópia.'; }
    });
  }
  function salvar(id, status, nota) {
    const next = { ...state.mine };
    if (!status && !nota.trim()) delete next[id]; else next[id] = { status: status || null, nota: nota.trim(), em: new Date().toISOString().slice(0, 10) };
    try { localStorage.setItem(STORE, JSON.stringify(next)); state.mine = next; $('#toast').textContent = 'Salvo neste navegador.'; renderTable(); }
    catch { $('#toast').textContent = 'O navegador bloqueou o salvamento. Desative a navegação anônima.'; }
  }

  // ---------- histórico ----------
  function renderLog() {
    $('#log').innerHTML = state.log.length ? state.log.map(v => `<li><span class="mono">${esc(fmt(v.data))}</span><span>${esc(v.resumo || '')}${v.fontesConsultadas ? `<br><span class="sub">Fontes: ${esc(v.fontesConsultadas)}</span>` : ''}</span></li>`).join('')
      : '<li><span></span><span class="sub">O monitor registra aqui cada execução, inclusive as sem novidades.</span></li>';
  }

  // ---------- registros de referência (encerrados) ----------
  function renderRefs() {
    const list = state.opps.filter(o => phase(o).k === 'enc').sort((a, b) => String(b.inscricaoFim).localeCompare(String(a.inscricaoFim)));
    $('#refs-sub').textContent = list.length ? `${plural(list.length, 'edital encerrado mantido', 'editais encerrados mantidos')} para acompanhar as próximas turmas de cada instituição.` : 'Nenhum edital encerrado registrado ainda.';
    $('#refs').innerHTML = list.length ? list.map(o => `<tr data-id="${esc(o.id)}" aria-current="${o.id === state.sel}">
        <td><span class="grade g-${esc(via(o))}" title="${esc(VIAB[via(o)])}">${esc(via(o))}</span></td>
        <td class="c-op"><div class="op-name">${esc(inst(o))}${campus(o) ? ` <span class="op-meta">· ${esc(campus(o))}</span>` : ''}</div><div class="op-meta">${esc(o.curso)}</div></td>
        <td class="c-uf">${esc(o.estado)}</td>
        <td class="c-tipo">${esc(o.tipo)}</td>
        <td class="c-dl"><span class="dl-date">${parse(o.inscricaoInicio) ? esc(parse(o.inscricaoInicio).getFullYear() === parse(o.inscricaoFim)?.getFullYear() ? fmtDM(parse(o.inscricaoInicio)) : fmt(o.inscricaoInicio)) + ' a ' : 'até '}${esc(fmt(o.inscricaoFim))}</span></td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="5">Os editais encerrados aparecerão aqui.</td></tr>';
    $$('#refs tr[data-id]').forEach(tr => tr.addEventListener('click', () => select(tr.dataset.id, true)));
  }

  function select(id, scroll) {
    state.sel = id; renderGantt(); renderTable(); renderSheet(); renderRefs();
    if (scroll && matchMedia('(max-width:1060px)').matches) $('#sheet').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderAll() { renderKpis(); renderGantt(); renderTable(); renderSheet(); renderRefs(); renderLog(); }

  // ---------- eventos ----------
  ['#q', '#f-sit', '#f-via', '#f-tipo', '#f-mine', '#f-hide'].forEach(s => $(s).addEventListener('input', renderTable));
  $('#g-d').addEventListener('change', renderGantt);
  $$('.sort').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; state.sort = { k, dir: state.sort.k === k ? -state.sort.dir : 1 }; renderTable();
  }));

  // Carrega o arquivo de dados que a varredura automática atualiza no repositório
  function carregar(manual) {
    const btn = $('#refresh'), msg = $('#refresh-msg'), antes = new Set(state.opps.map(o => o.id));
    btn.disabled = true; btn.textContent = 'Atualizando…';
    return fetch('dados.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(dados => {
        state.erro = false;
        state.opps = dados.oportunidades || [];
        state.log = (dados.verificacoes || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
        if (!state.opps.some(o => o.id === state.sel)) state.sel = state.opps.filter(o => via(o) !== 'D' && phase(o).k !== 'enc').sort(byPriority)[0]?.id || null;
        renderAll();
        if (manual) {
          const novas = state.opps.filter(o => !antes.has(o.id)).length, hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          msg.textContent = novas ? `${plural(novas, 'nova oportunidade', 'novas oportunidades')} · atualizado às ${hora}` : `Sem novidades desde a última carga · conferido às ${hora}`;
        }
      })
      .catch(() => { state.erro = true; renderKpis(); renderTable(); if (manual) msg.textContent = 'Não foi possível atualizar. Verifique a internet e tente de novo.'; })
      .finally(() => { btn.disabled = false; btn.textContent = 'Atualizar agora'; });
  }
  $('#refresh').addEventListener('click', () => carregar(true));
  renderAll();
  carregar(false);
})();
