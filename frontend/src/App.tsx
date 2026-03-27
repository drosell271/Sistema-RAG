import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Search from "./pages/Search";
import Library from "./pages/Library";
import Administration from "./pages/Administration";
import Logs from "./pages/Logs";
import Users from "./pages/Users";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { UploadProvider } from "./context/UploadContext";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import UploadModal from "./components/UploadModal";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
	return (
		<SettingsProvider>
			<UploadProvider>
				<AuthProvider>
					<BrowserRouter>
						<Routes>
							<Route path="/login" element={<Login />} />
							<Route
								path="/forgot-password"
								element={<ForgotPassword />}
							/>
							<Route
								path="/reset-password"
								element={<ResetPassword />}
							/>

							<Route
								path="/"
								element={
									<ProtectedRoute>
										<MainLayout />
									</ProtectedRoute>
								}
							>
								<Route
									index
									element={<Navigate to="/search" replace />}
								/>

								<Route path="search" element={<Search />} />

								<Route
									path="library"
									element={
										<ProtectedRoute adminOnly>
											<Library />
										</ProtectedRoute>
									}
								/>

								<Route
									path="users"
									element={
										<ProtectedRoute adminOnly>
											<Users />
										</ProtectedRoute>
									}
								/>

								<Route
									path="settings"
									element={
										<ProtectedRoute adminOnly>
											<Administration />
										</ProtectedRoute>
									}
								/>

								<Route
									path="logs"
									element={
										<ProtectedRoute adminOnly>
											<Logs />
										</ProtectedRoute>
									}
								/>

								<Route
									path="logs"
									element={
										<ProtectedRoute adminOnly>
											<Logs />
										</ProtectedRoute>
									}
								/>
							</Route>
						</Routes>
						<UploadModal />
					</BrowserRouter>
				</AuthProvider>
			</UploadProvider>
		</SettingsProvider>
	);
}

export default App;
