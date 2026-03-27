import React, {
	createContext,
	useContext,
	useState,
	useCallback,
	useRef,
	useEffect,
} from "react";
import api from "../services/api";
import socketService from "../services/socket";

export interface TaskItem {
	id: string; // Internal Frontend ID
	docId?: string; // Backend Document ID (available after upload)
	type: "upload" | "reprocess";
	name: string;
	file?: File; // Only for upload
	progress: number; // Legacy/Overall (0-100) or just visual helper
	uploadProgress: number; // 0-100
	processingProgress: number; // 0-100
	status:
		| "pending"
		| "uploading"
		| "processing"
		| "completed"
		| "error"
		| "cancelled";
	error?: string;
	message?: string;
	folderId?: string;
}

interface UploadContextType {
	tasks: TaskItem[];
	sessionTotal: number;
	sessionCompleted: number; // Persistent completed count
	isModalOpen: boolean;
	isMinimized: boolean;
	uploadFiles: (files: File[], folderId?: string) => void;
	startReprocessing: () => void;
	cancelTask: (id: string) => void;
	cancelAllTasks: () => void;
	removeTask: (id: string) => void;
	retryTask: (id: string) => void;
	clearCompleted: () => void;
	setIsMinimized: (val: boolean) => void;
	setIsModalOpen: (val: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUpload = () => {
	const context = useContext(UploadContext);
	if (!context) {
		throw new Error("useUpload must be used within an UploadProvider");
	}
	return context;
};

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [tasks, setTasks] = useState<TaskItem[]>([]);
	const [sessionTotal, setSessionTotal] = useState(0);
	const [sessionCompleted, setSessionCompleted] = useState(0);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isMinimized, setIsMinimized] = useState(false);

	const activeUploadsCount = useRef(0);
	const MAX_CONCURRENCY = parseInt(
		import.meta.env.VITE_MAX_CONCURRENCY || "16",
	);
	const controllers = useRef<Record<string, AbortController>>({});

	// Initialize WebSocket
	useEffect(() => {
		socketService.connect();

		const handleTaskUpdate = (payload: any) => {
			// payload: { doc_id, status, progress, message }

			setTasks((prev) => {
				// ...
				// 1. Check for Reprocess Task (Global)
				// const reprocessTask = prev.find((t) => t.type === "reprocess"); // Removed unused var
				// Handling reprocess updates (assuming payload has doc_id or specific marker for global tasks?)
				// In our reprocessLibrary backend, we iterate all docs.
				// We might want to keep that logic seperate or unified.
				// For now, let's focus on Per-Doc updates.

				return prev.map((t) => {
					// Match by docId (for regular uploads)
					if (t.docId === payload.doc_id) {
						if (payload.status === "completed") {
							// Schedule auto-removal after 2 seconds
							setTimeout(() => {
								setTasks((current) =>
									current.filter((task) => task.id !== t.id),
								);
							}, 2000);

							if (t.status !== "completed") {
								setSessionCompleted((sc: number) => sc + 1);
							}

							return {
								...t,
								status: "completed",
								processingProgress: 100,
								progress: 100,
								message: payload.message || "Completado",
							};
						} else if (payload.status === "error") {
							return {
								...t,
								status: "error",
								error: payload.message || "Error",
								message: payload.message,
							};
						} else {
							// Running/Processing
							const pProg = payload.progress || 0;
							return {
								...t,
								status: "processing",
								processingProgress: pProg,
								progress: 50 + pProg * 0.5,
								message: payload.message,
							};
						}
					}
					// PST Parent Job Match (using docId as job_id here?)
					// In tasks.py: publish_progress(p_job_id, ...)
					// The frontend task ID for PST is what we generated.
					// But we only have 'docId' (temp_id) on the task after upload.
					// So t.docId should match p_job_id.
					if (
						t.docId === payload.doc_id &&
						t.file?.name.endsWith(".pst")
					) {
						// Special handling for PST parent job updates
						if (payload.status === "completed") {
							setTimeout(() => {
								setTasks((current) =>
									current.filter((task) => task.id !== t.id),
								);
							}, 2000);

							return {
								...t,
								status: "completed",
								progress: 100,
								processingProgress: 100,
								message: payload.message,
							};
						}
					}

					// Legacy Reprocess Logic (if payload missing doc_id or specific match)
					if (t.type === "reprocess" && !payload.doc_id) {
						// ... existing reprocess logic ...
						// Keeping it simple for now as we focused on Separating Progress Bars for Uploads
						if (payload.status === "completed") {
							// Auto remove reprocess task too?
							setTimeout(() => {
								setTasks((current) =>
									current.filter((task) => task.id !== t.id),
								);
							}, 2000);

							return {
								...t,
								status: "completed",
								processingProgress: 100,
								progress: 100,
								name: "Reprocesamiento Completado",
							};
						} else if (payload.status === "error") {
							return {
								...t,
								status: "error",
								error: payload.error || "Error",
							};
						} else {
							const prog =
								payload.total > 0
									? (payload.processed / payload.total) * 100
									: 0;
							return {
								...t,
								status: "processing",
								processingProgress: prog,
								progress: prog, // Reprocess is just processing, so 100% processing
								name: `Reprocesando: ${payload.processed}/${payload.total}`,
							};
						}
					}
					return t;
				});
			});
		};

		socketService.on("task_update", handleTaskUpdate);

		return () => {
			socketService.off("task_update", handleTaskUpdate);
		};
	}, []);

	// Queue Processor for UPLOADS
	const processQueue = useCallback(() => {
		setTasks((prevTasks) => {
			const uploadingCount = prevTasks.filter(
				(t) => t.type === "upload" && t.status === "uploading",
			).length;
			activeUploadsCount.current = uploadingCount;

			if (uploadingCount >= MAX_CONCURRENCY) return prevTasks;

			const pendingUploads = prevTasks.filter(
				(t) => t.type === "upload" && t.status === "pending",
			);
			if (pendingUploads.length === 0) return prevTasks;

			const slots = MAX_CONCURRENCY - uploadingCount;
			const toStart = pendingUploads.slice(0, slots);

			if (toStart.length === 0) return prevTasks;

			const newTasks = [...prevTasks];
			toStart.forEach((candidate) => {
				const index = newTasks.findIndex((t) => t.id === candidate.id);
				if (index !== -1) {
					newTasks[index] = {
						...newTasks[index],
						status: "uploading",
					};
				}
			});
			return newTasks;
		});
	}, []);

	const startingUploads = useRef<Set<string>>(new Set());

	// Trigger uploads
	useEffect(() => {
		tasks.forEach((task) => {
			if (
				task.type === "upload" &&
				task.status === "uploading" &&
				!controllers.current[task.id] &&
				!startingUploads.current.has(task.id)
			) {
				startUpload(task);
			}
		});
	}, [tasks]);

	const startUpload = async (task: TaskItem) => {
		if (!task.file) return;
		if (startingUploads.current.has(task.id)) return;

		startingUploads.current.add(task.id);
		console.log("[UploadContext] Starting upload for:", task.id);

		const controller = new AbortController();
		controllers.current[task.id] = controller;

		try {
			let result: any;
			const onUploadProgress = (percent: number) => {
				setTasks((prev) =>
					prev.map((t) =>
						t.id === task.id
							? {
									...t,
									uploadProgress: percent,
									// Map Upload 0-100 to Overall 0-50
									progress: percent * 0.5,
								}
							: t,
					),
				);
			};

			if (task.file.name.toLowerCase().endsWith(".pst")) {
				result = await api.uploadPst(
					task.file,
					task.folderId,
					onUploadProgress,
					controller.signal,
				);
			} else {
				result = await api.uploadDocument(
					task.file,
					task.folderId,
					onUploadProgress,
					controller.signal,
				);
			}

			// Upload Complete. Now we have docId/tempId.
			// Switch to Processing State.
			const docId = result._id || result.temp_id || result.id;

			setTasks((prev) =>
				prev.map((t) =>
					t.id === task.id
						? {
								...t,
								status: "processing",
								uploadProgress: 100,
								docId: docId,
								processingProgress: 0,
								progress: 50, // Started processing
							}
						: t,
				),
			);
		} catch (err: any) {
			if (err.name === "CanceledError") {
				setTasks((prev) =>
					prev.map((t) =>
						t.id === task.id ? { ...t, status: "cancelled" } : t,
					),
				);
			} else {
				setTasks((prev) =>
					prev.map((t) =>
						t.id === task.id
							? {
									...t,
									status: "error",
									error: err.message || "Error desconocido",
								}
							: t,
					),
				);
			}
		} finally {
			delete controllers.current[task.id];
			setTimeout(processQueue, 0);
		}
	};

	// Generic Polling for Reprocess -> NOW VIA WEBSOCKET
	const startReprocessing = useCallback(async () => {
		const id = "reprocess-global";

		setTasks((prev) => {
			if (prev.find((t) => t.id === id)) return prev;
			return [
				...prev,
				{
					id,
					type: "reprocess",
					name: "Iniciando reprocesamiento...",
					progress: 0,
					uploadProgress: 100,
					processingProgress: 0,
					status: "processing",
				},
			];
		});

		setIsModalOpen(true);
		setIsMinimized(false);

		try {
			await api.reprocessLibrary();
		} catch (err: any) {
			setTasks((prev) =>
				prev.map((t) =>
					t.id === id
						? { ...t, status: "error", error: "No se pudo iniciar" }
						: t,
				),
			);
		}
	}, []);

	useEffect(() => {
		processQueue();
	}, [tasks.length, processQueue]);

	useEffect(() => {
		const uploading = tasks.filter(
			(t) => t.type === "upload" && t.status === "uploading",
		).length;
		const pending = tasks.filter(
			(t) => t.type === "upload" && t.status === "pending",
		).length;

		if (uploading < MAX_CONCURRENCY && pending > 0) {
			processQueue();
		}
	}, [tasks, processQueue]);

	// Track files currently being processed in uploadFiles (async guard)
	const filesBeingAdded = useRef<Set<string>>(new Set());

	const uploadFiles = useCallback(
		async (newFiles: File[], currentFolderId?: string) => {
			// Filter out files that are already being processed in this exact batch context
			// Validation 1: Sync check against "in-flight" additions
			const uniqueFiles: File[] = [];
			for (const f of newFiles) {
				const key = `${f.name}-${currentFolderId || "root"}`;
				if (!filesBeingAdded.current.has(key)) {
					filesBeingAdded.current.add(key);
					uniqueFiles.push(f);
				} else {
					console.warn(
						"[Upload] Skipped double-invocation file:",
						f.name,
					);
				}
			}

			if (uniqueFiles.length === 0) return;

			setIsModalOpen(true);
			setIsMinimized(false);

			let existingFolders = await api.getFolders();

			// ... (rest of logic)

			const findFolder = (name: string, parentId?: string) => {
				return existingFolders.find(
					(f) =>
						f.name === name &&
						f.parent_id === (parentId || undefined),
				);
			};

			const createdFoldersCache: Record<string, string> = {};

			const resolveFolderId = async (
				relativePath: string,
				rootId?: string,
			): Promise<string | undefined> => {
				if (!relativePath) return rootId;

				const parts = relativePath.split("/");
				parts.pop();

				if (parts.length === 0) return rootId;

				let currentParentId = rootId;

				for (const part of parts) {
					const cacheKey = `${currentParentId || "root"}|${part}`;

					if (createdFoldersCache[cacheKey]) {
						currentParentId = createdFoldersCache[cacheKey];
						continue;
					}

					let folder = findFolder(part, currentParentId);

					if (!folder) {
						try {
							const newFolder = await api.createFolder(
								part,
								currentParentId,
							);
							folder = newFolder;
							existingFolders.push(newFolder);
							// Track for session cleanup
							sessionCreatedFolders.current.add(newFolder.id);
						} catch (e) {
							console.error(`Error creating folder ${part}`, e);
							return currentParentId;
						}
					}

					if (folder) {
						const f: any = folder;
						const fid = f.id || f._id;
						currentParentId = fid;
						createdFoldersCache[cacheKey] = fid;
					}
				}

				return currentParentId;
			};

			const newTasks: TaskItem[] = [];

			for (const f of newFiles) {
				let targetId = currentFolderId;
				if (f.webkitRelativePath) {
					targetId = await resolveFolderId(
						f.webkitRelativePath,
						currentFolderId,
					);
				}

				newTasks.push({
					id: Math.random().toString(36).substring(2, 9) + Date.now(),
					type: "upload",
					name: f.name,
					file: f,
					progress: 0,
					uploadProgress: 0,
					processingProgress: 0,
					status: "pending",
					folderId: targetId,
				});
			}

			setTasks((prev) => {
				const uniqueNewTasks: TaskItem[] = [];
				for (const newTask of newTasks) {
					const isDuplicate = prev.some(
						(existing) =>
							existing.name === newTask.name &&
							existing.folderId === newTask.folderId &&
							(existing.status === "pending" ||
								existing.status === "uploading" ||
								existing.status === "processing"),
					);
					if (!isDuplicate) {
						uniqueNewTasks.push(newTask);
					} else {
						console.warn(
							"[Upload] Skipped duplicate task:",
							newTask.name,
						);
					}
				}
				if (uniqueNewTasks.length > 0) {
					setSessionTotal((s) => s + uniqueNewTasks.length);
				}
				return [...prev, ...uniqueNewTasks];
			});

			// Cleanup Sync Guard (allow retries later)
			// We delay slightly to ensure the current event loop clears
			setTimeout(() => {
				for (const f of uniqueFiles) {
					const key = `${f.name}-${currentFolderId || "root"}`;
					filesBeingAdded.current.delete(key);
				}
			}, 1000);
		},
		[],
	);

	const cancelTask = useCallback(
		async (id: string) => {
			const task = tasks.find((t) => t.id === id);
			let docIdToDelete: string | undefined;

			if (task) {
				if (task.type === "reprocess") {
					api.cancelTask().catch(console.error);
				}
				if (task.docId) {
					docIdToDelete = task.docId;
				}
			}

			if (controllers.current[id]) {
				controllers.current[id].abort();
			}

			// Update state to MARK as cancelled (do not remove)
			setTasks((prev) =>
				prev.map((t) =>
					t.id === id ? { ...t, status: "cancelled" } : t,
				),
			);

			// Cleanup backend if docId exists
			if (docIdToDelete) {
				try {
					await api.deleteDocument(docIdToDelete);
					console.log(
						"[Cancel] Deleted document from backend:",
						docIdToDelete,
					);
				} catch (e) {
					console.error("[Cancel] Failed to delete document:", e);
				}
			}
		},
		[tasks],
	);

	const removeTask = useCallback((id: string) => {
		setTasks((prev) => prev.filter((t) => t.id !== id));
	}, []);

	// Track folders created during this session to cleanup on "Cancel All"
	const sessionCreatedFolders = useRef<Set<string>>(new Set());

	const cancelAllTasks = useCallback(async () => {
		// 1. Abort controllers
		Object.values(controllers.current).forEach((controller) => {
			controller.abort();
		});

		// 2. Cancel reprocess if active
		const hasReprocess = tasks.some(
			(t) =>
				t.type === "reprocess" &&
				(t.status === "processing" || t.status === "pending"),
		);
		if (hasReprocess) {
			api.cancelTask().catch(console.error);
		}

		// 3. Mark active tasks as cancelled
		setTasks((prev) =>
			prev.map((t) => {
				const isActive =
					t.status === "uploading" ||
					t.status === "pending" ||
					t.status === "processing";
				if (isActive) {
					return { ...t, status: "cancelled" };
				}
				return t;
			}),
		);

		// Loop through tasks to trigger backend cleanup for those with docId
		// We do this optimistically.
		tasks.forEach(async (t) => {
			const isActive =
				t.status === "uploading" ||
				t.status === "pending" ||
				t.status === "processing";
			if (isActive && t.docId) {
				try {
					await api.deleteDocument(t.docId);
				} catch (e) {
					console.error("[Cancel All] Failed to delete document:", e);
				}
			}
		});

		// 4. Cleanup Created Folders (Recursive Delete in Backend)
		// WARNING: Only delete folders if they do NOT contain completed tasks.
		// Since we don't easily track which folder has completed tasks vs cancelled,
		// and the backend deleteFolder is likely recursive, this is risky.
		// For now, to satisfy "don't delete previous tasks", we will SKIP folder deletion
		// if there are any completed tasks in the session?
		// Better approach: User explicitly asked "se me borra la tarea anterior".
		// This likely refers to the frontend list item being removed or invalid.
		// If "Cancel All" just marks them cancelled, we are good.
		// But if we delete the folder, the completed file in backend is gone.
		// Let's comment out folder deletion to be safe, or make it smarter.
		// Given the user constraint, I will disable the aggressive folder cleanup for now.

		/*
		if (sessionCreatedFolders.current.size > 0) {
			const foldersToDelete = Array.from(sessionCreatedFolders.current);
			console.log("[Cancel All] Cleaning up folders:", foldersToDelete);
			for (const folderId of foldersToDelete) {
				try {
					await api.deleteFolder(folderId);
				} catch (e) {
					console.error(
						`[Cancel All] Failed to delete folder ${folderId}`,
						e,
					);
				}
			}
			sessionCreatedFolders.current.clear();
		}
		*/
	}, [tasks]);

	const retryTask = useCallback((id: string) => {
		startingUploads.current.delete(id);
		setTasks((prev) => {
			return prev.map((t) =>
				t.id === id
					? {
							...t,
							status:
								t.type === "reprocess"
									? "processing"
									: "pending",
							progress: 0,
							uploadProgress: 0,
							processingProgress: 0,
							error: undefined,
						}
					: t,
			);
		});
	}, []);

	const clearCompleted = useCallback(() => {
		setTasks((prev) => {
			const kept = prev.filter(
				(t) => t.status !== "completed" && t.status !== "cancelled",
			);
			// Cleanup refs for removed tasks to avoid memory leaks
			const keptIds = new Set(kept.map((t) => t.id));
			for (const id of startingUploads.current) {
				if (!keptIds.has(id)) {
					startingUploads.current.delete(id);
				}
			}

			if (kept.length === 0) {
				setSessionTotal(0);
			}

			return kept;
		});
	}, []);

	return (
		<UploadContext.Provider
			value={{
				tasks,
				sessionTotal,
				sessionCompleted,
				isModalOpen,
				isMinimized,
				uploadFiles,
				startReprocessing,
				cancelTask,
				removeTask,
				cancelAllTasks,
				retryTask,
				clearCompleted,
				setIsMinimized,
				setIsModalOpen,
			}}
		>
			{children}
		</UploadContext.Provider>
	);
};
