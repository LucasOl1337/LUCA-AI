import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { commands } from './catalog.js';

export function renderReference() {
  const rows = commands.map(c => {
    const usage = `${c.name}${c.args.map(arg => ` <${arg}>`).join('')}`;
    const fields = c.fields.map(f => `\`--${f.name}\` (${f.type}${f.required ? ', obrigatório' : ''})${f.description ? `: ${f.description}` : ''}`).join('<br>') || 'Nenhum; consulte a descrição para entradas por `--data`.';
    return `### \`${usage}\`\n\n${c.description}.\n\n${c.method ? `\`${c.method} ${c.path}\`; autenticação: **${c.auth}**.` : 'Comando local, sem iniciar o runtime.'}\n\n${fields}\n${c.example ? `\nExemplo: \`luca ${c.example}\`\n` : ''}`;
  });
  return `# Referência de comandos LUCA\n\nGerada por \`npm run cli:docs\` a partir de \`cli/catalog.js\`. Não editar à mão.\n\n${commands.length} comandos; ${new Set(commands.filter(c => c.method).map(c => `${c.method} ${c.path}`)).size} rotas HTTP distintas. [Instalação, receitas e contrato](cli.md). Todos aceitam \`--help\`; descoberta estruturada em \`luca commands [prefixo]\`.\n\nIDs são argumentos posicionais. Campos comuns podem ser flags; corpos completos usam \`--data @arquivo.json\`. Flags prevalecem sobre o corpo; objetos aninhados não são mesclados. Campos string são literais; apenas campos JSON e \`--data\` interpretam \`@arquivo\`/\`-\`.\n\n${rows.join('\n')}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = new URL('../docs/cli-reference.md', import.meta.url);
  const expected = renderReference();
  if (process.argv.includes('--check')) {
    if (await fs.readFile(target, 'utf8') !== expected) throw new Error('Referência desatualizada: execute npm run cli:docs.');
  } else await fs.writeFile(target, expected);
}
