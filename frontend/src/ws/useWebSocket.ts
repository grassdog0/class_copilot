import { useEffect, useState } from "react";
import { wsClient } from "./client";
import type {
  InboundMessageType,
  InboundMessages,
  OutboundMessageType,
  OutboundMessages,
  WsConnectionState,
} from "./messages";

export function useWsEvent<T extends InboundMessageType>(
  type: T,
  handler: (data: InboundMessages[T]) => void,
): void {
  useEffect(() => {
    return wsClient.on(type, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, handler]);
}

export function useWsSend(): <T extends OutboundMessageType>(
  type: T,
  data: OutboundMessages[T],
) => void {
  return (type, data) => wsClient.send(type, data);
}

export function useWsConnectionState(): WsConnectionState {
  const [state, setState] = useState<WsConnectionState>(() => wsClient.getState());
  useEffect(() => wsClient.onStateChange(setState), []);
  return state;
}
