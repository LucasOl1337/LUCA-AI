export class EventBus {
  constructor({ store }) {
    this.store = store;
    this.clients = new Set();
  }

  addClient(socket) {
    this.clients.add(socket);
    socket.on('close', () => this.clients.delete(socket));
  }

  emit(type, payload = {}) {
    const event = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      time: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      type,
      ...payload,
    };

    this.store.appendEvent(event).catch((error) => {
      console.error('[event-store]', error);
    });

    const message = JSON.stringify({ kind: 'event', event });
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(message);
    }

    return event;
  }

  broadcastState(state) {
    const message = JSON.stringify({ kind: 'state', state });
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(message);
    }
  }
}
