import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Lock, Mail } from "lucide-react";

import { useSettings } from "../context/SettingsContext";

export default function Login() {
	const { login } = useAuth();
	const { appName, appLogoUrl } = useSettings();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			await login(email, password);
			navigate("/");
		} catch (e) {
			setError("Email o contraseña incorrectos.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors p-4">
			<div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700">
				<div className="text-center mb-8">
					{appLogoUrl ? (
						<div className="w-24 h-24 mx-auto mb-4 flex items-center justify-center">
							<img
								src={appLogoUrl}
								alt="Logo"
								className="max-w-full max-h-full object-contain drop-shadow-md"
								onError={(e) => {
									e.currentTarget.style.display = "none";
								}}
							/>
						</div>
					) : (
						/* Fallback if no logo is set, but user hates 'R', so maybe nothing or subtle icon? */
						<div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-600/20">
							<span className="text-white font-bold text-3xl">
								{appName?.charAt(0) || "R"}
							</span>
						</div>
					)}
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						{appName || "RAG Pro Platform"}
					</h1>
					<p className="text-gray-500 dark:text-gray-400 mt-2">
						Inicia sesión para continuar
					</p>
				</div>

				{error && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-6">
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Email
						</label>
						<div className="relative">
							<Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
							<input
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
								placeholder="usuario@empresa.com"
							/>
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Contraseña
						</label>
						<div className="relative">
							<Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
							<input
								type="password"
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
								placeholder="••••••••"
							/>
						</div>
						<div className="flex justify-end mt-1">
							<Link
								to="/forgot-password"
								className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
							>
								¿Olvidaste tu contraseña?
							</Link>
						</div>
					</div>

					<button
						type="submit"
						disabled={loading}
						className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 transition-all disabled:opacity-50"
					>
						{loading ? "Iniciando..." : "Ingresar"}
					</button>
				</form>
			</div>
		</div>
	);
}
