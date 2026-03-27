import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function MainLayout() {
	return (
		<div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors duration-300">
			<Sidebar />
			<main className="flex-1 overflow-auto transition-all duration-300">
				<Outlet />
			</main>
		</div>
	);
}
