/// <reference lib="webworker" />
import { chooseBotMove, evaluatePosition, type BotReply, type BotRequest, type EvalRequest } from './engine';

export type WorkerRequest =
  | { id: number; kind: 'move'; payload: BotRequest }
  | { id: number; kind: 'eval'; payload: EvalRequest };

export type WorkerResponse =
  | { id: number; ok: true; kind: 'move' | 'eval'; reply: BotReply }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    const reply = msg.kind === 'move' ? chooseBotMove(msg.payload) : evaluatePosition(msg.payload);
    const out: WorkerResponse = { id: msg.id, ok: true, kind: msg.kind, reply };
    ctx.postMessage(out);
  } catch (e) {
    const out: WorkerResponse = { id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    ctx.postMessage(out);
  }
};
