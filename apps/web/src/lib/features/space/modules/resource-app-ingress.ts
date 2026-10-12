import { redirect } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";
import {
	resourceAppRef,
	resourceFromUrl,
	resourceWorkspaceUrl,
} from "./resource-app-route";

export function redirectResourcePage(url: URL) {
	if (url.searchParams.get("native") === "1") return;
	const resource = resourceFromUrl(url);
	if (
		!resource ||
		!resourceAppRef(env.PUBLIC_RESOURCE_APPS_PREFIX, resource.target)
	)
		return;
	redirect(
		307,
		resourceWorkspaceUrl(
			`/spaces/${resource.spaceId}`,
			url.searchParams,
			resource.target,
		),
	);
}
