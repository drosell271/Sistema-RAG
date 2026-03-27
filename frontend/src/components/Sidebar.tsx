import { NavLink } from "react-router-dom";
import {
	Search as SearchIcon,
	FolderOpen,
	Settings,
	Sun,
	Moon,
	Users,
	LogOut,
	FileText,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

import { useSettings } from "../context/SettingsContext";

export default function Sidebar() {
	const { theme, toggleTheme } = useTheme();
	const { isAdmin, logout, user } = useAuth();
	const { appName, appLogoUrl } = useSettings();

	const navItems = [
		{ to: "/search", icon: SearchIcon, label: "Buscar" },
		{
			to: "/library",
			icon: FolderOpen,
			label: "Biblioteca",
			adminOnly: true,
		},
		{ to: "/users", icon: Users, label: "Usuarios", adminOnly: true },
		{
			to: "/settings",
			icon: Settings,
			label: "Administración",
			adminOnly: true,
		},
		{
			to: "/logs",
			icon: FileText,
			label: "Logs",
			adminOnly: true,
		},
	];

	const visibleNavItems = navItems.filter(
		(item) => !item.adminOnly || isAdmin,
	);

	return (
		<div className="h-screen w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-colors duration-300">
			{/* Logo */}
			<div className="p-6 flex items-center space-x-3">
				{appLogoUrl ? (
					<img
						src={appLogoUrl}
						alt="Logo"
						className="w-10 h-10 object-contain rounded-xl"
						onError={(e) => {
							e.currentTarget.onerror = null;
							e.currentTarget.src = ""; // Clear src to trigger fallback
							e.currentTarget.style.display = "none";
						}}
					/>
				) : (
					<div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-md shadow-primary-600/20 flex-shrink-0">
						<span className="text-white font-bold text-xl">R</span>
					</div>
				)}
				<span className="text-xl font-bold text-gray-900 dark:text-white truncate">
					{appName}
				</span>
			</div>

			{/* User Info */}
			<div className="px-6 mb-4">
				<div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
					<p className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">
						{user?.name || "Usuario"}
					</p>
					<p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-bold">
						{user?.role || "Standard"}
					</p>
				</div>
			</div>

			{/* Navigation */}
			<nav className="flex-1 px-4 space-y-1">
				{visibleNavItems.map((item) => (
					<NavLink
						key={item.to}
						to={item.to}
						className={({ isActive }) =>
							`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
								isActive
									? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium"
									: "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
							}`
						}
					>
						<item.icon className="w-5 h-5" />
						<span>{item.label}</span>
					</NavLink>
				))}
			</nav>

			{/* Footer Actions */}
			<div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-4">
				{/* Theme Toggle */}
				<button
					onClick={toggleTheme}
					className="w-full flex items-center justify-center space-x-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
				>
					{theme === "light" ? (
						<>
							<Moon className="w-4 h-4" />
							<span className="text-sm">Modo Oscuro</span>
						</>
					) : (
						<>
							<Sun className="w-4 h-4" />
							<span className="text-sm">Modo Claro</span>
						</>
					)}
				</button>

				<button
					onClick={logout}
					className="w-full flex items-center justify-center space-x-2 p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
				>
					<LogOut className="w-4 h-4" />
					<span className="text-sm font-medium">Cerrar Sesión</span>
				</button>
			</div>
		</div>
	);
}
