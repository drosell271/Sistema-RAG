import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface ProtectedRouteProps {
	children: React.ReactNode;
	adminOnly?: boolean;
}

export default function ProtectedRoute({
	children,
	adminOnly = false,
}: ProtectedRouteProps) {
	const { isAuthenticated, isAdmin } = useAuth();
	const location = useLocation();

	if (!isAuthenticated) {
		return <Navigate to="/login" state={{ from: location }} replace />;
	}

	if (adminOnly && !isAdmin) {
		// Redirect standard users to search if they try to access admin pages
		return <Navigate to="/search" replace />;
	}

	return children;
}
