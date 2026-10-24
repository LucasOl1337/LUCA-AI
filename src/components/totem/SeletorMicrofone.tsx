import { useCallback, useEffect, useState } from 'react';
import { BOTOES_PTT, botaoPtt, guardarBotaoPtt, guardarMicrofone, MICROFONE_DO_CONTROLE, microfoneEscolhido } from '@/stand-voz/portaMicrofone';

type Entrada = Pick<MediaDeviceInfo, 'deviceId' | 'label'>;

/**
 * Som do Totem: qual microfone o LUCA ouve e qual botão do controle é o PTT.
 * Vale para este navegador (o quiosque) e entra no próximo /stand aberto.
 */
export function SeletorMicrofone() {
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [semNomes, setSemNomes] = useState(false);
  const [microfone, setMicrofone] = useState(() => microfoneEscolhido());
  const [botao, setBotao] = useState(() => botaoPtt());

  const listar = useCallback(async () => {
    const todos = await navigator.mediaDevices?.enumerateDevices().catch(() => []) ?? [];
    // "default"/"communications" repetem um aparelho já listado.
    const lista = todos.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
    setEntradas(lista);
    setSemNomes(lista.length > 0 && lista.every((d) => !d.label));
  }, []);

  useEffect(() => {
    void listar();
    navigator.mediaDevices?.addEventListener('devicechange', listar);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', listar);
  }, [listar]);

  // Sem permissão do microfone o navegador esconde os nomes: um pedido rápido libera a lista.
  const liberar = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch { /* recusado: a lista segue sem nomes */ }
    await listar();
  };

  const escolhidoSumiu = microfone && !entradas.some((d) => d.deviceId === microfone);
  return (
    <div className="experience-som" aria-label="Som do Totem">
      <label>
        <span>Microfone</span>
        <select value={microfone} onChange={(e) => { setMicrofone(e.target.value); guardarMicrofone(e.target.value); }}>
          <option value="">Padrão da máquina (automático)</option>
          {entradas.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {MICROFONE_DO_CONTROLE.test(d.label) ? `🎮 Controle PS5 · ${d.label}` : d.label || `Microfone ${i + 1}`}
            </option>
          ))}
          {escolhidoSumiu && <option value={microfone}>Microfone escolhido (desconectado: usa o padrão)</option>}
        </select>
      </label>
      {semNomes && <button type="button" className="experience-secondary" onClick={() => void liberar()}>Mostrar nomes dos microfones</button>}
      <label>
        <span>Botão para falar (PTT)</span>
        <select value={botao} onChange={(e) => { const n = Number(e.target.value); setBotao(n); guardarBotaoPtt(n); }}>
          {BOTOES_PTT.map((b) => <option key={b.botao} value={b.botao}>{b.nome}</option>)}
        </select>
      </label>
    </div>
  );
}
