import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import { assessSompoRisk, type SompoRiskContext, type SompoRiskAssessment } from '../../shared/sompo-risk.js';

interface Evidence { id: string; createdAt: string; assessment: SompoRiskAssessment; snapshot: SompoTelemetrySnapshot; coverage: string; }
interface Props { telemetry: SompoTelemetrySnapshot | null; context: SompoRiskContext; onContext: (context: SompoRiskContext) => void; }

export default function SompoRiskPanel({ telemetry, context, onContext }: Props) {
  const risk = assessSompoRisk(telemetry, context);
  const [saved, setSaved] = useState<Evidence[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [reload, setReload] = useState(0);
  const tractor = telemetry?.tractorId;
  const source = telemetry?.source.kind;
  useEffect(() => {
    let active = true;
    setSaved([]); setHistoryError(''); setMessage('');
    if (tractor && source) void apiGet<{ assessments: Evidence[] }>(`/api/sompo/risk?trator=${encodeURIComponent(tractor)}&fonte=${source === 'simulation' ? 'simulacao' : 'firebase'}`)
      .then(result => { if (active) setSaved(result.assessments); })
      .catch(() => { if (active) setHistoryError('Não foi possível recuperar as avaliações.'); });
    return () => { active = false; };
  }, [tractor, source, reload]);

  async function save() {
    if (!telemetry || busy) return;
    setBusy(true); setMessage('');
    const r = telemetry.readings;
    try {
      const result = await apiPost<{ evidence: Evidence }>('/api/sompo/risk', {
        sourceKind: telemetry.source.kind, context,
        raw: { trator: telemetry.tractorId, timestamp: telemetry.deviceTimestamp, distancia: r.distance, temperatura: r.temperature, umidade: r.humidity, pitch: r.pitch, roll: r.roll, aceleracaoX: r.acceleration.x, aceleracaoY: r.acceleration.y, aceleracaoZ: r.acceleration.z, rotacaoX: r.rotation.x, rotacaoY: r.rotation.y, rotacaoZ: r.rotation.z, riscoColisao: telemetry.risks.collision, riscoInclinacao: telemetry.risks.inclination },
      });
      setSaved(items => [result.evidence, ...items].slice(0, 20));
      setMessage('Avaliação registrada com as entradas e a versão da regra.');
    } catch { setMessage('Falha ao registrar. Confira a conexão e os dados e tente novamente.'); }
    finally { setBusy(false); }
  }

  function download(evidence: Evidence) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `sompo-avaliacao-${evidence.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="sompo-risk-assessment" aria-label="Avaliação explicável de risco">
    <div className="sompo-section-heading"><span>02 / Avaliar contexto</span><h2>O que aumenta a exposição?</h2><p>Informe o contexto da máquina. Os sensores atualizam temperatura e umidade; operação, região e incidentes são declarados por você.</p></div>
    <div className="sompo-risk-workspace">
      <div className="sompo-risk-form">
        <label>Tipo de operação<select value={context.operation || ''} onChange={e => onContext({ ...context, operation: e.target.value })}><option value="">Selecione a operação</option><option value="campo">Trabalho em campo</option><option value="transporte">Deslocamento / transporte</option><option value="proximidade de agua">Proximidade de água</option><option value="outro">Outra operação</option></select></label>
        <label>Condição da região<select value={context.region || ''} onChange={e => onContext({ ...context, region: e.target.value })}><option value="">Selecione a condição</option><option value="rural">Rural</option><option value="critica">Crítica</option><option value="alagada">Alagada</option><option value="outra">Outra condição</option></select></label>
        <label>Incidentes no histórico disponível<input type="number" min="0" step="1" placeholder="Não informado" value={context.incidents ?? ''} onChange={e => onContext({ ...context, incidents: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
        <small>Use a mesma janela de histórico ao comparar avaliações. Ausência de registro não significa zero incidentes.</small>
      </div>
      <div className="sompo-score" data-level={risk.level} data-sompo-score>
        <span>Score contextual · experimental</span><div className="sompo-score-number">{risk.score ?? '-'}<small>/100</small></div><strong>{risk.level === 'Baixo' ? 'Baixo nesta regra' : risk.level}</strong>
        <p>{risk.score === null ? `Falta confirmar: ${risk.missing.join(', ')}.` : 'O score não inclui colisão, inclinação ou falhas mecânicas. Confira os alertas do equipamento antes de decidir.'}</p>
        {risk.score !== null && <meter min="0" max="100" low={45} high={75} optimum={0} value={risk.score} aria-label="Score contextual" />}
      </div>
    </div>
    {risk.factors.length > 0 && <details className="sompo-risk-details" open><summary>Por que este score? Operacional 60% + ambiental 40%</summary><div className="sompo-risk-table-wrap"><table><thead><tr><th>Fator / entrada</th><th>Pontos</th><th>Peso</th><th>Contribuição</th></tr></thead><tbody>{risk.factors.map(f => <tr key={f.label}><td>{f.label}<small>{f.value}</small></td><td>{f.points}</td><td>{f.weight * 100}%</td><td>+{f.contribution}</td></tr>)}</tbody></table></div></details>}
    <p className="sompo-risk-limit">{risk.version} · {risk.limitation} Faixas acadêmicas: baixo &lt;45, médio 45–74,99, alto ≥75.</p>
    <div className="sompo-risk-save"><button type="button" onClick={() => void save()} disabled={busy || risk.score === null}>{busy ? 'Registrando…' : 'Registrar avaliação'}</button><span role="status">{message || 'Salva um retrato auditável, sem alterar o equipamento.'}</span></div>
    <details className="sompo-risk-details"><summary>Avaliações registradas · {saved.length}</summary>
      {historyError ? <p role="alert">{historyError} <button type="button" onClick={() => setReload(n => n + 1)}>Tentar recuperar</button></p> : !saved.length ? <p>Nenhuma avaliação registrada para esta origem e equipamento na sua conta.</p> : <ul className="sompo-assessment-list">{saved.map(item => <li key={item.id}><div><strong>{item.assessment.score}/100 · {item.assessment.level}</strong><small>{new Date(item.createdAt).toLocaleString('pt-BR')} · {item.snapshot.source.kind === 'simulation' ? 'Simulação' : 'Firebase'} · {item.assessment.version}</small></div><button type="button" onClick={() => download(item)}>Baixar evidência</button></li>)}</ul>}
    </details>
    <p className="sompo-coverage-note"><strong>Cobertura pendente.</strong> Nenhuma apólice foi fornecida nesta jornada. O registro e a análise dos agentes apoiam a triagem; não determinam indenização.</p>
  </section>;
}
