import { Component, type ReactNode } from 'react';

/** Qualquer erro do gameplay (WebGL, chunk, render) devolve a Simulação ao simulador clássico. */
export class GameplayOuClassico extends Component<{ classico: ReactNode; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  componentDidCatch(erro: unknown) { console.error('Gameplay caiu; voltando ao simulador clássico.', erro); }
  render() { return this.state.falhou ? this.props.classico : this.props.children; }
}
