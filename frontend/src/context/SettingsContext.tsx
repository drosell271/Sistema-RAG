import {
	createContext,
	useContext,
	useState,
	useEffect,
	type ReactNode,
} from "react";
import endpoints from "../services/api";

interface SettingsContextType {
	appName: string;
	appLogoUrl: string;
	themeColor: string;
	refreshSettings: () => Promise<void>;
	loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
	undefined,
);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
	const [appName, setAppName] = useState("RAG Platform");
	const [appLogoUrl, setAppLogoUrl] = useState(
		"https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
	);
	const [themeColor, setThemeColor] = useState("#2563eb");
	const [loading, setLoading] = useState(true);

	const refreshSettings = async () => {
		try {
			const data = await endpoints.getSettings();
			if (data.app_name) setAppName(data.app_name);
			if (data.app_logo_url) setAppLogoUrl(data.app_logo_url);
			if (data.theme_color) setThemeColor(data.theme_color);

			// Update Document Title
			document.title = data.app_name || "RAG Platform";

			// Apply Theme Color
			if (data.theme_color) {
				document.documentElement.style.setProperty(
					"--color-primary",
					data.theme_color,
				);
			}

			// Update Favicon (Optional, simpler to just assume standard favicon or update link tag)
			const link: HTMLLinkElement | null =
				document.querySelector("link[rel~='icon']");
			if (link && data.app_logo_url) {
				link.href = data.app_logo_url;
			}
		} catch (error) {
			console.error("Failed to load settings", error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		refreshSettings();
	}, []);

	return (
		<SettingsContext.Provider
			value={{
				appName,
				appLogoUrl,
				themeColor,
				refreshSettings,
				loading,
			}}
		>
			{children}
		</SettingsContext.Provider>
	);
};

export const useSettings = () => {
	const context = useContext(SettingsContext);
	if (context === undefined) {
		throw new Error("useSettings must be used within a SettingsProvider");
	}
	return context;
};
