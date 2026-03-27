import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import Button from "./ui/Button";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Configure worker to use local file served from public directory
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfViewerModalProps {
	isOpen: boolean;
	onClose: () => void;
	pdfUrl: string;
	initialPage?: number; // 1-indexed
	filename: string;
}

export default function PdfViewerModal({
	isOpen,
	onClose,
	pdfUrl,
	initialPage = 1,
	filename,
}: PdfViewerModalProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState(initialPage);
	const [scale, setScale] = useState(1.2);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setPageNumber(initialPage);
	}, [initialPage, pdfUrl]);

	if (!isOpen) return null;

	function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
		setNumPages(numPages);
		setError(null);
	}

	function onDocumentLoadError(err: Error) {
		console.error("PDF Load Error:", err);
		setError("Failed to load PDF document.");
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
			<div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
					<h3
						className="font-semibold text-gray-800 truncate max-w-md"
						title={filename}
					>
						{filename}
					</h3>

					<div className="flex items-center space-x-4">
						{/* Pagination */}
						<div className="flex items-center bg-white border border-gray-300 rounded-lg shadow-sm">
							<button
								disabled={pageNumber <= 1}
								onClick={() => setPageNumber((p) => p - 1)}
								className="p-1.5 hover:bg-gray-100 disabled:opacity-50 border-r border-gray-300"
							>
								<ChevronLeft className="w-5 h-5 text-gray-600" />
							</button>
							<div className="px-3 text-sm font-medium text-gray-700">
								{pageNumber} / {numPages || "--"}
							</div>
							<button
								disabled={pageNumber >= numPages}
								onClick={() => setPageNumber((p) => p + 1)}
								className="p-1.5 hover:bg-gray-100 disabled:opacity-50 border-l border-gray-300"
							>
								<ChevronRight className="w-5 h-5 text-gray-600" />
							</button>
						</div>

						{/* Zoom */}
						<div className="flex items-center space-x-2">
							<button
								onClick={() =>
									setScale((s) => Math.max(0.5, s - 0.1))
								}
								className="p-2 hover:bg-gray-200 rounded-full"
							>
								<ZoomOut className="w-5 h-5 text-gray-600" />
							</button>
							<span className="text-sm text-gray-600 min-w-[3ch]">
								{Math.round(scale * 100)}%
							</span>
							<button
								onClick={() =>
									setScale((s) => Math.min(3, s + 0.1))
								}
								className="p-2 hover:bg-gray-200 rounded-full"
							>
								<ZoomIn className="w-5 h-5 text-gray-600" />
							</button>
						</div>
					</div>

					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						className="hover:bg-red-50 hover:text-red-500"
					>
						<X className="w-6 h-6" />
					</Button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-auto bg-gray-100 flex justify-center p-8">
					{error ? (
						<div className="text-red-500 my-auto">{error}</div>
					) : (
						<Document
							file={pdfUrl}
							onLoadSuccess={onDocumentLoadSuccess}
							onLoadError={onDocumentLoadError}
							loading={
								<div className="text-gray-500 animate-pulse">
									Loading PDF...
								</div>
							}
							className="shadow-lg"
						>
							<div className="relative">
								<Page
									pageNumber={pageNumber}
									scale={scale}
									renderTextLayer={true}
									renderAnnotationLayer={true}
									className="bg-white"
								/>
							</div>
						</Document>
					)}
				</div>
			</div>
		</div>
	);
}
