const PALETTE = [
	"#6366F1",
	"#0EA5E9",
	"#10B981",
	"#F59E0B",
	"#EF4444",
	"#8B5CF6",
	"#EC4899",
	"#14B8A6",
];

export function positionColor(name: string): string {
	let hash = 0;
	for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	return PALETTE[Math.abs(hash) % PALETTE.length];
}
