import { createContext, useContext, useState, type ReactNode } from "react";
import endpoints, { type User } from "../services/api";

interface AuthContextType {
	user: User | null;
	login: (email: string, pass: string) => Promise<void>;
	logout: () => void;
	isAuthenticated: boolean;
	isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Helper to check token validity (optional, for now just existence)
const getStoredAuth = () => {
	const userStr = localStorage.getItem("rag_user");
	const token = localStorage.getItem("rag_token");
	if (userStr && token) {
		try {
			return { user: JSON.parse(userStr), token };
		} catch (e) {
			return null;
		}
	}
	return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
	// Initialize user state synchronously from localStorage to avoid race condition
	const [user, setUser] = useState<User | null>(() => {
		const stored = getStoredAuth();
		return stored ? stored.user : null;
	});

	const login = async (email: string, pass: string) => {
		const data = await endpoints.login(email, pass);
		const user = data.user;
		const token = data.token || (data as any).access_token;

		if (user && token) {
			setUser(user);
			localStorage.setItem("rag_user", JSON.stringify(user));
			localStorage.setItem("rag_token", token);
		} else {
			console.error("Invalid login response structure:", data);
			throw new Error("Invalid response from server");
		}
	};

	const logout = () => {
		setUser(null);
		localStorage.removeItem("rag_user");
		localStorage.removeItem("rag_token");
		window.location.href = "/login"; // Force redirect
	};

	const isAdmin = user?.role === "admin";

	return (
		<AuthContext.Provider
			value={{ user, login, logout, isAuthenticated: !!user, isAdmin }}
		>
			{children}
		</AuthContext.Provider>
	);
}

export const useAuth = () => useContext(AuthContext);
