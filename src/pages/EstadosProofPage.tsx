import type { ReactNode } from 'react';
import '@/home-page.css';
import '@/sompo-page.css';

const COLUMNS = ['Cheio', 'Vazio', 'Erro', 'Carregando'] as const;

function Cell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="estados-cell" data-estados-cell={title}>
      <header>{title}</header>
      <div>{children}</div>
    </article>
  );
}

function Row({ name, cells }: { name: string; cells: [ReactNode, ReactNode, ReactNode, ReactNode] }) {
  return (
    <section className="estados-row" data-estados-surface={name}>
      <h2>{name}</h2>
      <div className="estados-grid">
        {COLUMNS.map((title, index) => (
          <Cell key={title} title={title}>{cells[index]}</Cell>
        ))}
      </div>
    </section>
  );
}

export default function EstadosProofPage() {
  return (
    <div className="estados-proof luca-page-shell" data-estados-proof>
      <header className="estados-proof-head">
        <p>Prova dos quatro estados</p>
        <h1>Cada tela, lado a lado</h1>
        <p>Mesmas classes e textos do produto. Rota só em desenvolvimento: /estados</p>
      </header>

      <Row
        name="Personas"
        cells={[
          <p className="estados-full">Grade de cards oficiais e secundários.</p>,
          <div data-personas-empty>
            <p>Nenhuma persona corresponde à busca ou filtro.</p>
            <button type="button" className="btn-primary !px-3 !py-1.5 !text-xs">Limpar busca e filtro</button>
          </div>,
          <div data-personas-error="" data-tone="error" role="alert">
            <strong>Fontes de personas indisponíveis</strong>
            <p>Sem internet. Os cards que já estavam na grade continuam aqui.</p>
            <button type="button" className="btn-primary !px-3 !py-1.5 !text-xs">Tentar novamente</button>
          </div>,
          <div className="h-16 animate-pulse rounded-lg" style={{ background: 'rgba(255,255,255,.08)' }} />,
        ]}
      />

      <Row
        name="Configuração"
        cells={[
          <p className="estados-full">Lista de templates com ações.</p>,
          <div data-config-empty>
            <p>Nenhuma equipe montada ainda</p>
            <button type="button" className="btn-primary !px-3 !py-1.5 !text-xs">Criar equipe</button>
          </div>,
          <div data-config-error="" data-tone="error" role="alert">
            <strong>Configuração das equipes indisponível</strong>
            <p>A configuração das equipes não chegou. Tente de novo.</p>
            <button type="button" className="btn-primary !px-3 !py-1.5 !text-xs">Tentar novamente</button>
          </div>,
          <div data-config-loading className="h-16 animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,.08)' }} />,
        ]}
      />

      <Row
        name="SOMPO casos"
        cells={[
          <p className="estados-full">Grade de casos agrícolas.</p>,
          <div className="sompo-empty" data-sompo-cases-empty>
            <strong>Nenhum caso para “granizo”</strong>
            <p>Nenhum caso agrícola corresponde a esse termo.</p>
            <button type="button">Limpar busca e filtros</button>
          </div>,
          <p className="estados-na">Casos são locais — sem erro de rede.</p>,
          <p className="estados-na">Sem espera de rede.</p>,
        ]}
      />

      <Row
        name="SOMPO telemetria"
        cells={[
          <p className="estados-full">Sensores e flags do trator.</p>,
          <div className="sompo-telemetry-empty" data-sompo-telemetry-empty>
            <strong>Nenhum snapshot do trator ainda</strong>
            <p>O canal abriu, mas o Firebase ainda não entregou uma leitura.</p>
          </div>,
          <div className="sompo-telemetry-empty" data-sompo-telemetry-error role="alert">
            <strong>Não foi possível ler o trator</strong>
            <p>Sem internet. O último snapshot, se houver, continua na tela.</p>
            <button type="button">Tentar novamente</button>
          </div>,
          <div className="sompo-telemetry-skeleton" data-sompo-telemetry-loading>
            <span className="sompo-telemetry-skeleton-head" />
          </div>,
        ]}
      />

      <Row
        name="Admin contas"
        cells={[
          <p className="estados-full">Tabela de contas e métricas.</p>,
          <div className="admin-state" data-admin-empty>
            <p className="admin-empty-title">Nenhuma conta para essa busca</p>
            <button type="button" className="btn-primary">Limpar busca</button>
          </div>,
          <div className="admin-state error" data-admin-error role="alert">
            <p className="admin-error-title">Falha ao carregar o painel</p>
            <button type="button" className="btn-primary">Tentar novamente</button>
          </div>,
          <div className="admin-table-skeleton" data-admin-loading><span /><span /></div>,
        ]}
      />

      <Row
        name="Sessões na barra"
        cells={[
          <p className="estados-full">Projetos e recentes.</p>,
          <div className="luca-sidebar-empty-block" data-sidebar-sessions-empty="library">
            <p>Nenhum chat ainda.</p>
            <button type="button">Começar o primeiro chat</button>
          </div>,
          <div className="luca-sidebar-library-error" data-sidebar-sessions-error role="alert">
            <p>As sessões não chegaram.</p>
            <button type="button">Tentar novamente</button>
          </div>,
          <div className="luca-sidebar-skeleton" data-sidebar-sessions-loading><span /><span /></div>,
        ]}
      />

      <Row
        name="Leitura pública"
        cells={[
          <p className="estados-full">Canvas da sessão compartilhada.</p>,
          <div className="luca-reading-state" data-leitura-empty>
            <strong>Nada neste link</strong>
            <p>Peça um novo link a quem compartilhou.</p>
          </div>,
          <div className="luca-reading-state" data-leitura-error role="alert">
            <strong>Link indisponível</strong>
            <p>Este link não existe ou foi revogado pelo autor.</p>
            <button type="button" className="btn-fleet">Tentar novamente</button>
          </div>,
          <div className="luca-reading-skeleton" data-leitura-loading><span /><span /></div>,
        ]}
      />
    </div>
  );
}
