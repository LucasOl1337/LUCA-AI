#!/usr/bin/env python3
"""Gera roteiro.json do compose.py (skill vitrine) a partir das marcas da captura e do
manifesto da narração Otto. Cada bloco do ROTEIRO.md vira um segmento; a fala entra em
`at` alinhado à ação marcada na captura (alerta, alarme, frames...).
uso: timeline.py PRODUCAO_DIR  (espera captura/marcas.json e narracao/audio/speech-manifest.json)
"""
import json
import sys
from pathlib import Path

prod = Path(sys.argv[1]).resolve()
marcas = json.loads((prod / 'captura/marcas.json').read_text())
manifesto = json.loads((prod / 'narracao/audio/speech-manifest.json').read_text())
par = {p['paragrafo']: p for p in manifesto['paragraphs']}
bruto = prod / 'captura/bruto'


def narr(pid, at, pause_after=0.5):
    p = par[pid]
    return {'paragrafo': pid, 'path': p['path'], 'at': round(at, 2), 'pause_after': pause_after,
            'blocks': [{k: b[k] for k in ('id', 'text', 'start', 'end')} for b in p['blocks']]}


def seg(cena, start, dur, pid, at, **extra):
    return {'scene': str(bruto / f'{cena}.mkv'), 'start': round(max(0, start), 2), 'dur': round(dur, 2),
            'fit': 'contain', 'narr': [narr(pid, at)], **extra}


def dur_fala(pid):
    return par[pid]['duration']


m = marcas
s = []
# b1: abre na boas-vindas e vai até o cartão "R$ 400 mil" quando a fala diz o valor.
b1 = m['b1']
s.append(seg('b1', b1['welcome'] - 1.6, dur_fala('b1') + 1.0, 'b1', 0.3))
# b2: simulador; "alerta acende a um metro e meio" (b2c) cai no alerta real da captura.
b2 = m['b2']
inicio_b2 = max(0, b2['alerta'] - 7.6)
s.append(seg('b2', inicio_b2, dur_fala('b2') + 0.9, 'b2', 0.2))
# b3: sonolência; "dispara o alarme" (fim de b3b ~6 s) alinhado ao alarme real.
b3 = m['b3']
fim_b3b = next(b['end'] for b in par['b3']['blocks'] if b['id'] == 'b3b')
inicio_b3 = max(0, b3['alarme'] - fim_b3b + 0.4)
s.append(seg('b3', inicio_b3, dur_fala('b3') + 0.9, 'b3', 0.2))
# b4 e b6 falam sobre duas telas: junta as duas cenas num clipe só (corte seco, sem reencode
# de escala) e o parágrafo fica num segmento.
import subprocess


def juntar(nome, partes):
    out = prod / 'captura' / f'{nome}.mkv'
    entradas, filtros = [], []
    for i, (cena, ini, dur) in enumerate(partes):
        entradas += ['-ss', f'{max(0, ini):.3f}', '-t', f'{dur:.3f}', '-i', str(bruto / f'{cena}.mkv')]
        filtros.append(f'[{i}:v]setpts=PTS-STARTPTS,fps=30[v{i}]')
    filtro = ';'.join(filtros) + ';' + ''.join(f'[v{i}]' for i in range(len(partes))) + f'concat=n={len(partes)}:v=1:a=0[v]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *entradas, '-filter_complex', filtro, '-map', '[v]', '-an',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', str(out)], check=True)
    return out


fim_b4a = next(b['end'] for b in par['b4']['blocks'] if b['id'] == 'b4a')
sf = m['safra']
p1 = fim_b4a + 0.6
c4 = juntar('b4', [('b2', b2['gravar'] - 0.6, p1), ('safra', sf['frames'] - 0.5, dur_fala('b4') - fim_b4a + 1.6)])
s.append({'scene': str(c4), 'start': 0, 'dur': round(dur_fala('b4') + 0.9, 2), 'fit': 'contain', 'narr': [narr('b4', 0.15)]})
# b5: frota demonstrativa e gráficos.
s.append(seg('safra', sf['graficos'] - 0.8, dur_fala('b5') + 1.0, 'b5', 0.3))
# b6: rodapé "valores financeiros ... pendentes" e fecha no início do app.
fim_b6b = next(b['end'] for b in par['b6']['blocks'] if b['id'] == 'b6b')
q1 = fim_b6b + 0.5
c6 = juntar('b6', [('safra', sf['rodape'] + 0.2, q1), ('inicio', m['inicio']['abertura'] + 1.0, dur_fala('b6') - fim_b6b + 2.8)])
s.append({'scene': str(c6), 'start': 0, 'dur': round(dur_fala('b6') + 2.4, 2), 'fit': 'contain', 'narr': [narr('b6', 0.2)]})

roteiro = {'out': str(prod / 'render/vitrine-luca-1080p.mp4'), 'size': [1920, 1080], 'fps': 30, 'captions': True,
           'caption_style': {'font_size': 40, 'margin_bottom': 56}, 'fade': 0.25, 'web': False, 'segments': s}
(prod / 'render').mkdir(exist_ok=True)
(prod / 'roteiro.json').write_text(json.dumps(roteiro, ensure_ascii=False, indent=1))
print(prod / 'roteiro.json', sum(x['dur'] for x in s))
