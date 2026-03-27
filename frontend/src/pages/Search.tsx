import { useState, useEffect } from "react";
import {
	Search as SearchIcon,
	Filter,
	Loader2,
	FileText,
	Layers,
	Folder,
} from "lucide-react";
import api from "../services/api";
import type { SearchResult, Folder as FolderType } from "../services/api";
import { useAuth } from "../context/AuthContext";
import PdfViewerModal from "../components/PdfViewerModal";
import TextViewerModal from "../components/TextViewerModal";
import Button from "../components/ui/Button";

import { ChevronDown, Check } from "lucide-react";

function FolderSelect({
	folders,
	selectedId,
	onChange,
}: {
	folders: { id: string; name: string; depth: number }[];
	selectedId: string;
	onChange: (id: string) => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const selectedFolder = folders.find((f) => f.id === selectedId);

	// Close when clicking outside - simple implementation
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				isOpen &&
				!(event.target as Element).closest(".folder-select-container")
			) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	return (
		<div className="relative folder-select-container min-w-[240px]">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={`w-full flex items-center justify-between text-sm bg-white dark:bg-gray-800 border transition-all duration-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
					isOpen
						? "border-primary-500 ring-4 ring-primary-500/10 shadow-md"
						: "border-gray-200 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-500 hover:shadow-md"
				} text-gray-700 dark:text-gray-200`}
			>
				<div className="flex items-center truncate mr-3">
					<Filter
						className={`w-4 h-4 mr-2.5 transition-colors ${
							selectedFolder
								? "text-primary-500"
								: "text-gray-400 group-hover:text-primary-500"
						}`}
					/>
					<span
						className={`truncate font-medium ${selectedFolder ? "text-primary-600 dark:text-primary-400" : ""}`}
					>
						{selectedFolder
							? selectedFolder.name
							: "Todas las carpetas"}
					</span>
				</div>
				<ChevronDown
					className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180 text-primary-500" : ""}`}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-2 w-72 max-h-80 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl z-50 py-2 animate-in fade-in zoom-in-95 duration-100">
					<div
						className={`px-4 py-2.5 cursor-pointer text-sm flex items-center transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${!selectedId ? "bg-primary-50/50 dark:bg-primary-900/10 text-primary-600 dark:text-primary-400" : "text-gray-700 dark:text-gray-300"}`}
						onClick={() => {
							onChange("");
							setIsOpen(false);
						}}
					>
						<div className="w-6 flex items-center justify-center mr-2">
							{!selectedId ? (
								<Check className="w-4 h-4 text-primary-600 dark:text-primary-400" />
							) : (
								<div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
							)}
						</div>
						<span className="font-medium">Todas las carpetas</span>
					</div>
					<div className="border-t border-gray-100 dark:border-gray-700 my-2 mx-4"></div>
					{folders.length === 0 ? (
						<div className="px-4 py-3 text-xs text-gray-400 text-center italic">
							No hay carpetas creadas
						</div>
					) : (
						folders.map((f) => {
							const isSelected = f.id === selectedId;
							return (
								<div
									key={f.id}
									className={`group px-4 py-2 cursor-pointer text-sm flex items-center transition-all hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isSelected ? "text-primary-600 dark:text-primary-400 bg-primary-50/30 dark:bg-primary-900/10" : "text-gray-600 dark:text-gray-400"}`}
									style={{
										paddingLeft: `${f.depth * 16 + 16}px`,
									}}
									onClick={() => {
										onChange(f.id);
										setIsOpen(false);
									}}
								>
									{isSelected && (
										<Check className="w-3.5 h-3.5 absolute left-4 text-primary-500" />
									)}
									<div className="flex items-center w-full">
										<Folder
											className={`w-4 h-4 mr-2.5 transition-colors ${isSelected ? "text-primary-500 fill-primary-500/20" : "text-gray-400 group-hover:text-gray-500"}`}
										/>
										<span
											className={`truncate ${isSelected ? "font-semibold" : ""}`}
										>
											{f.name}
										</span>
									</div>
								</div>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}

// Sigmoid function to normalize logits to 0-1 probability
const sigmoid = (score: number) => {
	return 1 / (1 + Math.exp(-score));
};

export default function Search() {
	const { isAdmin } = useAuth();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [folders, setFolders] = useState<FolderType[]>([]);
	const [selectedFolder, setSelectedFolder] = useState<string>("");
	const [searchHasRun, setSearchHasRun] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchThreshold, setSearchThreshold] = useState<number>(0.6);
	const [searchLimit, setSearchLimit] = useState<number>(10);

	const canSearch = isAdmin || folders.length > 0;

	// Viewer State
	const [viewerState, setViewerState] = useState<{
		isOpen: boolean;
		type: "pdf" | "text" | null;
		url: string;
		page: number;
		filename: string;
	}>({
		isOpen: false,
		type: null,
		url: "",
		page: 1,
		filename: "",
	});

	useEffect(() => {
		// Fetch folders for filter
		api.getFolders().then(setFolders).catch(console.error);

		// Fetch settings
		api.getSettings()
			.then((settings) => {
				setSearchThreshold(settings.search_threshold || 0.6);
				setSearchLimit(settings.search_limit || 10);
			})
			.catch(console.error);
	}, []);

	const openDocument = (res: SearchResult) => {
		const isPdf =
			(res.metadata?.filename || "").toLowerCase().endsWith(".pdf") ||
			(res.metadata?.filename || "").toLowerCase().endsWith(".pdfa");

		// Everything else (txt, email, md) is handled by TextViewer
		const url = api.getPdfUrl(res.metadata.doc_id || res.id);

		setViewerState({
			isOpen: true,
			type: isPdf ? "pdf" : "text",
			url,
			page: res.metadata.page_num || res.metadata.page_number || 1,
			filename: res.metadata?.filename || "Sin nombre",
		});
	};

	const closeViewer = () => {
		setViewerState((prev) => ({ ...prev, isOpen: false }));
	};

	const handleSearch = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		if (!query.trim() || !canSearch) return;

		setLoading(true);
		setSearchHasRun(true);
		setError(null);
		try {
			const filters = selectedFolder
				? { folder_id: selectedFolder }
				: undefined;
			const res = await api.search(
				query,
				searchLimit,
				searchThreshold,
				filters,
			);
			setResults(res?.results || []);
		} catch (err: any) {
			console.error("Search failed", err);
			setError(
				err.response?.data?.detail ||
					"Falló la búsqueda. Inténtalo de nuevo.",
			);
			setResults([]);
		} finally {
			setLoading(false);
		}
	};

	// Flatten folders for the select dropdown to show hierarchy
	const getFlattenedFolders = (
		allFolders: FolderType[],
		parentId: string | null = null,
		depth = 0,
	): { id: string; name: string; depth: number }[] => {
		const result: { id: string; name: string; depth: number }[] = [];
		const children = allFolders.filter((f) => f.parent_id === parentId);

		for (const child of children) {
			result.push({ id: child.id, name: child.name, depth });
			result.push(
				...getFlattenedFolders(allFolders, child.id, depth + 1),
			);
		}
		return result;
	};

	const flattenedFolders = getFlattenedFolders(folders);

	return (
		<div className="p-6 max-w-6xl mx-auto h-full flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
			{/* Header / Search Bar */}
			<div
				className={`transition-all duration-500 ${searchHasRun ? "mb-6" : "mt-20 mb-12 text-center"}`}
			>
				{!searchHasRun && (
					<h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
						¿Qué estás buscando?
					</h1>
				)}

				<form
					onSubmit={handleSearch}
					className={`relative max-w-3xl ${searchHasRun ? "" : "mx-auto"}`}
				>
					<div className="relative group">
						<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
							<SearchIcon className="h-6 w-6 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
						</div>
						<input
							type="text"
							className="block w-full pl-12 pr-4 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm text-lg placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent transition-all text-gray-900 dark:text-white"
							placeholder="Buscar en documentos..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						<Button
							type="submit"
							disabled={loading || !canSearch}
							className="absolute inset-y-2 right-2 px-6"
						>
							{loading ? (
								<Loader2 className="w-5 h-5 animate-spin" />
							) : (
								"Buscar"
							)}
						</Button>
					</div>

					{/* Filters Row */}
					<div
						className={`mt-3 flex items-center space-x-4 ${searchHasRun ? "" : "justify-center"}`}
					>
						<FolderSelect
							folders={flattenedFolders}
							selectedId={selectedFolder}
							onChange={setSelectedFolder}
						/>
					</div>
					{!canSearch && (
						<div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-300">
							No tienes carpetas asignadas. Contacta con un
							administrador para acceder a la búsqueda.
						</div>
					)}
				</form>
			</div>

			{/* Results Area */}
			<div className="flex-1 overflow-auto">
				{error ? (
					<div className="flex flex-col items-center justify-center h-64">
						<div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 max-w-md">
							<p className="text-red-600 dark:text-red-400 font-medium mb-2">
								Error de Búsqueda
							</p>
							<p className="text-red-500 dark:text-red-300 text-sm">
								{error}
							</p>
						</div>
					</div>
				) : loading ? (
					<div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
						<Loader2 className="w-8 h-8 animate-spin mb-4 text-primary-500" />
						<p>Buscando en tu base de conocimiento...</p>
					</div>
				) : results?.length > 0 ? (
					<div className="grid gap-6 pb-10">
						{results.map((res) => (
							<div
								key={res.id}
								className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md transition-all cursor-pointer group"
								onClick={() => openDocument(res)}
							>
								<div className="flex justify-between items-start mb-2">
									<div className="flex items-center space-x-2 text-primary-700 dark:text-primary-400 font-medium">
										<FileText className="w-4 h-4" />
										<span>
											{res.metadata?.filename ||
												"Sin nombre"}
										</span>
										{res.metadata.page_number && (
											<span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
												Pág {res.metadata.page_number}
											</span>
										)}
									</div>
									<div className="flex items-center space-x-2">
										<div className="text-xs text-green-600 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
											{Math.round(
												sigmoid(res.score) * 100,
											)}
											% Relevancia
										</div>
										{/* @ts-ignore */}
										{sigmoid(res.score) > 0.9 &&
											res.text && (
												<div className="text-xs text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">
													Exacto
												</div>
											)}
									</div>
								</div>

								<div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50 dark:border-gray-700">
									<div className="flex items-center space-x-4">
										{res.metadata.folder_id && (
											<span className="flex items-center text-xs text-gray-500 dark:text-gray-400">
												<Folder className="w-3 h-3 mr-1" />
												{folders.find(
													(f) =>
														f.id ===
														res.metadata.folder_id,
												)?.name ||
													"Carpeta Desconocida"}
											</span>
										)}
									</div>
									<button
										className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 font-medium flex items-center space-x-1"
										onClick={(e) => {
											e.stopPropagation();
											openDocument(res);
										}}
									>
										<span>Ver Documento</span>
										<Layers className="w-4 h-4" />
									</button>
								</div>
							</div>
						))}
					</div>
				) : (
					searchHasRun && (
						<div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
							<p className="text-gray-500 dark:text-gray-400">
								No se encontraron resultados para "{query}".
								Prueba con otras palabras clave.
							</p>
						</div>
					)
				)}
			</div>

			<PdfViewerModal
				isOpen={viewerState.isOpen && viewerState.type === "pdf"}
				onClose={closeViewer}
				pdfUrl={viewerState.url}
				initialPage={viewerState.page}
				filename={viewerState.filename}
			/>

			<TextViewerModal
				isOpen={viewerState.isOpen && viewerState.type === "text"}
				onClose={closeViewer}
				textUrl={viewerState.url}
				filename={viewerState.filename}
			/>
		</div>
	);
}
