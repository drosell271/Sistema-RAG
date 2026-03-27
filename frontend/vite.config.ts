import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	// Load env file based on `mode` in the current working directory.
	// Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
	const env = loadEnv(mode, process.cwd(), "");

	return {
		plugins: [react(), tailwindcss()],
		server: {
			host: "0.0.0.0", // Listen on all IPv4 addresses
			port: parseInt(
				process.env.FRONTEND_PORT || env.FRONTEND_PORT || "5173",
			),
			strictPort: true,
			watch: {
				usePolling: true, // Needed for Windows Docker file watching
			},
			proxy: {
				"/api": {
					target: "http://backend:8000",
					changeOrigin: true,
					ws: true,
				},
			},
		},
		preview: {
			host: "0.0.0.0",
			port: 80,
			strictPort: true,
			proxy: {
				"/api": {
					target: "http://backend:8000",
					changeOrigin: true,
					ws: true,
				},
			},
		},
	};
});
