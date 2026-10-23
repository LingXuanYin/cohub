import type { IncomingMessage } from "node:http";
import { parseRealtimeRoom, type RealtimeEnvelope, type RealtimeRoom } from "@cohub/protocol/realtime";

export const ANONYMOUS_MAX_CONNECTIONS_PER_IP = 10;
export const ANONYMOUS_MAX_ROOMS = 8;
export const ANONYMOUS_IDLE_MS = 30_000;
export const ANONYMOUS_REAUTHORIZE_MS = 60_000;

export type AnonymousRoomRejection = { room: string; code: "FORBIDDEN"; message: string };

const header = (request: IncomingMessage | undefined, name: string) => {
	const value = request?.headers[name];
	return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim() || undefined;
};

export const clientIp = (request?: IncomingMessage) =>
	header(request, "cf-connecting-ip") ?? header(request, "x-forwarded-for") ?? request?.socket.remoteAddress ?? "unknown";

export function createAnonymousAdmission(maxPerIp = ANONYMOUS_MAX_CONNECTIONS_PER_IP) {
	const counts = new Map<string, number>();
	return {
		admit(ip: string): boolean {
			const count = counts.get(ip) ?? 0;
			if (count >= maxPerIp) return false;
			counts.set(ip, count + 1);
			return true;
		},
		release(ip: string) {
			const count = (counts.get(ip) ?? 0) - 1;
			if (count > 0) counts.set(ip, count);
			else counts.delete(ip);
		},
	};
}

export function anonymousRoomRequest(rooms: readonly RealtimeRoom[], following: ReadonlySet<RealtimeRoom>) {
	const boards: RealtimeRoom[] = [];
	const rejected: AnonymousRoomRejection[] = [];
	let followed = following.size;
	for (const room of rooms) {
		if (parseRealtimeRoom(room)?.kind !== "board") {
			rejected.push({ room, code: "FORBIDDEN", message: "Sign in to follow this room" });
		} else if (!following.has(room) && followed >= ANONYMOUS_MAX_ROOMS) {
			rejected.push({ room, code: "FORBIDDEN", message: "Too many Boards followed at once" });
		} else {
			if (!following.has(room)) followed += 1;
			boards.push(room);
		}
	}
	return { boards, rejected };
}

export function anonymousEnvelope(envelope: RealtimeEnvelope): RealtimeEnvelope | null {
	if (envelope.type === "board.playback.changed") return envelope;
	if (envelope.type !== "board.changed") return null;
	const { actorId: _actorId, actor: _actor, source: _source, ...payload } = envelope.payload as Record<string, unknown>;
	return { ...envelope, payload };
}
