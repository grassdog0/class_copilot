import type {
  InboundEvent,
  InboundMessageType,
  InboundMessages,
  OutboundMessageType,
  OutboundMessages,
  WsConnectionState,
} from "./messages";

type Handler<T extends InboundMessageType> = (data: InboundMessages[T]) => void;
type StateListener = (state: WsConnectionState) => void;

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

class WSClient {
  private socket: WebSocket | null = null;
  private handlers: Map<InboundMessageType, Set<Handler<InboundMessageType>>> = new Map();
  private stateListeners: Set<StateListener> = new Set();
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private state: WsConnectionState = "closed";
  private intentionalClose = false;
  private outbox: string[] = [];

  connect(): void {
    if (this.socket && (this.state === "open" || this.state === "connecting")) {
      return;
    }
    this.intentionalClose = false;
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cancelReconnect();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
    }
    this.socket = null;
    this.setState("closed");
  }

  send<T extends OutboundMessageType>(type: T, data: OutboundMessages[T]): void {
    const payload = JSON.stringify({ type, data });
    if (this.socket && this.state === "open") {
      this.socket.send(payload);
    } else {
      this.outbox.push(payload);
    }
  }

  on<T extends InboundMessageType>(type: T, handler: Handler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as Handler<InboundMessageType>);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler as Handler<InboundMessageType>);
    };
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getState(): WsConnectionState {
    return this.state;
  }

  private openSocket(): void {
    const url = buildWsUrl();
    this.setState("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      console.error("WebSocket construct error", err);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState("open");
      while (this.outbox.length > 0) {
        const message = this.outbox.shift();
        if (message !== undefined) socket.send(message);
      }
    };

    socket.onmessage = (event) => {
      let parsed: InboundEvent;
      try {
        parsed = JSON.parse(event.data) as InboundEvent;
      } catch (err) {
        console.warn("Invalid WS payload", err);
        return;
      }
      const set = this.handlers.get(parsed.type);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(parsed.data);
        } catch (err) {
          console.error("WS handler error", parsed.type, err);
        }
      }
    };

    socket.onerror = (event) => {
      console.warn("WebSocket error", event);
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.intentionalClose) {
        this.setState("closed");
        return;
      }
      this.setState("closed");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: WsConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("WS state listener error", err);
      }
    }
  }
}

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export const wsClient = new WSClient();
