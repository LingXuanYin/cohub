const segmenter =
	typeof Intl !== "undefined" && "Segmenter" in Intl
		? new Intl.Segmenter(undefined, { granularity: "grapheme" })
		: null;

export function countGraphemes(text: string): number {
	if (!text) return 0;
	if (!segmenter) return [...text].length;
	let count = 0;
	for (const _ of segmenter.segment(text)) count += 1;
	return count;
}

function graphemeStart(text: string, index: number): number {
	if (index <= 0 || index >= text.length) return index;
	if (!segmenter) {
		const code = text.charCodeAt(index);
		return code >= 0xdc00 && code <= 0xdfff ? index - 1 : index;
	}
	return segmenter.segment(text).containing(index)?.index ?? index;
}

export function diffText(
	before: string,
	after: string,
): { erase: number; text: string } {
	const limit = Math.min(before.length, after.length);
	let common = 0;
	while (
		common < limit &&
		before.charCodeAt(common) === after.charCodeAt(common)
	)
		common += 1;
	common = graphemeStart(before, common);
	return {
		erase: countGraphemes(before.slice(common)),
		text: after.slice(common),
	};
}
