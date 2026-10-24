/**
 * Fim de visita no totem: o que um visitante deixou não pode aparecer para o próximo
 * (Maratona, 24/10). A página do stand chama `encerrarVisita` no mesmo ponto em que
 * encerra a conversa da Coruja (ida para a Vitrine). Módulos carregados sob demanda
 * (o gameplay) se inscrevem com `aoFimDeVisita`; aqui não entra nada pesado.
 */
export const CHAVE_CHAT_CIRCUITO = 'luca.circuito.chat.v1';

const tarefas = new Set<() => void>();
export function aoFimDeVisita(tarefa: () => void) {
  tarefas.add(tarefa);
  return () => { tarefas.delete(tarefa); };
}
export function encerrarVisita(armazem: Pick<Storage, 'removeItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage) {
  // A sessão da bancada aberta pela corrida fica na aba para sobreviver a recarga; não para o próximo visitante.
  try { armazem?.removeItem(CHAVE_CHAT_CIRCUITO); } catch { /* armazenamento bloqueado: nada a apagar */ }
  for (const tarefa of [...tarefas]) tarefa();
}
