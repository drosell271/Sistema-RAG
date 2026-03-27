import { useState, useEffect } from "react";
import {
	Folder,
	FileText,
	Trash2,
	Upload,
	Loader2,
	FolderPlus,
	Layers,
	ChevronRight,
	ChevronDown,
	Search,
	Lock,
	Globe,
	Pencil,
	Mail,
} from "lucide-react";
import api from "../services/api";
import { useUpload } from "../context/UploadContext";
import type {
	Folder as FolderType,
	Document as DocType,
	Group as GroupType,
} from "../services/api";
import socketService from "../services/socket";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import PdfViewerModal from "../components/PdfViewerModal";
import TextViewerModal from "../components/TextViewerModal";

// --- Components ---

// Folder Modal Component
interface FolderModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (name: string, isPublic: boolean, groups: string[]) => void;
	title: string;
	initialName?: string;
	initialPublic?: boolean;
	initialGroups?: string[];
	availableGroups: GroupType[];
}

const FolderModal = ({
	isOpen,
	onClose,
	onSave,
	title,
	initialName = "",
	initialPublic = false, // Changed to private by default
	initialGroups = [],
	availableGroups,
	showPermissions = true,
}: FolderModalProps & { showPermissions?: boolean }) => {
	const [name, setName] = useState(initialName);
	const [isPublic, setIsPublic] = useState(initialPublic);
	const [groups, setGroups] = useState<string[]>(initialGroups);

	useEffect(() => {
		if (isOpen) {
			setName(initialName);
			setIsPublic(initialPublic);
			setGroups(initialGroups);
		}
	}, [isOpen, initialName, initialPublic, initialGroups]);

	if (!isOpen) return null;

	const toggleGroup = (groupId: string) => {
		if (groups.includes(groupId)) {
			setGroups(groups.filter((g) => g !== groupId));
		} else {
			setGroups([...groups, groupId]);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
				<h3 className="text-lg font-bold mb-4 dark:text-white">
					{title}
				</h3>

				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-1 dark:text-gray-300">
							Nombre
						</label>
						<input
							type="text"
							className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Nombre de la carpeta"
							autoFocus
						/>
					</div>

					{showPermissions ? (
						<>
							<div>
								<label className="block text-sm font-medium mb-2 dark:text-gray-300">
									Visibilidad
								</label>
								<div className="flex space-x-4">
									<button
										onClick={() => setIsPublic(true)}
										className={`flex-1 py-2 px-3 rounded-lg border flex items-center justify-center space-x-2 ${isPublic ? "bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/20" : "border-gray-200 dark:border-gray-700 text-gray-500"}`}
									>
										<Globe className="w-4 h-4" />
										<span>Pública</span>
									</button>
									<button
										onClick={() => setIsPublic(false)}
										className={`flex-1 py-2 px-3 rounded-lg border flex items-center justify-center space-x-2 ${!isPublic ? "bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-900/20" : "border-gray-200 dark:border-gray-700 text-gray-500"}`}
									>
										<Lock className="w-4 h-4" />
										<span>Privada</span>
									</button>
								</div>
							</div>

							{!isPublic && (
								<div>
									<label className="block text-sm font-medium mb-2 dark:text-gray-300">
										Acceso a Grupos
									</label>
									<div className="max-h-40 overflow-y-auto border rounded dark:border-gray-700 p-2 space-y-1">
										{availableGroups.length > 0 ? (
											availableGroups.map(
												(group, index) => (
													<div
														key={group.id || index}
														className="flex items-center space-x-2"
													>
														<input
															type="checkbox"
															id={`g-${group.id}`}
															checked={groups.includes(
																group.id,
															)}
															onChange={() =>
																toggleGroup(
																	group.id,
																)
															}
															className="rounded text-primary-600"
														/>
														<label
															htmlFor={`g-${group.id}`}
															className="text-sm dark:text-gray-300 cursor-pointer select-none"
														>
															{group.name}
														</label>
													</div>
												),
											)
										) : (
											<p className="text-sm text-gray-500 italic">
												No hay grupos disponibles. Crea
												uno en Administración.
											</p>
										)}
									</div>
								</div>
							)}
						</>
					) : (
						<div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
							<p className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
								<Lock className="w-3 h-3 mr-2" />
								Permisos heredados de la carpeta padre
							</p>
						</div>
					)}
				</div>

				<div className="mt-6 flex justify-end space-x-3">
					<div className="mt-6 flex justify-end space-x-3">
						<Button variant="secondary" onClick={onClose}>
							Cancelar
						</Button>
						<Button
							onClick={() => onSave(name, isPublic, groups)}
							disabled={!name}
						>
							Guardar
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

// Recursive Folder Item
interface FolderItemProps {
	folder: FolderType;
	allFolders: FolderType[];
	selectedFolder: string | null;
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
	depth?: number;
	isAdmin: boolean;
	groupsMap: Record<string, GroupType>;
}

const FolderItem = ({
	folder,
	allFolders,
	selectedFolder,
	onSelect,
	onDelete,
	depth = 0,
	isAdmin,
	groupsMap,
}: FolderItemProps) => {
	const children = allFolders.filter((f) => f.parent_id === folder.id);
	const [isOpen, setIsOpen] = useState(true);

	return (
		<div className="select-none">
			<div
				className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
					selectedFolder === folder.id
						? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
						: "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
				}`}
				style={{ paddingLeft: `${depth * 12 + 12}px` }}
				onClick={() => onSelect(folder.id)}
			>
				<div className="flex items-center overflow-hidden flex-1 min-w-0">
					{/* Toggle Arrow if has children */}
					{children.length > 0 ? (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setIsOpen(!isOpen);
							}}
							className="mr-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 flex-shrink-0"
						>
							{isOpen ? (
								<ChevronDown className="w-3 h-3" />
							) : (
								<ChevronRight className="w-3 h-3" />
							)}
						</button>
					) : (
						<div className="w-4 mr-1 flex-shrink-0" /> // Spacer
					)}

					<Folder
						className={`w-4 h-4 mr-2 flex-shrink-0 ${selectedFolder === folder.id ? "text-primary-500 fill-primary-100" : "text-gray-400"}`}
					/>

					{/* Name and Indicators */}
					<div className="flex items-center space-x-2 overflow-hidden flex-1">
						<span className="truncate">{folder.name}</span>

						{/* Public/Private Badge */}
						{depth === 0 && (
							<div className="flex-shrink-0 flex items-center ml-auto pl-2">
								{folder.is_public ? (
									<span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-bold border border-green-200 dark:border-green-800 flex items-center">
										Public
									</span>
								) : (
									<div className="flex items-center space-x-1">
										<span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold border border-amber-200 dark:border-amber-800">
											Private
										</span>
										{/* Group Dots */}
										{folder.allowed_group_ids &&
											folder.allowed_group_ids.map(
												(gid) => {
													const group =
														groupsMap[gid];
													if (!group) return null;
													return (
														<div
															key={gid}
															className="w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-gray-800"
															style={{
																backgroundColor:
																	group.color ||
																	"#9CA3AF",
															}}
															title={`Acceso: ${group.name}`}
														/>
													);
												},
											)}
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{isAdmin && (
					<div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
						<button
							onClick={(e) => {
								e.stopPropagation();
								onDelete(folder.id);
							}}
							className="p-1 hover:text-red-600 dark:hover:text-red-400"
							title="Eliminar carpeta y contenido"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</div>
				)}
			</div>

			{/* Render Children Recursively */}
			{isOpen && children.length > 0 && (
				<div>
					{children.map((child) => (
						<FolderItem
							key={child.id}
							folder={child}
							allFolders={allFolders}
							selectedFolder={selectedFolder}
							onSelect={onSelect}
							onDelete={onDelete}
							depth={depth + 1}
							isAdmin={isAdmin}
							groupsMap={groupsMap}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export default function Library() {
	const [folders, setFolders] = useState<FolderType[]>([]);
	const [allFolders, setAllFolders] = useState<FolderType[]>([]);
	const [documents, setDocuments] = useState<DocType[]>([]);
	const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
	const [loadingDocs, setLoadingDocs] = useState(false);
	const { isAdmin } = useAuth();
	const { uploadFiles } = useUpload();
	const [searchTerm, setSearchTerm] = useState("");

	// Groups
	const [availableGroups, setAvailableGroups] = useState<GroupType[]>([]);
	const [groupsMap, setGroupsMap] = useState<Record<string, GroupType>>({});

	// Modal State
	const [modalType, setModalType] = useState<"create" | "edit" | null>(null);
	const [folderToEdit, setFolderToEdit] = useState<FolderType | null>(null);

	// Viewer State
	const [viewerState, setViewerState] = useState<{
		isOpen: boolean;
		type: "pdf" | "text" | null;
		url: string;
		filename: string;
	}>({
		isOpen: false,
		type: null,
		url: "",
		filename: "",
	});

	// Pagination State
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);

	const loadDocuments = async () => {
		try {
			const [docsResponse, folderList, groups] = await Promise.all([
				api.getDocuments(
					selectedFolder || undefined,
					!selectedFolder,
					page,
				),
				api.getFolders(),
				api.getGroups().catch(() => []),
			]);

			let docsData: DocType[] = [];
			let pages = 1;

			if (Array.isArray(docsResponse)) {
				docsData = docsResponse;
				setTotalPages(1);
			} else {
				docsData = docsResponse.docs;
				pages = docsResponse.pages;
				setTotalPages(pages);
			}

			// Normalize _id to id
			const normalizedDocs = docsData.map((d: any) => ({
				...d,
				id: d.id || d._id, // Handle both cases
			}));

			setDocuments(normalizedDocs);

			setAllFolders(folderList);
			setFolders(folderList);

			const map: Record<string, GroupType> = {};
			if (groups) {
				// Normalize groups to handle _id if id is missing
				const normalizedGroups = groups.map((g: any) => ({
					...g,
					id: g.id || g._id,
				}));
				normalizedGroups.forEach((g: GroupType) => (map[g.id] = g));
				setGroupsMap(map);
				setAvailableGroups(normalizedGroups);
			}
		} catch (error) {
			console.error("Error loading documents:", error);
		}
	};

	useEffect(() => {
		// Reset page when folder changes, but careful about infinite loops if we include page in dependency.
		// If selectedFolder changes, we want page=1.
		// We can do this by having a separate effect or just setting it in the specific handler.
		// But for now let's just use the effect.
		// Actually, if we add page to dependency, we need to ensure we don't reset it on page change.
		// So we should NOT setPage(1) here if page changed.
		setLoadingDocs(true);
		loadDocuments().finally(() => setLoadingDocs(false));
	}, [selectedFolder, isAdmin, page]);

	// Reset page on folder change
	useEffect(() => {
		setPage(1);
	}, [selectedFolder]);

	useEffect(() => {
		socketService.connect();

		let debounceTimer: ReturnType<typeof setTimeout>;

		const performRefresh = () => {
			console.log(
				"Relevant Socket Update received. Refreshing Library...",
			);
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				loadDocuments();
			}, 1000); // Debounce for 1 second
		};

		// For folder events, we always want to refresh (payload is just the folder data)
		const handleFolderEvent = () => {
			performRefresh();
		};

		// For task updates, we only refresh if completed
		// payload is { doc_id, status, progress, ... }
		const handleTaskEvent = (data: any) => {
			if (data?.status === "completed") {
				performRefresh();
			}
		};

		socketService.on("folder_created", handleFolderEvent);
		socketService.on("folder_updated", handleFolderEvent);
		socketService.on("folder_deleted", handleFolderEvent);
		socketService.on("task_update", handleTaskEvent);

		return () => {
			socketService.off("folder_created", handleFolderEvent);
			socketService.off("folder_updated", handleFolderEvent);
			socketService.off("folder_deleted", handleFolderEvent);
			socketService.off("task_update", handleTaskEvent);
			clearTimeout(debounceTimer);
		};
	}, [selectedFolder]);

	const filteredDocuments = documents.filter((doc) =>
		(doc.filename || "").toLowerCase().includes(searchTerm.toLowerCase()),
	);

	const filteredFolders = allFolders.filter((f) =>
		f.name.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!selectedFolder) {
			alert("Selecciona una carpeta primero");
			e.target.value = "";
			return;
		}
		if (e.target.files && e.target.files.length > 0) {
			const files = Array.from(e.target.files);
			uploadFiles(files, selectedFolder || undefined);
			e.target.value = "";
		}
	};

	const handleFolderUpload = async (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		if (e.target.files && e.target.files.length > 0) {
			const files = Array.from(e.target.files).filter(
				(f) => f.type === "application/pdf" || f.name.endsWith(".pdf"),
			);
			if (files.length === 0) {
				alert("No se encontraron archivos PDF.");
				return;
			}
			uploadFiles(files, selectedFolder || undefined);
			e.target.value = "";
		}
	};

	const handleSaveModal = async (
		name: string,
		isPublic: boolean,
		groups: string[],
	) => {
		try {
			if (modalType === "create") {
				await api.createFolder(
					name,
					selectedFolder || undefined,
					isPublic,
					groups,
				);
			} else if (modalType === "edit" && folderToEdit) {
				// Fix: Correct API call structure
				const updateData = {
					name,
					is_public: isPublic,
					allowed_group_ids: groups,
				};
				console.log("Updating folder with data:", updateData);
				await api.updateFolder(folderToEdit.id, updateData);
			}
			setModalType(null);
			setFolderToEdit(null);
			loadDocuments();
		} catch (err) {
			console.error(err);
			alert("Error al guardar carpeta");
		}
	};

	const handleDeleteFolder = async (id: string) => {
		if (confirm("¿Borrar esta carpeta y todo su contenido?")) {
			try {
				await api.deleteFolder(id);
				if (selectedFolder === id) setSelectedFolder(null);
				loadDocuments();
			} catch (err) {
				alert("Error al borrar carpeta");
			}
		}
	};

	const handleDeleteDoc = async (id: string) => {
		if (confirm("¿Borrar este documento?")) {
			try {
				await api.deleteDocument(id);
				loadDocuments();
			} catch (err) {
				alert("Error al borrar documento");
			}
		}
	};

	const handleEditCurrentFolder = () => {
		if (!selectedFolder) return;
		const folder = folders.find((f) => f.id === selectedFolder);
		if (folder) {
			setFolderToEdit(folder);
			setModalType("edit");
		}
	};

	const openDoc = (doc: DocType) => {
		// Use doc.type if available, otherwise fall back to extension
		// 'email' type should be treated as text
		const isPdf =
			doc.type === "pdf" ||
			(!doc.type &&
				((doc.filename || "").toLowerCase().endsWith(".pdf") ||
					(doc.filename || "").toLowerCase().endsWith(".pdfa")));

		const url = api.getPdfUrl(doc.id);

		setViewerState({
			isOpen: true,
			type: isPdf ? "pdf" : "text",
			url,
			filename: doc.filename,
		});
	};

	const closeViewer = () => {
		setViewerState((prev) => ({ ...prev, isOpen: false }));
	};

	return (
		<div className="flex h-full relative bg-gray-50 dark:bg-gray-900 transition-colors">
			{/* Modal */}
			<FolderModal
				isOpen={!!modalType}
				onClose={() => {
					setModalType(null);
					setFolderToEdit(null);
				}}
				onSave={handleSaveModal}
				title={
					modalType === "create" ? "Nueva Carpeta" : "Editar Carpeta"
				}
				availableGroups={availableGroups}
				showPermissions={
					modalType === "create"
						? !selectedFolder
						: !folderToEdit?.parent_id
				}
				initialName={
					modalType === "create" ? "" : folderToEdit?.name || ""
				}
				initialPublic={
					modalType === "create"
						? selectedFolder
							? folders.find((f) => f.id === selectedFolder)
									?.is_public
							: false
						: (folderToEdit?.is_public ?? true)
				}
				initialGroups={
					modalType === "create"
						? selectedFolder
							? folders.find((f) => f.id === selectedFolder)
									?.allowed_group_ids || []
							: []
						: folderToEdit?.allowed_group_ids || []
				}
			/>

			{/* Sidebar: Folders */}
			<div className="w-96 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-colors">
				<div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
					<h2 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center">
						<Folder className="w-5 h-5 mr-2 text-gray-500" />
						Librería
					</h2>
					{isAdmin && (
						<button
							onClick={() => setModalType("create")}
							className="p-1.5 hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm rounded-md transition-all text-gray-600 dark:text-gray-400"
							title="Nueva Carpeta"
						>
							<FolderPlus className="w-5 h-5" />
						</button>
					)}
				</div>

				<div className="flex-1 overflow-auto p-2 space-y-1">
					<button
						onClick={() => setSelectedFolder(null)}
						className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
							selectedFolder === null
								? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
								: "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
						}`}
					>
						<Layers className="w-4 h-4 mr-3" />
						Todos los Documentos
					</button>

					{filteredFolders
						.filter((f) => !f.parent_id)
						.map((folder) => (
							<FolderItem
								key={folder.id}
								folder={folder}
								allFolders={allFolders}
								selectedFolder={selectedFolder}
								onSelect={setSelectedFolder}
								onDelete={handleDeleteFolder}
								isAdmin={isAdmin}
								groupsMap={groupsMap}
							/>
						))}
				</div>
			</div>

			{/* Main Content: Documents */}
			<div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
				{/* Toolbar */}
				<div className="h-16 px-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between transition-colors">
					<div className="flex items-center min-w-0 pr-4">
						<h1 className="text-xl font-bold text-gray-800 dark:text-white truncate flex items-center">
							{selectedFolder
								? folders.find((f) => f.id === selectedFolder)
										?.name
								: "Todos los Documentos"}

							{selectedFolder && isAdmin && (
								<button
									onClick={handleEditCurrentFolder}
									className="ml-3 p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
									title="Editar Permisos de Carpeta"
								>
									<Pencil className="w-4 h-4" />
								</button>
							)}
						</h1>
						{selectedFolder && (
							<div className="ml-2">
								{(() => {
									const f = folders.find(
										(f) => f.id === selectedFolder,
									);
									return f?.is_public ? (
										<Globe className="w-4 h-4 text-green-400" />
									) : (
										<Lock className="w-4 h-4 text-amber-400" />
									);
								})()}
							</div>
						)}
					</div>

					<div className="flex items-center space-x-3 flex-shrink-0">
						{/* Search Bar */}
						<div className="relative w-48 lg:w-64">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
								<Search className="h-4 w-4 text-gray-400" />
							</div>
							<input
								type="text"
								className="block w-full pl-10 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg leading-5 bg-gray-50 dark:bg-gray-700 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm text-gray-900 dark:text-white transition-colors"
								placeholder="Buscar..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>

						{/* Admin Actions */}
						{isAdmin && (
							<>
								<div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
								<label
									className={`flex items-center space-x-2 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600`}
									title="Subir Carpeta (Solo Admin)"
								>
									<FolderPlus className="w-4 h-4" />
									<span className="font-medium text-sm hidden xl:inline">
										Carpeta
									</span>
									<input
										type="file"
										// @ts-ignore
										webkitdirectory=""
										directory=""
										className="hidden"
										onChange={handleFolderUpload}
										multiple
									/>
								</label>

								<label
									className={`flex items-center space-x-2 px-3 py-2 bg-primary-600 text-white rounded-lg transition-colors ${!selectedFolder ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-primary-700"}`}
									title={
										!selectedFolder
											? "Selecciona una carpeta"
											: "Subir PDF (Solo Admin)"
									}
								>
									<Upload className="w-4 h-4" />
									<span className="font-medium text-sm hidden xl:inline">
										PDF
									</span>
									<input
										type="file"
										disabled={!selectedFolder}
										accept="application/pdf"
										className="hidden"
										onChange={handleUpload}
										multiple
									/>
								</label>
								<label
									className={`flex items-center space-x-2 px-3 py-2 bg-amber-600 text-white rounded-lg transition-colors ${!selectedFolder ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-amber-700"}`}
									title={
										!selectedFolder
											? "Selecciona una carpeta"
											: "Subir PST (Solo Admin)"
									}
								>
									<Mail className="w-4 h-4" />
									<span className="font-medium text-sm hidden xl:inline">
										PST
									</span>
									<input
										type="file"
										disabled={!selectedFolder}
										accept=".pst"
										className="hidden"
										onChange={handleUpload}
										multiple
									/>
								</label>
							</>
						)}
					</div>
				</div>

				{/* Document List */}
				<div className="flex-1 overflow-auto p-6">
					{loadingDocs ? (
						<div className="flex justify-center py-10">
							<Loader2 className="w-8 h-8 animate-spin text-gray-400" />
						</div>
					) : filteredDocuments.length === 0 ? (
						<div className="text-center py-20 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
							<FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
							<p className="text-gray-500 dark:text-gray-400 font-medium">
								{searchTerm
									? "No se encontraron resultados"
									: "No hay documentos"}
							</p>
							{!searchTerm && isAdmin && (
								<p className="text-sm text-gray-400 dark:text-gray-500">
									Sube un PDF para empezar
								</p>
							)}
						</div>
					) : (
						<div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-colors">
							<table className="w-full text-left">
								<thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
									<tr>
										<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
											Nombre
										</th>
										<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
											Fecha
										</th>
										{isAdmin && (
											<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right">
												Acciones
											</th>
										)}
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100 dark:divide-gray-700">
									{filteredDocuments.map((doc) => (
										<tr
											key={doc.id}
											className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
										>
											<td className="px-6 py-4">
												<div className="flex items-center">
													{(() => {
														const isPdf =
															doc.type ===
																"pdf" ||
															(!doc.type &&
																doc.filename
																	.toLowerCase()
																	.endsWith(
																		".pdf",
																	));
														const isEmail =
															doc.type ===
															"email";

														if (isPdf) {
															return (
																<div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg mr-3">
																	<FileText className="w-5 h-5 text-red-500 dark:text-red-400" />
																</div>
															);
														} else if (isEmail) {
															return (
																<div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg mr-3">
																	<Mail className="w-5 h-5 text-blue-500 dark:text-blue-400" />
																</div>
															);
														} else {
															return (
																<div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg mr-3">
																	<FileText className="w-5 h-5 text-gray-500 dark:text-gray-400" />
																</div>
															);
														}
													})()}
													<button
														onClick={() =>
															openDoc(doc)
														}
														className="font-medium text-gray-700 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 text-left"
													>
														{doc.filename}
													</button>
												</div>
											</td>
											<td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
												{new Date(
													doc.upload_date,
												).toLocaleDateString()}
											</td>
											{isAdmin && (
												<td className="px-6 py-4 text-right">
													<div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
														<button
															onClick={() =>
																handleDeleteDoc(
																	doc.id,
																)
															}
															className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-md transition-colors"
															title="Eliminar"
														>
															<Trash2 className="w-4 h-4" />
														</button>
													</div>
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>

				{/* Pagination Controls */}
				{totalPages > 1 && (
					<div className="flex justify-center items-center py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 transition-colors">
						<div className="flex space-x-2">
							<Button
								variant="secondary"
								onClick={() =>
									setPage((p) => Math.max(1, p - 1))
								}
								disabled={page === 1}
							>
								Anterior
							</Button>
							<span className="flex items-center text-sm text-gray-600 dark:text-gray-400 px-2">
								Página {page} de {totalPages}
							</span>
							<Button
								variant="secondary"
								onClick={() =>
									setPage((p) => Math.min(totalPages, p + 1))
								}
								disabled={page === totalPages}
							>
								Siguiente
							</Button>
						</div>
					</div>
				)}
			</div>

			{/* Viewers */}
			<PdfViewerModal
				isOpen={viewerState.isOpen && viewerState.type === "pdf"}
				onClose={closeViewer}
				pdfUrl={viewerState.url}
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
