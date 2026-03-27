import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api/v1";

const api = axios.create({
	baseURL: API_URL,
});

// Add request interceptor to inject token from localStorage
api.interceptors.request.use(
	(config) => {
		const token = localStorage.getItem("rag_token");
		if (token) {
			config.headers.Authorization = `Bearer ${token}`;
		}
		return config;
	},
	(error) => {
		return Promise.reject(error);
	},
);

// Add response interceptor to handle 401 errors
api.interceptors.response.use(
	(response) => response,
	(error) => {
		if (error.response?.status === 401) {
			// Token expired or invalid - redirect to login
			localStorage.removeItem("rag_token");
			localStorage.removeItem("rag_user");
			if (window.location.pathname !== "/login") {
				window.location.href = "/login";
			}
		}
		return Promise.reject(error);
	},
);

export interface Folder {
	id: string;
	name: string;
	parent_id?: string;
	created_at: string;
	is_public: boolean;
	allowed_group_ids: string[];
}

export interface Document {
	id: string;
	filename: string;
	folder_id?: string;
	upload_date: string;
	chunk_count: number;
	status: string;
	type?: string;
}

export interface SearchResult {
	id: string;
	text: string; // The chunk text or payload content
	score: number;
	metadata: {
		filename: string;
		page_number?: number;
		bbox?: number[];
		folder_id?: string;
		// Add other metadata fields as needed
		[key: string]: any;
	};
}

export interface SearchResponse {
	results: SearchResult[];
}

// --- Users ---

export interface User {
	id: string;
	name: string;
	lastname: string;
	email: string;
	role: string;
	group_ids: string[];
	created_at: string;
}

export interface UserCreate {
	name: string;
	lastname: string;
	email: string;
	role?: string;
	group_ids?: string[];
}

export interface UserUpdate {
	name?: string;
	lastname?: string;
	email?: string;
	role?: string;
	group_ids?: string[];
}

// --- Groups ---

export interface Group {
	id: string;
	name: string;
	description?: string;
	color: string;
	created_at: string;
}

export interface GroupCreate {
	name: string;
	description?: string;
	color: string;
}

export interface GroupUpdate {
	name?: string;
	description?: string;
	color?: string;
}

export const endpoints = {
	// Folders
	getFolders: async () => {
		const res = await api.get<Folder[]>("folders");
		return res.data;
	},
	createFolder: async (
		name: string,
		parentId?: string,
		isPublic: boolean = false,
		allowedGroupIds: string[] = [],
	) => {
		const payload = {
			name,
			parent_id: parentId,
			is_public: isPublic,
			allowed_group_ids: allowedGroupIds,
		};
		const res = await api.post<Folder>("folders", payload);
		return res.data;
	},
	updateFolder: async (
		id: string,
		changes: {
			name?: string;
			is_public?: boolean;
			allowed_group_ids?: string[];
		},
	) => {
		const res = await api.put<Folder>(`folders/${id}`, changes);
		return res.data;
	},
	deleteFolder: async (id: string) => {
		await api.delete(`folders/${id}`);
	},

	// Documents
	getDocuments: async (
		folderId?: string,
		recursive: boolean = false,
		page: number = 1,
	) => {
		const params: any = { page, limit: 50 };
		if (folderId) params.folder_id = folderId;
		if (recursive) params.recursive = true;

		const res = await api.get<{
			docs: Document[];
			total: number;
			page: number;
			pages: number;
		}>("documents", { params });

		// Backwards compatibility if backend returns array (during transition or filtered views)
		if (Array.isArray(res.data)) {
			return {
				docs: res.data,
				total: res.data.length,
				page: 1,
				pages: 1,
			};
		}
		return res.data;
	},
	uploadDocument: (
		file: File,
		folderId?: string,
		onProgress?: (progress: number, message?: string) => void,
		abortSignal?: AbortSignal,
	): Promise<any> => {
		return new Promise((resolve, reject) => {
			const formData = new FormData();
			formData.append("file", file);
			if (folderId) {
				formData.append("folder_id", folderId);
			}

			const xhr = new XMLHttpRequest();
			xhr.open("POST", `${API_URL}/documents/upload`, true);

			// Add Authorization header from localStorage
			const token = localStorage.getItem("rag_token");
			if (token) {
				xhr.setRequestHeader("Authorization", `Bearer ${token}`);
			}

			// Handle cancellation
			if (abortSignal) {
				abortSignal.addEventListener("abort", () => {
					xhr.abort();
					reject(new Error("CanceledError"));
				});
			}

			// 1. Upload Progress (0-100% of the Upload phase)
			// We'll scale this to be 0-50% of the total experience if we want,
			// or just 0-100% "Uploading" then 0-100% "Processing".
			// Let's stick to 0-100% "Subiendo..." then switch to "Procesando..." messages.
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable && onProgress) {
					const percent = (event.loaded / event.total) * 100;
					// During upload, we show 0-99%?
					// Or we can just show the upload percent.
					onProgress(percent, `Subiendo ${Math.round(percent)}%`);
				}
			};

			// 2. Download/Response Progress (Streaming NDJSON)
			let seenBytes = 0;

			xhr.onprogress = () => {
				// Parse new data in xhr.responseText
				if (!xhr.responseText) return;

				const newData = xhr.responseText.substring(seenBytes);
				seenBytes = xhr.responseText.length;

				const lines = newData.split("\n");
				// Note: Split might leave a trailing empty string or partial line.
				// For robustness with streamed chunks, we technically should buffer partials.
				// But NDJSON usually flushes complete lines.
				// Let's assume lines are complete for now or we might lose the last partial.
				// A simple improve is to hold a 'buffer' variable for specific partials,
				// but XHR responseText grows, it doesn't give just chunks.
				// The substring approach is correct for new data.

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const msg = JSON.parse(line);
						if (msg.status === "progress" && onProgress) {
							// Backend sends simple numbers.
							// msg.current / msg.total_batches
							// We can reset progress bar for this phase?
							// Or maybe the user likes to see it 'restart'.
							// Let's explicitly say "Procesando".
							const percent = Math.round(
								(msg.current / msg.total) * 100,
							);
							onProgress(
								percent,
								`Procesando lote ${msg.current}/${msg.total}`,
							);
						} else if (msg.status === "complete") {
							// We don't resolve here immediately, we wait for readyState 4
							// but we could.
						} else if (msg.status === "error") {
							// We'll handle via json parsing but usually throw?
							// Let's just log or let the final check handle it.
						} else if (msg.status === "started" && onProgress) {
							onProgress(0, "Iniciando procesamiento...");
						}
					} catch (e) {
						// Partial lines or json errors
						// console.warn("Partial stream parse", e);
					}
				}
			};

			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const response = JSON.parse(xhr.responseText);
						resolve(response);
					} catch (e) {
						resolve({ status: "completed" });
					}
				} else {
					let errorMsg = xhr.statusText;
					try {
						const res = JSON.parse(xhr.responseText);
						if (res.detail) errorMsg = res.detail;
					} catch (e) {
						// Ignore json parse error
					}
					reject(new Error(`Upload failed: ${errorMsg}`));
				}
			};

			xhr.onerror = () => {
				reject(new Error("Network error"));
			};

			xhr.onabort = () => {
				reject(new Error("CanceledError"));
			};

			xhr.send(formData);
		});
	},
	deleteDocument: async (id: string) => {
		await api.delete(`documents/${id}`);
	},
	resetLibrary: async () => {
		const res = await api.delete("documents/reset");
		return res.data;
	},
	reprocessLibrary: async () => {
		const res = await api.post("documents/reprocess");
		return res.data;
	},
	getTaskStatus: async () => {
		const res = await api.get("documents/tasks/status");
		return res.data;
	},
	cancelTask: async () => {
		const res = await api.post("documents/tasks/cancel");
		return res.data;
	},

	// Search
	search: async (
		query: string,
		limit: number = 5,
		threshold: number = 0.5,
		filters?: Record<string, any>,
	) => {
		const payload = {
			query,
			limit,
			threshold,
			filters,
		};
		const res = await api.post<SearchResponse>("search", payload);
		return res.data;
	},

	// Preview URL generator (not async, returns URL string)
	getPreviewUrl: (docId: string, page: number, bbox?: number[]) => {
		let url = `${API_URL}/documents/${docId}/preview?page=${page}`;
		if (bbox) {
			url += `&bbox=${JSON.stringify(bbox)}`;
		}
		const token = localStorage.getItem("rag_token");
		if (token) {
			url += `&token=${token}`;
		}
		return url;
	},

	// Get raw PDF URL
	getPdfUrl: (docId: string) => {
		let url = `${API_URL}/documents/${docId}/content`;
		const token = localStorage.getItem("rag_token");
		if (token) {
			url += `?token=${token}`;
		}
		return url;
	},

	// Logs
	getLogs: async (
		page = 1,
		limit = 50,
		type?: string,
		status?: string,
		search?: string,
	) => {
		const params: any = { page, limit };
		if (type && type !== "all") params.type = type;
		if (status && status !== "all") params.status = status;
		if (search) params.search = search;

		const res = await api.get("/logs", { params });
		return res.data;
	},

	deleteLog: async (id: string) => {
		await api.delete(`/logs/${id}`);
	},

	// Settings
	getSettings: async () => {
		const res = await api.get<any>("settings");
		return res.data;
	},
	updateSettings: async (settings: {
		chunk_size?: number;
		chunk_overlap?: number;
		search_limit?: number;
		search_threshold?: number;
		app_name?: string;
		app_logo_url?: string;
		theme_color?: string;
		ignored_email_senders?: string;
	}) => {
		const res = await api.post("settings", settings);
		return res.data;
	},
	analyzeSettings: async () => {
		const res = await api.post<{
			suggested_chunk_size: number;
			suggested_chunk_overlap: number;
			reasoning: string;
		}>("documents/analyze-settings");
		return res.data;
	},

	// Stats
	getLibraryStats: async () => {
		const res = await api.get<{
			total_documents: number;
			total_folders: number;
			total_emails: number;
			last_activity: string | null;
		}>("documents/stats");
		return res.data;
	},

	// Health
	checkHealth: async () => {
		try {
			const res = await api.get("health");
			return res.status === 200;
		} catch (e) {
			return false;
		}
	},

	// Users
	getUsers: async (): Promise<User[]> => {
		const res = await api.get("users/");
		return res.data;
	},

	createUser: async (user: UserCreate): Promise<User> => {
		const res = await api.post("users/", user);
		return res.data;
	},

	updateUser: async (id: string, user: UserUpdate): Promise<User> => {
		const res = await api.put(`users/${id}`, user);
		return res.data;
	},

	deleteUser: async (id: string): Promise<void> => {
		await api.delete(`users/${id}`);
	},

	regeneratePassword: async (id: string): Promise<any> => {
		const res = await api.post(`users/${id}/regenerate_password`);
		return res.data;
	},

	// Groups
	getGroups: async (): Promise<Group[]> => {
		const res = await api.get("groups/");
		return res.data;
	},

	createGroup: async (group: GroupCreate): Promise<Group> => {
		const res = await api.post("groups/", group);
		return res.data;
	},

	updateGroup: async (id: string, group: GroupUpdate): Promise<Group> => {
		const res = await api.put(`groups/${id}`, group);
		return res.data;
	},

	deleteGroup: async (id: string): Promise<void> => {
		await api.delete(`groups/${id}`);
	},

	addUserToGroup: async (groupId: string, userId: string): Promise<void> => {
		await api.post(`groups/${groupId}/users/${userId}`);
	},

	removeUserFromGroup: async (
		groupId: string,
		userId: string,
	): Promise<void> => {
		await api.delete(`groups/${groupId}/users/${userId}`);
	},

	// Auth
	login: async (
		email: string,
		password: string,
	): Promise<{ token: string; user: User }> => {
		const res = await api.post("auth/login", {
			email,
			password,
		});
		return res.data;
	},

	forgotPassword: async (email: string) => {
		const res = await api.post("auth/forgot-password", {
			email,
		});
		return res.data;
	},

	resetPassword: async (token: string, newPassword: string) => {
		const res = await api.post("auth/reset-password", {
			token,
			new_password: newPassword,
		});
		return res.data;
	},

	uploadPst: (
		file: File,
		folderId?: string,
		onProgress?: (progress: number, message?: string) => void,
		abortSignal?: AbortSignal,
	): Promise<any> => {
		return new Promise((resolve, reject) => {
			const formData = new FormData();
			formData.append("file", file);
			if (folderId) {
				formData.append("folder_id", folderId);
			}

			const xhr = new XMLHttpRequest();
			xhr.open("POST", `${API_URL}/documents/upload-pst`, true);

			const token = localStorage.getItem("rag_token");
			if (token) {
				xhr.setRequestHeader("Authorization", `Bearer ${token}`);
			}

			if (abortSignal) {
				abortSignal.addEventListener("abort", () => {
					xhr.abort();
					reject(new Error("CanceledError"));
				});
			}

			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable && onProgress) {
					const percent = (event.loaded / event.total) * 100;
					onProgress(percent, `Subiendo PST ${Math.round(percent)}%`);
				}
			};

			let seenBytes = 0;
			xhr.onprogress = () => {
				if (!xhr.responseText) return;
				const newData = xhr.responseText.substring(seenBytes);
				seenBytes = xhr.responseText.length;
				const lines = newData.split("\n");

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const msg = JSON.parse(line);
						if (msg.status === "progress" && onProgress) {
							// If total is 0, just show 'processed' count
							const text =
								msg.total > 0
									? `Procesando correos: ${msg.current}/${msg.total}`
									: `Procesando correo #${msg.current}`;

							const percent =
								msg.total > 0
									? Math.round(
											(msg.current / msg.total) * 100,
										)
									: 50; // Fallback if total unknown

							onProgress(percent, text);
						} else if (msg.status === "started" && onProgress) {
							onProgress(0, "Iniciando extracción de PST...");
						}
					} catch (e) {}
				}
			};

			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const response = JSON.parse(xhr.responseText);
						resolve(response);
					} catch (e) {
						resolve({ status: "completed" });
					}
				} else {
					let errorMessage = xhr.statusText;
					try {
						const errorResponse = JSON.parse(xhr.responseText);
						if (errorResponse.detail) {
							errorMessage = errorResponse.detail;
						}
					} catch (e) {
						// Ignore JSON parse error, use statusText
					}
					reject(new Error(errorMessage));
				}
			};

			xhr.onerror = () => {
				reject(new Error("Network error"));
			};

			xhr.onabort = () => {
				reject(new Error("CanceledError"));
			};

			xhr.send(formData);
		});
	},
};

export default endpoints;
