import { useState, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";
import Button from "./ui/Button";

interface TextViewerModalProps {
	isOpen: boolean;
	onClose: () => void;
	textUrl: string;
	filename: string;
}

export default function TextViewerModal({
	isOpen,
	onClose,
	textUrl,
	filename,
}: TextViewerModalProps) {
	const [content, setContent] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (isOpen && textUrl) {
			setLoading(true);
			setError(null);
			fetch(textUrl)
				.then(async (res) => {
					if (!res.ok) throw new Error("Failed to load content");
					return res.text();
				})
				.then((text) => setContent(text))
				.catch((err) => {
					console.error(err);
					setError("No se pudo cargar el contenido del archivo.");
				})
				.finally(() => setLoading(false));
		} else {
			setContent("");
		}
	}, [isOpen, textUrl]);

	const handleCopy = () => {
		navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
			<div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
					<h3
						className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-md flex items-center"
						title={filename}
					>
						<span className="bg-gray-200 dark:bg-gray-700 text-xs px-2 py-1 rounded mr-3 text-gray-600 dark:text-gray-400 font-mono">
							TXT
						</span>
						{filename}
					</h3>

					<div className="flex items-center space-x-3">
						<button
							onClick={handleCopy}
							className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
						>
							{copied ? (
								<>
									<Check className="w-4 h-4 mr-1.5" />
									Copiado
								</>
							) : (
								<>
									<Copy className="w-4 h-4 mr-1.5" />
									Copiar
								</>
							)}
						</button>
						<div className="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
						<Button
							variant="ghost"
							size="icon"
							onClick={onClose}
							className="hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
						>
							<X className="w-6 h-6" />
						</Button>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto p-6 bg-white dark:bg-gray-950 font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-300">
					{loading ? (
						<div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 animate-pulse">
							Cargando contenido...
						</div>
					) : error ? (
						<div className="flex items-center justify-center h-full text-red-500">
							{error}
						</div>
					) : (
						<EmailContentRenderer content={content} />
					)}
				</div>
			</div>
		</div>
	);
}

// Helper component to parse and render email content
function EmailContentRenderer({ content }: { content: string }) {
	// Simple heuristic to detect if it's likely an email with headers
	// Look for standard headers at the start
	const hasHeaders =
		/^(From|De|To|Para|Sent|Enviado|Date|Fecha|Subject|Asunto):/im.test(
			content.substring(0, 500),
		);

	if (!hasHeaders) {
		return (
			<pre className="whitespace-pre-wrap break-words max-w-full">
				{content}
			</pre>
		);
	}

	// Extract headers and body
	const lines = content.split("\n");
	const headers: { key: string; value: string }[] = [];
	let bodyStartIndex = 0;
	let collectingHeaders = true;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Empty line usually separates headers from body
		if (line.trim() === "") {
			if (headers.length > 0) {
				collectingHeaders = false;
				bodyStartIndex = i + 1;
				break;
			}
			continue;
		}

		if (collectingHeaders) {
			const match = line.match(/^([a-zA-Z0-9\s-]+):(.+)$/);
			if (match) {
				headers.push({
					key: match[1].trim(),
					value: match[2].trim(),
				});
			} else {
				// If a line doesn't match header format but we are collecting,
				// it might be a continuation or we mistakenly thought we were in headers.
				// For safety, if we encounter non-header line early, maybe stop?
				// But let's assume it's part of previous header or just stop header collection.
				// Simple approach: if it doesn't look like a header, stop collecting.
				collectingHeaders = false;
				bodyStartIndex = i;
				break;
			}
		}
	}

	// Basic cleanup: remove trailing spaces per line, collapse 3+ newlines to 2
	let body = lines
		.slice(bodyStartIndex)
		.map((l) => l.trimEnd())
		.join("\n");

	body = body.replace(/\n{3,}/g, "\n\n");

	return (
		<div className="space-y-6">
			{/* Headers Section */}
			<div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-100 dark:border-gray-800">
				<div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2">
					{headers.map((h, idx) => (
						<div key={idx} className="contents group">
							<span className="text-gray-500 dark:text-gray-500 font-semibold text-right border-r border-transparent group-hover:border-gray-200 dark:group-hover:border-gray-700 pr-3 transition-colors">
								{h.key}:
							</span>
							<span className="text-gray-900 dark:text-gray-100 font-medium break-words">
								{h.value}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Body Section */}
			<div className="prose dark:prose-invert max-w-none">
				<pre className="whitespace-pre-wrap break-words max-w-full font-sans text-base bg-transparent p-0 border-0">
					{body}
				</pre>
			</div>
		</div>
	);
}
