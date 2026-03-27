import { useState } from "react";
import api from "../services/api";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPassword() {
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<
		"idle" | "loading" | "success" | "error"
	>("idle");
	const [message, setMessage] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setStatus("loading");
		setMessage("");
		try {
			await api.forgotPassword(email);
			setStatus("success");
			setMessage(
				"Si el email existe, recibirás instrucciones para restablecer tu contraseña.",
			);
		} catch (error) {
			setStatus("error");
			setMessage(
				"Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.",
			);
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
						Recuperar Contraseña
					</h1>
					<p className="text-gray-500 dark:text-gray-400 mt-2">
						Ingresa tu email para recibir instrucciones
					</p>
				</div>

				{status === "success" ? (
					<div className="text-center space-y-6">
						<div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-4 rounded-xl flex flex-col items-center">
							<CheckCircle className="w-10 h-10 mb-2" />
							<p>{message}</p>
						</div>
						<p className="text-sm text-gray-500">
							Revisa tu bandeja de entrada (y spam).
						</p>
						<Link
							to="/login"
							className="block w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-all text-center"
						>
							Volver al Login
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

						<button
							type="submit"
							disabled={status === "loading"}
							className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 transition-all disabled:opacity-50"
						>
							{status === "loading"
								? "Enviando..."
								: "Enviar enlace"}
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
