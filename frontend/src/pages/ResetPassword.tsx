import { useState } from "react";
import api from "../services/api";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Lock, ArrowLeft, CheckCircle } from "lucide-react";

export default function ResetPassword() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const token = searchParams.get("token");

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");
	const [message, setMessage] = useState("");

	if (!token) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
				<div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
					<p className="text-red-500 mb-4">
						Token inválido o faltante.
					</p>
					<Link
						to="/login"
						className="text-primary-600 hover:underline"
					>
						Ir al Login
					</Link>
				</div>
			</div>
		);
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (password !== confirmPassword) {
			setStatus("error");
			setMessage("Las contraseñas no coinciden.");
			return;
		}

		setStatus("loading");
		setMessage("");
		try {
			await api.resetPassword(token, password);
			setStatus("success");
			setMessage("Contraseña actualizada correctamente.");
			setTimeout(() => {
				navigate("/login");
			}, 3000);
		} catch (error) {
			setStatus("error");
			setMessage("El enlace ha expirado o es inválido.");
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors p-4">
			<div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700">
				<div className="text-center mb-8">
					<div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-600/20">
						<span className="text-white font-bold text-3xl">R</span>
					</div>
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						Nueva Contraseña
					</h1>
					<p className="text-gray-500 dark:text-gray-400 mt-2">
						Introduce tu nueva contraseña
					</p>
				</div>

				{status === "success" ? (
					<div className="text-center space-y-6">
						<div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-4 rounded-xl flex flex-col items-center">
							<CheckCircle className="w-10 h-10 mb-2" />
							<p>{message}</p>
						</div>
						<p className="text-sm text-gray-500">
							Redirigiendo al login...
						</p>
						<Link
							to="/login"
							className="block w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-all text-center"
						>
							Ir al Login ahora
						</Link>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-6">
						{status === "error" && (
							<div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
								{message}
							</div>
						)}

						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Nueva Contraseña
							</label>
							<div className="relative">
								<Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
								<input
									type="password"
									required
									value={password}
									onChange={(e) =>
										setPassword(e.target.value)
									}
									className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
									placeholder="••••••••"
									minLength={6}
								/>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Confirmar Contraseña
							</label>
							<div className="relative">
								<Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
								<input
									type="password"
									required
									value={confirmPassword}
									onChange={(e) =>
										setConfirmPassword(e.target.value)
									}
									className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
									placeholder="••••••••"
								/>
							</div>
						</div>

						<button
							type="submit"
							disabled={status === "loading"}
							className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 transition-all disabled:opacity-50"
						>
							{status === "loading"
								? "Actualizando..."
								: "Cambiar Contraseña"}
						</button>

						<Link
							to="/login"
							className="flex items-center justify-center text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
						>
							<ArrowLeft className="w-4 h-4 mr-2" />
							Volver al Login
						</Link>
					</form>
				)}
			</div>
		</div>
	);
}
