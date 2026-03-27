import { useState, useEffect } from "react";
import {
	Save,
	Sliders,
	Database,
	Search as SearchIcon,
	FileText,
	HardDrive,
	Clock,
	LayoutDashboard,
	Mail,
} from "lucide-react";
import endpoints from "../services/api";
import { useSettings } from "../context/SettingsContext"; // Import hook
import { useUpload } from "../context/UploadContext";
import Button from "../components/ui/Button";

export default function Administration() {
	const { refreshSettings } = useSettings(); // Use hook
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	// Stats State
	const [stats, setStats] = useState({
		totalDocs: 0,
		totalEmails: 0,
		totalFolders: 0,
		recentUpload: null as string | null,
	});

	const [settings, setSettings] = useState<{
		chunk_size: number;
		chunk_overlap: number;
		pst_chunk_size: number;
		pst_chunk_overlap: number;
		search_limit: number;
		search_threshold: number;
		app_name?: string;
		app_logo_url?: string;
		theme_color?: string;
		max_file_size_mb?: number;
		jwt_expires_in?: string;
		// Email Settings
		smtp_host?: string;
		smtp_port?: string;
		smtp_user?: string;
		smtp_password?: string;
		smtp_secure?: string; // "true" or "false"
		email_from?: string;
		imap_host?: string;
		imap_port?: string;
		imap_user?: string;
		imap_password?: string;
		frontend_url?: string;
		ignored_email_senders?: string;
	}>({
		chunk_size: 800,
		chunk_overlap: 150,
		pst_chunk_size: 800,
		pst_chunk_overlap: 150,
		search_limit: 10,
		search_threshold: 0.3,
		app_name: "",
		app_logo_url: "",
		theme_color: "",
		max_file_size_mb: 50,
		jwt_expires_in: "1d",
		ignored_email_senders: "",
	});

	useEffect(() => {
		fetchSettings();
		loadStats();
	}, []);

	const loadStats = async () => {
		try {
			const statsData = await endpoints.getLibraryStats();

			setStats({
				totalDocs: statsData.total_documents,
				totalEmails: statsData.total_emails,
				totalFolders: statsData.total_folders,
				recentUpload: statsData.last_activity,
			});
		} catch (e) {
			console.error("Failed to load stats", e);
		}
	};

	const fetchSettings = async () => {
		try {
			const data = await endpoints.getSettings();
			// Merge with defaults/existing to avoid undefined
			setSettings((prev) => ({ ...prev, ...data }));
		} catch (error) {
			console.error("Failed to load settings:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (key: string, value: number | string) => {
		// @ts-ignore
		setSettings((prev) => ({ ...prev, [key]: value }));
	};

	// Handle save
	const handleSave = async () => {
		setSaving(true);
		try {
			await endpoints.updateSettings(settings);
			// Refresh global context
			await refreshSettings();
			setSaved(true);
			setTimeout(() => {
				setSaved(false);
			}, 3000);
		} catch (error) {
			console.error("Failed to save settings:", error);
			alert("Error al guardar configuración");
		} finally {
			setSaving(false);
		}
	};

	if (loading)
		return (
			<div className="p-8 text-gray-500 dark:text-gray-400">
				Cargando administración...
			</div>
		);

	return (
		<div className="p-6 max-w-5xl mx-auto h-full bg-gray-50 dark:bg-gray-900 transition-colors">
			<h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 flex items-center">
				<LayoutDashboard className="w-8 h-8 mr-3 text-primary-600 dark:text-primary-400" />
				Administración
			</h1>

			{/* Stats Grid */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
				<div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center space-x-4">
					<div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
						<FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
							Documentos
						</p>
						<h3 className="text-2xl font-bold text-gray-900 dark:text-white">
							{stats.totalDocs}
						</h3>
					</div>
				</div>

				<div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center space-x-4">
					<div className="p-3 bg-orange-50 dark:bg-orange-900/30 rounded-xl">
						<Mail className="w-8 h-8 text-orange-600 dark:text-orange-400" />
					</div>
					<div>
						<p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
							Correos
						</p>
						<h3 className="text-2xl font-bold text-gray-900 dark:text-white">
							{stats.totalEmails}
						</h3>
					</div>
				</div>

				<div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center space-x-4">
					<div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
						<HardDrive className="w-8 h-8 text-purple-600 dark:text-purple-400" />
					</div>
					<div>
						<p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
							Carpetas
						</p>
						<h3 className="text-2xl font-bold text-gray-900 dark:text-white">
							{stats.totalFolders}
						</h3>
					</div>
				</div>

				<div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center space-x-4">
					<div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl">
						<Clock className="w-8 h-8 text-green-600 dark:text-green-400" />
					</div>
					<div>
						<p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
							Última Actividad
						</p>
						<h3 className="text-sm font-semibold text-gray-900 dark:text-white">
							{stats.recentUpload
								? new Date(
										stats.recentUpload,
									).toLocaleDateString("es-ES", {
										day: "numeric",
										month: "long",
										year: "numeric",
									})
								: "N/A"}
						</h3>
					</div>
				</div>
			</div>

			<div className="space-y-6">
				{/* System Settings (New) */}
				<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
					<div className="flex justify-between items-center mb-6">
						<h2 className="text-xl font-semibold flex items-center text-gray-800 dark:text-white">
							<HardDrive className="w-5 h-5 mr-2 text-red-500 dark:text-red-400" />
							Límites del Sistema
						</h2>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Tamaño Máximo Archivo (MB)
							</label>
							<input
								type="number"
								min="1"
								max="1000"
								value={settings.max_file_size_mb || 50}
								onChange={(e) =>
									handleChange(
										"max_file_size_mb",
										parseInt(e.target.value),
									)
								}
								className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
							/>
							<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
								Límite "blando" gestionado por regla de negocio.
							</p>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Expiración Token (Ej: 1d, 12h)
							</label>
							<input
								type="text"
								value={settings.jwt_expires_in || "1d"}
								onChange={(e) =>
									setSettings((prev) => ({
										...prev,
										jwt_expires_in: e.target.value,
									}))
								}
								className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
							/>
							<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
								Formato: 1d = 1 día, 12h = 12 horas.
							</p>
						</div>
					</div>
				</div>

				{/* Email Settings */}
				<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
					<div className="flex justify-between items-center mb-6">
						<h2 className="text-xl font-semibold flex items-center text-gray-800 dark:text-white">
							<Mail className="w-5 h-5 mr-2 text-green-500 dark:text-green-400" />
							Configuración de Correo
						</h2>
					</div>

					<div className="space-y-8">
						{/* SMTP (Envío) */}
						<div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-4">
							<div className="flex items-center mb-4">
								<h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
									SMTP (Envío de Correos)
								</h3>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="md:col-span-2">
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Host SMTP
									</label>
									<input
										type="text"
										value={settings.smtp_host || ""}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												smtp_host: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
										placeholder="smtp.gmail.com"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Puerto
									</label>
									<input
										type="text"
										value={settings.smtp_port || "587"}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												smtp_port: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Remitente (From)
									</label>
									<input
										type="text"
										value={settings.email_from || ""}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												email_from: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
										placeholder="noreply@empresa.com"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Usuario
									</label>
									<input
										type="text"
										value={settings.smtp_user || ""}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												smtp_user: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Contraseña
									</label>
									<input
										type="password"
										value={settings.smtp_password || ""}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												smtp_password: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
										placeholder="••••••••"
									/>
								</div>
								<div className="flex items-center pt-6">
									<input
										type="checkbox"
										id="smtp_secure"
										checked={
											settings.smtp_secure === "true"
										}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												smtp_secure: e.target.checked
													? "true"
													: "false",
											}))
										}
										className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
									/>
									<label
										htmlFor="smtp_secure"
										className="ml-2 block text-sm text-gray-900 dark:text-gray-300"
									>
										Usar SSL/TLS (Secure)
									</label>
								</div>
							</div>
						</div>

						{/* IMAP (Recepción) */}
						<div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4">
							<div className="flex items-center mb-4">
								<h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
									IMAP (Recepción de Correos)
								</h3>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="md:col-span-2">
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Host IMAP
									</label>
									<input
										type="text"
										value={settings.imap_host || ""}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												imap_host: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
										placeholder="imap.gmail.com"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Puerto
									</label>
									<input
										type="text"
										value={settings.imap_port || "993"}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												imap_port: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
									/>
								</div>
								<div className="hidden md:block"></div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Usuario
									</label>
									<input
										type="text"
										value={settings.imap_user || ""}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												imap_user: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Contraseña
									</label>
									<input
										type="password"
										value={settings.imap_password || ""}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												imap_password: e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
										placeholder="••••••••"
									/>
								</div>
							</div>
						</div>

						{/* Blocked Senders */}
						<div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-4">
							<div className="flex items-center mb-4">
								<h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
									Filtros de Recepción
								</h3>
							</div>
							<div className="grid grid-cols-1 gap-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
										Remitentes Ignorados (Separados por
										coma)
									</label>
									<textarea
										value={
											settings.ignored_email_senders || ""
										}
										onChange={(e) =>
											setSettings((prev) => ({
												...prev,
												ignored_email_senders:
													e.target.value,
											}))
										}
										className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
										placeholder="spam@dominio.com, marketing@spam.com"
										rows={3}
									/>
									<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
										Los correos de estos remitentes no se
										procesarán ni se guardarán, tanto por
										IMAP como en archivos PST.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Ingestion Settings */}
				<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
					<div className="flex justify-between items-center mb-6">
						<h2 className="text-xl font-semibold flex items-center text-gray-800 dark:text-white">
							<Database className="w-5 h-5 mr-2 text-indigo-500 dark:text-indigo-400" />
							Motor de Ingestión y Procesamiento
						</h2>
					</div>

					<div className="space-y-8">
						{/* DOCS Subsection */}
						<div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
							<div className="flex items-center mb-4">
								<FileText className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
								<h3 className="font-medium text-gray-900 dark:text-gray-100">
									Documentos (PDF, DOCX, TXT)
								</h3>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										DOC_Chunk Size ({settings.chunk_size})
									</label>
									<input
										type="range"
										min="100"
										max="2000"
										step="50"
										value={settings.chunk_size}
										onChange={(e) =>
											handleChange(
												"chunk_size",
												parseInt(e.target.value),
											)
										}
										className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
									/>
									<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
										Tamaño del fragmento para documentos
										estándar.
									</p>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										DOC_Chunk Overlap (
										{settings.chunk_overlap})
									</label>
									<input
										type="range"
										min="0"
										max="500"
										step="10"
										value={settings.chunk_overlap}
										onChange={(e) =>
											handleChange(
												"chunk_overlap",
												parseInt(e.target.value),
											)
										}
										className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-500"
									/>
									<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
										Solapamiento para mantener contexto
										entre fragmentos.
									</p>
								</div>
							</div>
						</div>

						{/* PST Subsection */}
						<div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4">
							<div className="flex items-center mb-4">
								<Mail className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
								<h3 className="font-medium text-gray-900 dark:text-gray-100">
									Correos Electrónicos (PST, MSG)
								</h3>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										PST_Chunk Size (
										{settings.pst_chunk_size || 1500})
									</label>
									<input
										type="range"
										min="100"
										max="4000"
										step="50"
										value={settings.pst_chunk_size || 1500}
										onChange={(e) =>
											handleChange(
												"pst_chunk_size",
												parseInt(e.target.value),
											)
										}
										className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-600 dark:accent-orange-500"
									/>
									<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
										Tamaño del fragmento para cuerpos de
										correo.
									</p>
								</div>

								<div>
									<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										PST_Chunk Overlap (
										{settings.pst_chunk_overlap || 300})
									</label>
									<input
										type="range"
										min="0"
										max="1000"
										step="10"
										value={
											settings.pst_chunk_overlap || 300
										}
										onChange={(e) =>
											handleChange(
												"pst_chunk_overlap",
												parseInt(e.target.value),
											)
										}
										className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-600 dark:accent-orange-500"
									/>
									<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
										Solapamiento para correos largos.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Customization Settings */}
				<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
					<h2 className="text-xl font-semibold mb-6 flex items-center text-gray-800 dark:text-white">
						<Sliders className="w-5 h-5 mr-2 text-pink-500 dark:text-pink-400" />
						Personalización
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="md:col-span-2">
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Nombre de la Aplicación
							</label>
							<input
								type="text"
								value={settings.app_name || ""}
								onChange={(e) =>
									setSettings((prev) => ({
										...prev,
										app_name: e.target.value,
									}))
								}
								className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition-all"
								placeholder="Ej: Mi Empresa RAG"
							/>
						</div>

						<div className="md:col-span-2">
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								URL del Frontend
							</label>
							<input
								type="text"
								value={settings.frontend_url || ""}
								onChange={(e) =>
									setSettings((prev) => ({
										...prev,
										frontend_url: e.target.value,
									}))
								}
								className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition-all"
								placeholder="https://mi-plataforma.com"
							/>
							<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
								URL pública del frontend. Se usa en enlaces de
								correo y redirecciones.
							</p>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								URL del Logo (Icono)
							</label>
							<input
								type="text"
								value={settings.app_logo_url || ""}
								onChange={(e) =>
									setSettings((prev) => ({
										...prev,
										app_logo_url: e.target.value,
									}))
								}
								className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition-all"
								placeholder="https://..."
							/>
							<div className="mt-2 flex items-center">
								<span className="text-xs text-gray-500 mr-2">
									Vista previa:
								</span>
								<img
									src={settings.app_logo_url}
									alt="Logo Preview"
									className="w-8 h-8 object-contain rounded bg-gray-100"
									onError={(e) =>
										(e.currentTarget.style.display = "none")
									}
									onLoad={(e) =>
										(e.currentTarget.style.display =
											"block")
									}
								/>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Color del Tema (Hex)
							</label>
							<div className="flex items-center space-x-2">
								<input
									type="color"
									value={settings.theme_color || "#2563eb"}
									onChange={(e) =>
										setSettings((prev) => ({
											...prev,
											theme_color: e.target.value,
										}))
									}
									className="h-10 w-10 rounded cursor-pointer border-0 p-0"
								/>
								<input
									type="text"
									value={settings.theme_color || "#2563eb"}
									onChange={(e) =>
										setSettings((prev) => ({
											...prev,
											theme_color: e.target.value,
										}))
									}
									className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition-all"
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Search Settings */}
				<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors">
					<h2 className="text-xl font-semibold mb-6 flex items-center text-gray-800 dark:text-white">
						<SearchIcon className="w-5 h-5 mr-2 text-primary-500 dark:text-primary-400" />
						Ajustes de Búsqueda
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Máx Resultados ({settings.search_limit})
							</label>
							<input
								type="range"
								min="1"
								max="50"
								value={settings.search_limit}
								onChange={(e) =>
									handleChange(
										"search_limit",
										parseInt(e.target.value),
									)
								}
								className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600 dark:accent-primary-500"
							/>
							<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
								Número de resultados por defecto.
							</p>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Umbral de Similitud ({settings.search_threshold}
								)
							</label>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={settings.search_threshold}
								onChange={(e) =>
									handleChange(
										"search_threshold",
										parseFloat(e.target.value),
									)
								}
								className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600 dark:accent-primary-500"
							/>
							<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
								Puntuación mínima de relevancia (0-1).
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center justify-end pt-4">
					{saved && (
						<span className="text-green-600 dark:text-green-400 font-medium mr-4 animate-fade-in">
							Configuración guardada!
						</span>
					)}
					<Button
						onClick={handleSave}
						disabled={saving}
						isLoading={saving}
					>
						<Save className="w-5 h-5 mr-2" />
						{saving ? "Guardando..." : "Guardar Cambios"}
					</Button>
				</div>
			</div>

			{/* Danger Zone */}
			<div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
				<h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-6">
					Zona de Peligro
				</h2>
				<div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-6 grid md:grid-cols-2 gap-6">
					<div>
						<h3 className="font-semibold text-gray-900 dark:text-white mb-2">
							Reprocesar Documentos
						</h3>
						<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
							Re-ejecutar el proceso de ingestión (chunking y
							embedding) para todos los documentos usando la
							configuración actual.
						</p>
						<ActionButtons />
					</div>
					<div>
						<h3 className="font-semibold text-gray-900 dark:text-white mb-2">
							Borrar Librería Completa
						</h3>
						<p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
							Eliminar permanentemente TODOS los documentos,
							carpetas y vectores. Esta acción es irreversible.
						</p>
						<DeleteButton />
					</div>
				</div>
			</div>
		</div>
	);
}

// Subcomponents for actions to keep main component clean
function ActionButtons() {
	const { startReprocessing } = useActionHooks();
	return (
		<Button
			variant="outline"
			onClick={() => {
				if (
					confirm(
						"¿Reprocesar todo el contenido? Esto puede tardar varios minutos.",
					)
				)
					startReprocessing();
			}}
		>
			Reprocesar Todo
		</Button>
	);
}

function DeleteButton() {
	return (
		<Button
			variant="destructive"
			onClick={async () => {
				if (confirm("¿SEGURO? Esto borrará TODO irreversiblemente.")) {
					try {
						await endpoints.resetLibrary();
						alert("Sistema reseteado correctamente.");
						window.location.reload();
					} catch (e) {
						alert("Error al resetear");
					}
				}
			}}
		>
			Eliminar Todo
		</Button>
	);
}

// Hook helper
// Hook helper
function useActionHooks() {
	const { startReprocessing } = useUpload();
	return { startReprocessing };
}
