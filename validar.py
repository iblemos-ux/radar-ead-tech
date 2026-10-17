#!/usr/bin/env python3
"""Valida dados.json antes de publicar. Uso: python3 validar.py [arquivo]. Sai com código 1 se houver erro."""
import json, re, sys
from datetime import date

ARQ = sys.argv[1] if len(sys.argv) > 1 else 'dados.json'
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')
VIAB = {'A', 'B', 'C', 'D'}
TIPOS = {'Graduação', 'Especialização', 'Técnico', 'FIC', 'Livre', 'Extensão'}
SITUACOES = {'INSCRIÇÕES ABERTAS', 'INSCRIÇÕES FUTURAS CONFIRMADAS', 'PRAZO ENCERRANDO', 'EDITAL RETIFICADO',
             'INSCRIÇÕES PRORROGADAS', 'AGUARDANDO CONFIRMAÇÃO OFICIAL', 'INSCRIÇÕES ENCERRADAS'}
OBRIG = ['id', 'curso', 'instituicao', 'estado', 'tipo', 'situacao', 'viabilidade', 'dataVerificacao']
erros, avisos = [], []

def data_ok(v, vazio_ok=True):
    if v in ('', None):
        return vazio_ok
    if not isinstance(v, str) or not ISO.match(v):
        return False
    try:
        date.fromisoformat(v)
        return True
    except ValueError:
        return False

try:
    d = json.load(open(ARQ, encoding='utf-8'))
except Exception as e:
    print(f'ERRO: {ARQ} não é um JSON válido: {e}')
    sys.exit(1)

if not data_ok(d.get('atualizadoEm'), vazio_ok=False):
    erros.append(f'atualizadoEm inválido: {d.get("atualizadoEm")!r}')
ops = d.get('oportunidades')
if not isinstance(ops, list):
    erros.append('oportunidades precisa ser uma lista')
    ops = []

vistos = set()
for n, o in enumerate(ops, 1):
    ref = o.get('id') or f'item {n}'
    for k in OBRIG:
        if not str(o.get(k, '')).strip():
            erros.append(f'{ref}: campo obrigatório vazio: {k}')
    if o.get('id') in vistos:
        erros.append(f'{ref}: id duplicado')
    vistos.add(o.get('id'))
    if o.get('id') and not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', o['id']):
        erros.append(f'{ref}: id fora do padrão (minúsculas, números e hífens)')
    if o.get('viabilidade') not in VIAB:
        erros.append(f'{ref}: viabilidade inválida: {o.get("viabilidade")!r}')
    if o.get('tipo') not in TIPOS:
        erros.append(f'{ref}: tipo inválido: {o.get("tipo")!r}')
    if o.get('situacao') not in SITUACOES:
        erros.append(f'{ref}: situação inválida: {o.get("situacao")!r}')
    for k in ('inscricaoInicio', 'inscricaoFim', 'primeiraDeteccao'):
        if not data_ok(o.get(k)):
            erros.append(f'{ref}: {k} precisa ser AAAA-MM-DD ou vazio, veio {o.get(k)!r}')
    if not data_ok(o.get('dataVerificacao'), vazio_ok=False):
        erros.append(f'{ref}: dataVerificacao inválida: {o.get("dataVerificacao")!r}')
    if data_ok(o.get('inscricaoInicio')) and data_ok(o.get('inscricaoFim')) and o.get('inscricaoInicio') and o.get('inscricaoFim') and o['inscricaoInicio'] > o['inscricaoFim']:
        erros.append(f'{ref}: inscricaoInicio depois de inscricaoFim')
    for k in ('linkEdital', 'linkInscricao'):
        v = o.get(k, '')
        if v and not str(v).startswith(('http://', 'https://')):
            erros.append(f'{ref}: {k} não é um link http(s): {v!r}')
    if not isinstance(o.get('fontes', []), list):
        erros.append(f'{ref}: fontes precisa ser uma lista de URLs')
    if 'marcos' in o:
        if not isinstance(o['marcos'], list):
            erros.append(f'{ref}: marcos precisa ser uma lista')
        else:
            for m in o['marcos']:
                if not isinstance(m, dict) or not str(m.get('evento', '')).strip() or not data_ok(m.get('data'), vazio_ok=False):
                    erros.append(f'{ref}: marco inválido (precisa de evento e data AAAA-MM-DD): {m!r}')
    if o.get('viabilidade') == 'A' and o.get('situacao') == 'AGUARDANDO CONFIRMAÇÃO OFICIAL':
        erros.append(f'{ref}: viabilidade A sem confirmação oficial')
    if o.get('situacao') != 'INSCRIÇÕES ENCERRADAS' and data_ok(o.get('inscricaoFim')) and o.get('inscricaoFim') and o['inscricaoFim'] < date.today().isoformat():
        avisos.append(f'{ref}: inscrições terminaram em {o["inscricaoFim"]}, mas a situação ainda é {o.get("situacao")!r}')

ver = d.get('verificacoes', [])
dias = [v.get('data') for v in ver if isinstance(v, dict)]
for v in ver:
    if not data_ok(v.get('data'), vazio_ok=False):
        erros.append(f'verificação com data inválida: {v.get("data")!r}')
for dia in sorted({x for x in dias if dias.count(x) > 1}):
    erros.append(f'mais de um registro de verificação no dia {dia}')

for a in avisos:
    print('AVISO:', a)
for e in erros:
    print('ERRO:', e)
print(f'{len(ops)} oportunidades, {len(ver)} verificações: {len(erros)} erro(s), {len(avisos)} aviso(s).')
sys.exit(1 if erros else 0)
