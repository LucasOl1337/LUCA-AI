/**
 * Página em tela cheia (painel do operador) pede a gaveta do menu: o botão ☰
 * do cabeçalho some junto com o cabeçalho. O Layout escuta e abre a gaveta.
 */
export const EVENTO_ABRIR_MENU = 'luca:abrir-menu';
export const abrirMenuGaveta = () => window.dispatchEvent(new Event(EVENTO_ABRIR_MENU));
