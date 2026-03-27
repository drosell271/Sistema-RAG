import { useUpload } from "../context/UploadContext";
import {
	X,
	Minimize2,
	Loader2,
	CheckCircle2,
	AlertCircle,
	Clock,
	Trash2,
} from "lucide-react";
import Button from "../components/ui/Button";

export default function UploadModal() {
	const {
		tasks,
		isModalOpen,
		isMinimized,
		setIsMinimized,
		setIsModalOpen,
		cancelTask,
		cancelAllTasks,
		retryTask,
		removeTask,
		clearCompleted,
		sessionTotal,
		sessionCompleted,
	} = useUpload();

	if (!isModalOpen || tasks.length === 0) return null;

	const completedCount = tasks.filter((t) => t.status === "completed").length;
	// Use sessionTotal if available and larger than current tasks (to avoid 0/0 glitch if empty start)
	const totalCount = sessionTotal > 0 ? sessionTotal : tasks.length;

	// Calculate progress including removed completed tasks
	const removedCompletedCount = Math.max(
		0,
		sessionCompleted - completedCount,
	);
	const currentSum = tasks.reduce((acc, t) => acc + t.progress, 0);
	const totalSum = currentSum + removedCompletedCount * 100;
	const overallProgress = totalSum / (totalCount || 1);

	const allFinished = tasks.every(
		(t) =>
			t.status === "completed" ||
			t.status === "error" ||
			t.status === "cancelled",
	);

	if (isMinimized) {
		return (
			<div className="fixed bottom-6 right-6 z-50">
				<div
					className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center space-x-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
					onClick={() => setIsMinimized(false)}
				>
					<div className="relative">
						{allFinished ? (
							<CheckCircle2 className="w-6 h-6 text-green-500" />
						) : (
							<Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
						)}
					</div>
					<div className="flex flex-col">
						<span className="text-sm font-medium text-gray-900 dark:text-white">
							{allFinished
								? "Todo Completado"
								: `Procesando ${sessionCompleted}/${totalCount}...`}
						</span>
						{!allFinished && (
							<div className="w-32 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 mt-1.5 overflow-hidden">
								<div
									className="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
									style={{ width: `${overallProgress}%` }}
								/>
							</div>
						)}
					</div>
					{allFinished && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setIsModalOpen(false);
							}}
							className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-gray-400"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] flex flex-col max-h-[80vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden ring-1 ring-black/5">
			{/* Header */}
			<div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
				<h3 className="font-semibold text-gray-800 dark:text-white flex items-center">
					{allFinished ? (
						<CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
					) : (
						<Loader2 className="w-4 h-4 mr-2 text-primary-500 animate-spin" />
					)}
					{allFinished
						? "Completado"
						: `Actividad ${sessionCompleted} de ${totalCount}`}
				</h3>
				<div className="flex items-center space-x-1">
					<button
						onClick={() => setIsMinimized(true)}
						className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
					>
						<Minimize2 className="w-4 h-4" />
					</button>
					{allFinished && (
						<button
							onClick={() => setIsModalOpen(false)}
							className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0 bg-gray-50/50 dark:bg-gray-900/50">
				{tasks.map((task) => (
					<div
						key={task.id}
						className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm flex items-start space-x-3 group"
					>
						<div className="mt-1 flex-shrink-0">
							{task.status === "pending" && (
								<Clock className="w-5 h-5 text-gray-400" />
							)}
							{(task.status === "uploading" ||
								task.status === "processing") && (
								<Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
							)}
							{task.status === "completed" && (
								<CheckCircle2 className="w-5 h-5 text-green-500" />
							)}
							{(task.status === "error" ||
								task.status === "cancelled") && (
								<AlertCircle className="w-5 h-5 text-red-500" />
							)}
						</div>

						<div className="flex-1 min-w-0">
							<div className="flex justify-between items-start mb-1">
								<p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate pr-2">
									{task.name}
								</p>
								<div className="flex-shrink-0">
									{(task.status === "uploading" ||
										task.status === "processing") && (
										<button
											onClick={() => cancelTask(task.id)}
											className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-xs font-medium transition-colors border border-red-200 dark:border-red-800/50"
										>
											Cancelar
										</button>
									)}
									{(task.status === "error" ||
										task.status === "cancelled") &&
										task.type !== "reprocess" && (
											<div className="flex space-x-1">
												<button
													onClick={() =>
														retryTask(task.id)
													}
													className="p-1 text-primary-500 hover:text-primary-700 rounded transition-colors text-xs font-medium"
													title="Reintentar"
												>
													Reintentar
												</button>
												<button
													onClick={() =>
														removeTask(task.id)
													}
													className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
													title="Eliminar"
												>
													<Trash2 className="w-4 h-4" />
												</button>
											</div>
										)}
								</div>
							</div>

							{task.status === "error" ? (
								<p className="text-xs text-red-500">
									{task.error}
								</p>
							) : task.status === "pending" ? (
								<p className="text-xs text-gray-400">
									En espera...
								</p>
							) : (
								<div className="mt-2 flex flex-col gap-1 w-full">
									{/* Upload Bar */}
									{(task.status === "uploading" ||
										task.status === "processing" ||
										task.status === "completed") && (
										<div className="flex items-center gap-2 text-xs w-full">
											<span className="w-12 text-gray-500 dark:text-gray-400 font-medium">
												Subida
											</span>
											<div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
												<div
													className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
													style={{
														width: `${task.uploadProgress}%`,
													}}
												/>
											</div>
											<span className="w-8 text-right text-gray-500 dark:text-gray-400">
												{Math.round(
													task.uploadProgress,
												)}
												%
											</span>
										</div>
									)}

									{/* Processing Bar */}
									{(task.status === "processing" ||
										task.status === "completed") && (
										<div>
											<div className="flex items-center gap-2 text-xs w-full">
												<span className="w-12 text-gray-500 dark:text-gray-400 font-medium">
													Proceso
												</span>
												<div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
													<div
														className={`h-1.5 rounded-full transition-all duration-300 ${task.status === "completed" ? "bg-green-500" : "bg-purple-500"}`}
														style={{
															width: `${task.processingProgress}%`,
														}}
													/>
												</div>
												<span className="w-8 text-right text-gray-500 dark:text-gray-400">
													{Math.round(
														task.processingProgress,
													)}
													%
												</span>
											</div>
											{task.message && (
												<p className="text-[10px] text-gray-400 mt-1 pl-14 truncate">
													{task.message}
												</p>
											)}
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Footer */}
			<div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
				<span className="text-xs text-gray-500 dark:text-gray-400">
					{allFinished
						? "Todo listo"
						: "No cierres la pestaña del navegador"}
				</span>
				<div className="flex items-center space-x-2">
					{!allFinished && (
						<Button
							variant="destructive"
							size="sm"
							onClick={cancelAllTasks}
							className="text-xs px-2 py-1 h-8"
						>
							<X className="w-3 h-3 mr-1" />
							Cancelar Todo
						</Button>
					)}
					{tasks.some(
						(t) =>
							t.status === "completed" ||
							t.status === "cancelled",
					) && (
						<Button
							variant="ghost"
							size="sm"
							onClick={clearCompleted}
							className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 h-8"
						>
							<Trash2 className="w-3 h-3 mr-1" />
							Limpiar completados
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
