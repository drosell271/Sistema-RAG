import { useEffect, useState } from "react";
import api from "../services/api";
import Button from "../components/ui/Button";
import {
	RefreshCw,
	Trash2,
	Info,
	FileText,
	Mail,
	Database,
	Search as SearchIcon,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";

interface LogEntry {
	_id: string;
	doc_id: string;
	filename: string;
	type: "file" | "pst" | "email";
	status: "pending" | "processing" | "completed" | "failed" | "warning";
	message?: string;
	metadata?: Record<string, any>;
	timestamp: string;
}

const Logs = () => {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [type, setType] = useState("all");
	const [status, setStatus] = useState("all");
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(false);
	const [expandedLog, setExpandedLog] = useState<string | null>(null);

	const fetchLogs = async () => {
		setLoading(true);
		try {
			// @ts-ignore - Dynamic extension of api object
			const res = await api.getLogs(page, 20, type, status, search);
			setLogs(res.data);
			setTotalPages(res.pagination.pages);
		} catch (error) {
			console.error("Failed to fetch logs", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchLogs();
	}, [page, type, status]);

	// Debounce search
	useEffect(() => {
		const timer = setTimeout(() => {
			if (page !== 1) setPage(1);
			else fetchLogs();
		}, 500);
		return () => clearTimeout(timer);
	}, [search]);

	const handleDelete = async (id: string) => {
		if (window.confirm("Are you sure you want to delete this log?")) {
			try {
				// @ts-ignore
				await api.deleteLog(id);
				fetchLogs();
			} catch (error) {
				console.error("Failed to delete log", error);
			}
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "completed":
				return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
			case "processing":
				return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
			case "failed":
				return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
			case "warning":
				return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
		}
	};

	const getTypeIcon = (type: string) => {
		switch (type) {
			case "pst":
				return <Database className="w-4 h-4" />;
			case "email":
				return <Mail className="w-4 h-4" />;
			default:
				return <FileText className="w-4 h-4" />;
		}
	};

	return (
		<div className="p-6 max-w-7xl mx-auto">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
					System Logs
				</h1>
				<Button
					onClick={fetchLogs}
					disabled={loading}
					variant="primary"
					size="icon"
					title="Refresh Logs"
				>
					<RefreshCw
						className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
					/>
				</Button>
			</div>

			{/* Filters */}
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6 flex flex-wrap gap-4 items-center">
				<div className="relative flex-1 min-w-[200px]">
					<SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
					<input
						type="text"
						placeholder="Search filename, ID, message..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
					/>
				</div>

				<select
					value={type}
					onChange={(e) => setType(e.target.value)}
					className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
				>
					<option value="all">All Types</option>
					<option value="file">File</option>
					<option value="pst">PST</option>
					<option value="email">Email</option>
				</select>

				<select
					value={status}
					onChange={(e) => setStatus(e.target.value)}
					className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
				>
					<option value="all">All Status</option>
					<option value="processing">Processing</option>
					<option value="completed">Completed</option>
					<option value="failed">Failed</option>
				</select>
			</div>

			{/* Table */}
			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
							<tr>
								<th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">
									Timestamp
								</th>
								<th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">
									Type
								</th>
								<th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">
									Filename / ID
								</th>
								<th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">
									Status
								</th>
								<th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400">
									Message
								</th>
								<th className="px-6 py-4 font-medium text-gray-500 dark:text-gray-400 text-right">
									Actions
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-gray-700">
							{logs.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
									>
										No logs found.
									</td>
								</tr>
							) : (
								logs.map((log) => (
									<tr
										key={log._id}
										className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
									>
										<td className="px-6 py-4 text-gray-900 dark:text-white whitespace-nowrap">
											{new Date(
												log.timestamp,
											).toLocaleString()}
										</td>
										<td className="px-6 py-4">
											<div className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 capitalize">
												{getTypeIcon(log.type)}
												<span>{log.type}</span>
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="flex flex-col">
												<span className="font-medium text-gray-900 dark:text-white truncate max-w-xs">
													{log.filename}
												</span>
												<span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[150px]">
													{log.doc_id}
												</span>
											</div>
										</td>
										<td className="px-6 py-4">
											<span
												className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(
													log.status,
												)}`}
											>
												{log.status}
											</span>
										</td>
										<td className="px-6 py-4">
											<div className="text-gray-700 dark:text-gray-300 max-w-sm truncate">
												{log.message}
											</div>
											{log.metadata &&
												Object.keys(log.metadata)
													.length > 0 && (
													<button
														onClick={() =>
															setExpandedLog(
																expandedLog ===
																	log._id
																	? null
																	: log._id,
															)
														}
														className="text-primary-600 hover:text-primary-700 text-xs mt-1 flex items-center gap-1"
													>
														<Info className="w-3 h-3" />
														{expandedLog === log._id
															? "Hide Details"
															: "Show Details"}
													</button>
												)}
											{expandedLog === log._id && (
												<pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs text-gray-900 dark:text-white overflow-auto max-w-sm border border-gray-200 dark:border-gray-700">
													{JSON.stringify(
														log.metadata,
														null,
														2,
													)}
												</pre>
											)}
										</td>
										<td className="px-6 py-4 text-right">
											<Button
												onClick={() =>
													handleDelete(log._id)
												}
												variant="ghost"
												size="icon"
												className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
												title="Delete Log"
											>
												<Trash2 className="w-4 h-4" />
											</Button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				{/* Pagination */}
				<div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
					<div className="text-sm text-gray-500 dark:text-gray-400">
						Page {page} of {totalPages}
					</div>
					<div className="flex gap-2">
						<Button
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page === 1}
							variant="outline"
							size="icon"
							className="w-8 h-8"
						>
							<ChevronLeft className="w-5 h-5" />
						</Button>
						<Button
							onClick={() =>
								setPage((p) => Math.min(totalPages, p + 1))
							}
							disabled={page === totalPages}
							variant="outline"
							size="icon"
							className="w-8 h-8"
						>
							<ChevronRight className="w-5 h-5" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Logs;
