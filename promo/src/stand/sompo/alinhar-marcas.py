#!/usr/bin/env python3
"""Alinha as marcas da captura M6 ao vídeo gravado.

Sob swiftshader o vídeo do Playwright atrasa em relação ao relógio do script
(até ~30 s em 10 min). Cada print foi tirado no mesmo instante de uma marca;
achamos o quadro do vídeo mais parecido com o print, em ordem crescente
(busca monotônica), e gravamos DIR/marcas-video.json: o rastro inteiro
(marcas, cliques, cursor) no tempo do vídeo. A montagem usa este arquivo.

Telas escuras parecidas podem enganar a busca; nesse caso fixe a marca no
segundo do corte de cena conferido a olho (registrado em `_fixadas`).

Uso: python3 promo/src/stand/sompo/alinhar-marcas.py DIR [--fixar marca=seg,marca=seg]
"""
import json
import subprocess
import sys

d = sys.argv[1]
fixadas = {}
if '--fixar' in sys.argv:
    for par in sys.argv[sys.argv.index('--fixar') + 1].split(','):
        k, v = par.split('=')
        fixadas[k] = float(v)
FPS, W, H = 4, 128, 72
timings = json.load(open(f'{d}/timings.json'))
marcas = timings['rastro']['marcas']
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{d}/cena.mp4', '-vf', f'fps={FPS},scale={W}:{H},format=rgb24', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
n = W * H * 3
quadros = [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)]


def dist(a, b):
    return sum(abs(x - y) for x, y in zip(a[::3], b[::3])) / (n / 3)


inicio = 0
ancoras = []  # (t_relogio, t_video)
for p in timings['prints']:
    img = subprocess.run(['ffmpeg', '-v', 'error', '-i', f"{d}/{p['arquivo']}", '-vf', f'scale={W}:{H},format=rgb24', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    janela = range(max(inicio, int((p['t'] - 1) * FPS)), min(len(quadros), int((p['t'] + 40) * FPS)))
    melhor = min(janela, key=lambda i: dist(quadros[i], img))
    inicio = melhor
    ancoras.append((p['t'], melhor / FPS))
    print(f"{p['nome']:22s} relógio {p['t']:8.2f}  vídeo {melhor / FPS:8.2f}  erro {dist(quadros[melhor], img):5.1f}")


def no_video(t):
    """Interpola linearmente entre âncoras; antes da primeira, desloca pela primeira."""
    if t <= ancoras[0][0]:
        return max(0.0, t + ancoras[0][1] - ancoras[0][0])
    for (r0, v0), (r1, v1) in zip(ancoras, ancoras[1:]):
        if t <= r1:
            return v0 + (t - r0) * (v1 - v0) / (r1 - r0) if r1 > r0 else v1
    return t + ancoras[-1][1] - ancoras[-1][0]


# Âncoras fixadas também guiam a interpolação do cursor e dos cliques.
for k, v in fixadas.items():
    ancoras.append((marcas[k], v))
ancoras = sorted(ancoras)
mono = []
for a in ancoras:
    if not mono or a[1] >= mono[-1][1]:
        mono.append(a)
ancoras = mono

novas = {k: round(no_video(v), 3) for k, v in marcas.items()}
novas.update(fixadas)
rastro = dict(timings['rastro'])
rastro['marcas'] = novas
for chave in ('cliques', 'cursor'):
    rastro[chave] = [{**p, 't': round(no_video(p['t']), 3)} for p in rastro.get(chave, [])]
saida = {'fixadas': sorted(fixadas), 'ancoras': ancoras, 'rastro': rastro}
json.dump(saida, open(f'{d}/marcas-video.json', 'w'), indent=2)
for k, v in marcas.items():
    print(f"  {k:20s} {v:8.2f} -> {novas[k]:8.2f}{'  (fixada)' if k in fixadas else ''}")
