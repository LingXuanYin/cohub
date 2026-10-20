import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicGenerationDeclaration } from "@cohub/protocol/generation";
import { buildCreateGenerationRequest } from "../lib/features/session-chat/create-generation-request";

const song2 = {
	schema: "neta.generation.model.v1",
	model: "song2",
	title: "Song 2",
	content: {
		input: [
			{ type: "text", roles: ["prompt", "lyrics", "abc"], min: 1, max: 3 },
			{ type: "image", sources: ["url"] },
		],
	},
	parameters: {
		seed: { type: "integer", optional: true },
		return_abc: { type: "boolean", optional: true },
	},
} satisfies PublicGenerationDeclaration;

const imagePro = {
	schema: "neta.generation.model.v1",
	model: "image-pro",
	title: "Pro Image",
	content: {
		input: [{ type: "text" }, { type: "image", sources: ["url"] }],
	},
} satisfies PublicGenerationDeclaration;

test("builds a text-only create request", () => {
	assert.deepEqual(
		buildCreateGenerationRequest({
			declaration: song2,
			text: "upbeat synthwave",
			clientMessageId: "client-text",
		}),
		{
			mode: "create",
			generation: {
				model: "song2",
				content: [{ type: "text", text: "upbeat synthwave" }],
			},
			clientMessageId: "client-text",
			accessMode: "full_access",
			intent: "followup",
			schedule: { mode: "immediate" },
		},
	);
});

test("builds a create request with an uploaded image and an existing session", () => {
	assert.deepEqual(
		buildCreateGenerationRequest({
			declaration: imagePro,
			text: "a lighthouse at dusk",
			imageUrls: ["https://cdn.example.test/lighthouse.png"],
			sessionId: "session-existing",
			clientMessageId: "client-image",
		}),
		{
			mode: "create",
			sessionId: "session-existing",
			generation: {
				model: "image-pro",
				content: [
					{ type: "text", text: "a lighthouse at dusk" },
					{
						type: "image",
						source: {
							type: "url",
							url: "https://cdn.example.test/lighthouse.png",
						},
					},
				],
			},
			clientMessageId: "client-image",
			accessMode: "full_access",
			intent: "followup",
			schedule: { mode: "immediate" },
		},
	);
});

test("keeps text attachments before uploaded images", () => {
	assert.deepEqual(
		buildCreateGenerationRequest({
			declaration: song2,
			text: "summarize this",
			textAttachments: [{ text: "line one\nline two" }],
			imageUrls: ["https://cdn.example.test/lighthouse.png"],
			clientMessageId: "client-text-and-image",
		}),
		{
			mode: "create",
			generation: {
				model: "song2",
				content: [
					{ type: "text", text: "summarize this" },
					{ type: "text", text: "line one\nline two" },
					{
						type: "image",
						source: {
							type: "url",
							url: "https://cdn.example.test/lighthouse.png",
						},
					},
				],
			},
			clientMessageId: "client-text-and-image",
			accessMode: "full_access",
			intent: "followup",
			schedule: { mode: "immediate" },
		},
	);
});

test("forwards parameters under generation", () => {
	assert.deepEqual(
		buildCreateGenerationRequest({
			declaration: song2,
			text: "upbeat synthwave",
			parameters: { seed: 42, return_abc: true },
			clientMessageId: "client-params",
		}),
		{
			mode: "create",
			generation: {
				model: "song2",
				content: [{ type: "text", text: "upbeat synthwave" }],
				parameters: { seed: 42, return_abc: true },
			},
			clientMessageId: "client-params",
			accessMode: "full_access",
			intent: "followup",
			schedule: { mode: "immediate" },
		},
	);
});
