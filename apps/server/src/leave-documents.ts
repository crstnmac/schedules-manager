import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { BadRequestError } from "./errors";

export const LEAVE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const LEAVE_DOCUMENT_MIME_TYPES = [
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
	"application/pdf": ".pdf",
	"image/jpeg": ".jpg",
	"image/png": ".png",
	"image/webp": ".webp",
	"image/heic": ".heic",
};

export function leaveUploadRoot(): string {
	return (
		process.env.LEAVE_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "leave")
	);
}

/** Keeps stored paths inside the upload root, whatever the key claims to be. */
export function resolveLeaveDocumentPath(storageKey: string): string {
	const root = path.resolve(leaveUploadRoot());
	const resolved = path.resolve(root, storageKey);
	if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
		throw new BadRequestError("Invalid document path");
	}
	return resolved;
}

const HEIF_BRANDS = new Set([
	"heic",
	"heix",
	"hevc",
	"hevx",
	"heim",
	"heis",
	"mif1",
	"msf1",
]);

/** Magic-byte check for the accepted document types. */
export function contentMatchesType(bytes: Buffer, mimeType: string): boolean {
	const ascii = (start: number, end: number) =>
		bytes.subarray(start, end).toString("latin1");
	switch (mimeType) {
		case "application/pdf":
			return ascii(0, 5) === "%PDF-";
		case "image/jpeg":
			return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
		case "image/png":
			return ascii(0, 8) === "\x89PNG\r\n\x1a\n";
		case "image/webp":
			return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
		case "image/heic":
		case "image/heif":
			return ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12));
		default:
			return false;
	}
}

export async function storeLeaveDocument(input: {
	file: File;
	workplaceId: string;
	requestId: string;
}): Promise<{
	storageKey: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
}> {
	const mimeType = input.file.type || "application/octet-stream";
	if (
		!LEAVE_DOCUMENT_MIME_TYPES.includes(
			mimeType as (typeof LEAVE_DOCUMENT_MIME_TYPES)[number],
		)
	) {
		throw new BadRequestError(
			"Documents must be a PDF or an image (JPEG, PNG, WebP, HEIC)",
		);
	}
	if (input.file.size <= 0) {
		throw new BadRequestError("The document is empty");
	}
	if (input.file.size > LEAVE_DOCUMENT_MAX_BYTES) {
		throw new BadRequestError("Documents must be 10 MB or smaller");
	}
	const bytes = Buffer.from(await input.file.arrayBuffer());
	// SEC-012: the browser-declared type is only a claim; the bytes must agree.
	if (!contentMatchesType(bytes, mimeType)) {
		throw new BadRequestError("The file's contents don't match its type");
	}

	const extension =
		EXTENSION_BY_MIME[mimeType] ??
		path.extname(input.file.name || "").slice(0, 10) ??
		".bin";
	const storageKey = path.join(
		input.workplaceId,
		input.requestId,
		`${crypto.randomUUID()}${extension}`,
	);
	const target = resolveLeaveDocumentPath(storageKey);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, bytes);
	return {
		storageKey,
		fileName: (input.file.name || "document").slice(0, 200),
		mimeType,
		sizeBytes: input.file.size,
	};
}

export async function removeLeaveDocument(storageKey: string): Promise<void> {
	try {
		await rm(resolveLeaveDocumentPath(storageKey), { force: true });
	} catch {
		// The metadata row is the source of truth; a missing blob is not fatal.
	}
}
