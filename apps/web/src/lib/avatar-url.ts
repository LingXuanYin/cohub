import { imageVariantUrl, mediaVariantSize } from "@neta-art/cohub/media";

type AvatarImageSize = "xxs" | "xs" | "sm" | "md" | "lg" | "xl" | number;

const AVATAR_WIDTHS: Record<Exclude<AvatarImageSize, number>, number> = {
	xxs: 48,
	xs: 64,
	sm: 96,
	md: 128,
	lg: 192,
	xl: 320,
};

function widthForSize(size: AvatarImageSize) {
	return typeof size === "number" ? size : AVATAR_WIDTHS[size];
}

export function avatarImageUrl(
	src: string | null | undefined,
	size: AvatarImageSize = "md",
) {
	const value = src?.trim();
	if (!value) return "";
	return imageVariantUrl(value, mediaVariantSize(widthForSize(size))) ?? value;
}
