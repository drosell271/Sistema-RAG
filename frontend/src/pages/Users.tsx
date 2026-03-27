import { useState, useEffect } from "react";
import {
	UserPlus,
	RefreshCw,
	Trash2,
	Edit,
	Shield,
	Plus,
	Check,
} from "lucide-react";
import endpoints from "../services/api";
import type { User, Group, UserCreate, GroupCreate } from "../services/api";
import Button from "../components/ui/Button";

export default function Users() {
	const [activeTab, setActiveTab] = useState<"users" | "groups">("users");

	return (
		<div className="p-6 max-w-6xl mx-auto h-full bg-gray-50 dark:bg-gray-900 transition-colors">
			<h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 flex items-center">
				<Shield className="w-8 h-8 mr-3 text-primary-600 dark:text-primary-400" />
				Gestión de Usuarios y Equipos
			</h1>

			<div className="mb-8 border-b border-gray-200 dark:border-gray-700">
				<div className="flex space-x-8">
					<button
						onClick={() => setActiveTab("users")}
						className={`pb-4 px-2 text-sm font-medium transition-colors border-b-2 ${
							activeTab === "users"
								? "border-primary-600 text-primary-600 dark:text-primary-400"
								: "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
						}`}
					>
						Usuarios
					</button>
					<button
						onClick={() => setActiveTab("groups")}
						className={`pb-4 px-2 text-sm font-medium transition-colors border-b-2 ${
							activeTab === "groups"
								? "border-primary-600 text-primary-600 dark:text-primary-400"
								: "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
						}`}
					>
						Equipos
					</button>
				</div>
			</div>

			{activeTab === "users" ? <UsersTab /> : <GroupsTab />}
		</div>
	);
}

function UsersTab() {
	const [users, setUsers] = useState<User[]>([]);
	const [groups, setGroups] = useState<Group[]>([]); // needed for dropdowns
	// const [loading, setLoading] = useState(true); // Removed unused
	const [showModal, setShowModal] = useState(false);
	const [editingUser, setEditingUser] = useState<User | null>(null);

	// Form State
	const [newUser, setNewUser] = useState<UserCreate>({
		name: "",
		lastname: "",
		email: "",
		role: "standard",
		group_ids: [],
	});

	const fetchData = async () => {
		try {
			const [u, g] = await Promise.all([
				endpoints.getUsers(),
				endpoints.getGroups(),
			]);
			// Normalize _id to id for consistency
			const normalizedUsers = u.map((user: any) => ({
				...user,
				id: user.id || user._id,
			}));
			const normalizedGroups = g.map((group: any) => ({
				...group,
				id: group.id || group._id,
			}));
			setUsers(normalizedUsers);
			setGroups(normalizedGroups);
		} catch (e) {
			console.error("Failed to load users", e);
		}
	};

	useEffect(() => {
		fetchData();
	}, []);

	const handleSave = async () => {
		try {
			if (editingUser) {
				await endpoints.updateUser(editingUser.id, newUser);
				alert("Usuario actualizado.");
			} else {
				await endpoints.createUser(newUser);
				alert("Usuario creado. Contraseña enviada.");
			}
			setShowModal(false);
			setNewUser({
				name: "",
				lastname: "",
				email: "",
				role: "standard",
				group_ids: [],
			});
			setEditingUser(null);
			fetchData();
		} catch (e: any) {
			console.error("Error saving user", e);
			const detail = e.response?.data?.detail || e.message;
			alert(`Error al guardar usuario: ${JSON.stringify(detail)}`);
		}
	};

	const handleEdit = (user: User) => {
		setEditingUser(user);
		setNewUser({
			name: user.name,
			lastname: user.lastname,
			email: user.email,
			role: user.role || "standard",
			group_ids: user.group_ids || [],
		});
		setShowModal(true);
	};

	const handleDelete = async (id: string) => {
		if (confirm("¿Borrar usuario?")) {
			try {
				await endpoints.deleteUser(id);
				fetchData();
			} catch (e: any) {
				alert("Error al borrar usuario");
			}
		}
	};

	const handleRegeneratePassword = async (id: string) => {
		if (confirm("¿Regenerar contraseña? Se enviará por correo.")) {
			try {
				await endpoints.regeneratePassword(id);
				alert("Nueva contraseña generada.");
			} catch (e: any) {
				alert("Error al regenerar contraseña");
			}
		}
	};

	const toggleGroup = (groupId: string) => {
		if (!groupId) return;
		setNewUser((prev) => {
			const current = prev.group_ids || [];
			if (current.includes(groupId)) {
				return {
					...prev,
					group_ids: current.filter((id) => id !== groupId),
				};
			} else {
				return { ...prev, group_ids: [...current, groupId] };
			}
		});
	};

	return (
		<div>
			<div className="flex justify-end mb-4">
				<Button
					onClick={() => {
						setEditingUser(null);
						setNewUser({
							name: "",
							lastname: "",
							email: "",
							group_ids: [],
						});
						setShowModal(true);
					}}
				>
					<UserPlus className="w-5 h-5 mr-2" />
					Nuevo Usuario
				</Button>
			</div>

			<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
				<table className="w-full text-left">
					<thead className="bg-gray-50 dark:bg-gray-700/50">
						<tr>
							<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
								Nombre
							</th>
							<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
								Email
							</th>
							<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
								Rol
							</th>
							<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
								Grupos
							</th>
							<th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase text-right">
								Acciones
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100 dark:divide-gray-700">
						{users.map((u) => (
							<tr
								key={u.id}
								className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
							>
								<td className="px-6 py-4 dark:text-gray-200 font-medium">
									{u.name} {u.lastname}
								</td>
								<td className="px-6 py-4 text-gray-600 dark:text-gray-400">
									{u.email}
								</td>
								<td className="px-6 py-4">
									<span
										className={`px-2 py-1 text-xs rounded-full font-medium ${u.role === "admin" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}
									>
										{u.role === "admin"
											? "Admin"
											: "Estándar"}
									</span>
								</td>
								<td className="px-6 py-4">
									<div className="flex flex-wrap gap-1">
										{u.group_ids?.map((gid) => {
											const g = groups.find(
												(grp) => grp.id === gid,
											);
											return g ? (
												<span
													key={gid}
													className="px-2 py-0.5 text-xs rounded-full text-white"
													style={{
														backgroundColor:
															g.color,
													}}
												>
													{g.name}
												</span>
											) : null;
										})}
									</div>
								</td>
								<td className="px-6 py-4 text-right flex justify-end space-x-2">
									<button
										onClick={() =>
											handleRegeneratePassword(u.id)
										}
										className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
										title="Regenerar Contraseña"
									>
										<RefreshCw className="w-4 h-4" />
									</button>
									<button
										onClick={() => handleEdit(u)}
										className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
										title="Editar"
									>
										<Edit className="w-4 h-4" />
									</button>
									<button
										onClick={() => handleDelete(u.id)}
										className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
										title="Eliminar"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* CREATE MODAL */}
			{showModal && (
				<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
					<div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
						<h3 className="text-lg font-bold mb-4 dark:text-white">
							{editingUser ? "Editar Usuario" : "Nuevo Usuario"}
						</h3>
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<input
									placeholder="Nombre"
									className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
									value={newUser.name}
									onChange={(e) =>
										setNewUser({
											...newUser,
											name: e.target.value,
										})
									}
								/>
								<input
									placeholder="Apellidos"
									className="p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
									value={newUser.lastname}
									onChange={(e) =>
										setNewUser({
											...newUser,
											lastname: e.target.value,
										})
									}
								/>
							</div>
							<input
								placeholder="Email"
								className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
								value={newUser.email}
								onChange={(e) =>
									setNewUser({
										...newUser,
										email: e.target.value,
									})
								}
							/>

							<select
								className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
								value={newUser.role || "standard"}
								onChange={(e) =>
									setNewUser({
										...newUser,
										role: e.target.value,
									})
								}
							>
								<option value="standard">Estándar</option>
								<option value="admin">Administrador</option>
							</select>

							<div>
								<label className="text-sm font-medium dark:text-gray-300 block mb-2">
									Asignar Equipos
								</label>
								<div className="space-y-2 max-h-40 overflow-y-auto border p-2 rounded dark:border-gray-600">
									{groups.map((g: any) => {
										const gid = g.id || g._id;
										if (!gid)
											console.warn(
												"Group missing ID:",
												g,
											);
										return (
											<div
												key={gid}
												onClick={() => toggleGroup(gid)}
												className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
											>
												<div
													className={`w-4 h-4 border rounded flex items-center justify-center ${
														newUser.group_ids?.includes(
															gid,
														)
															? "bg-primary-500 border-primary-500"
															: "border-gray-400"
													}`}
												>
													{newUser.group_ids?.includes(
														gid,
													) && (
														<Check className="w-3 h-3 text-white" />
													)}
												</div>
												<span
													className="text-sm dark:text-gray-300"
													style={{ color: g.color }}
												>
													{g.name}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						</div>
						<div className="flex justify-end mt-6 space-x-3">
							<Button
								variant="secondary"
								onClick={() => setShowModal(false)}
							>
								Cancelar
							</Button>
							<Button onClick={handleSave}>
								{editingUser ? "Guardar" : "Crear"}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function GroupsTab() {
	const [groups, setGroups] = useState<Group[]>([]);
	const [users, setUsers] = useState<User[]>([]); // Need users to manage membership
	// const [loading, setLoading] = useState(true); // Removed unused
	const [showModal, setShowModal] = useState(false);
	const [editingGroup, setEditingGroup] = useState<Group | null>(null);
	const [newGroup, setNewGroup] = useState<GroupCreate>({
		name: "",
		description: "",
		color: "#3B82F6",
	});
	const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

	const fetchData = async () => {
		try {
			const [g, u] = await Promise.all([
				endpoints.getGroups(),
				endpoints.getUsers(),
			]);
			// Normalize _id to id for consistency
			const normalizedGroups = g.map((group: any) => ({
				...group,
				id: group.id || group._id,
			}));
			const normalizedUsers = u.map((user: any) => ({
				...user,
				id: user.id || user._id,
			}));
			setGroups(normalizedGroups);
			setUsers(normalizedUsers);
		} catch (e) {
			console.error("Failed to load groups/users", e);
		}
	};

	useEffect(() => {
		fetchData();
	}, []);

	const handleSave = async () => {
		try {
			let groupId: string;
			if (editingGroup) {
				await endpoints.updateGroup(editingGroup.id, newGroup);
				groupId = editingGroup.id;
			} else {
				const g: any = await endpoints.createGroup(newGroup);
				groupId = g.id || g._id;
				console.log("Created Group:", g, "ID:", groupId);
			}

			// Sync Members
			if (groupId) {
				const currentMembers = users.filter((u) =>
					u.group_ids.includes(groupId),
				);
				const currentMemberIds = currentMembers.map((u) => u.id);

				const toAdd = selectedMemberIds.filter(
					(id) => !currentMemberIds.includes(id),
				);
				const toRemove = currentMemberIds.filter(
					(id) => !selectedMemberIds.includes(id),
				);

				await Promise.all([
					...toAdd.map((uid) =>
						endpoints.addUserToGroup(groupId, uid),
					),
					...toRemove.map((uid) =>
						endpoints.removeUserFromGroup(groupId, uid),
					),
				]);
			}

			setShowModal(false);
			setNewGroup({ name: "", description: "", color: "#3B82F6" });
			setEditingGroup(null);
			setSelectedMemberIds([]);
			fetchData();
		} catch (e: any) {
			alert("Error al guardar grupo.");
		}
	};

	const toggleMember = (userId: string) => {
		setSelectedMemberIds((prev) =>
			prev.includes(userId)
				? prev.filter((id) => id !== userId)
				: [...prev, userId],
		);
	};

	const handleEdit = async (group: Group) => {
		// Refresh data to get latest users
		await fetchData();

		setEditingGroup(group);
		setNewGroup({
			name: group.name,
			description: group.description,
			color: group.color,
		});
		// Pre-select members
		const members = users
			.filter((u) => (u.group_ids || []).includes(group.id))
			.map((u) => u.id);
		setSelectedMemberIds(members);
		setShowModal(true);
	};

	const handleDelete = async (id: string) => {
		if (confirm("¿Borrar grupo?")) {
			await endpoints.deleteGroup(id);
			fetchData();
		}
	};

	const colors = [
		"#EF4444",
		"#F59E0B",
		"#10B981",
		"#3B82F6",
		"#6366F1",
		"#8B5CF6",
		"#EC4899",
		"#6B7280",
	];

	return (
		<div>
			<div className="flex justify-end mb-4">
				<Button
					onClick={() => {
						setEditingGroup(null);
						setNewGroup({
							name: "",
							description: "",
							color: "#3B82F6",
						});
						setSelectedMemberIds([]);
						setShowModal(true);
					}}
					className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200"
				>
					<Plus className="w-5 h-5 mr-2" />
					Nuevo Equipo
				</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{groups.map((g: any) => {
					const gid = g.id || g._id;
					if (!gid) return null;
					return (
						<div
							key={gid}
							className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
						>
							<div className="flex justify-between items-start mb-4">
								<div
									className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
									style={{ backgroundColor: g.color }}
								>
									{g.name.substring(0, 2).toUpperCase()}
								</div>
								<div className="flex space-x-2">
									<button
										onClick={() => handleEdit(g)}
										className="text-gray-400 hover:text-blue-500"
									>
										<Edit className="w-4 h-4" />
									</button>
									<button
										onClick={() => handleDelete(gid)}
										className="text-gray-400 hover:text-red-500"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</div>
							</div>
							<h3 className="font-bold text-lg mb-1 dark:text-white">
								{g.name}
							</h3>
							<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
								{g.description || "Sin descripción"}
							</p>
						</div>
					);
				})}
			</div>

			{/* CREATE MODAL */}
			{showModal && (
				<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
					<div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
						<h3 className="text-lg font-bold mb-4 dark:text-white">
							{editingGroup ? "Editar Equipo" : "Nuevo Equipo"}
						</h3>
						<div className="space-y-4">
							<input
								placeholder="Nombre del Equipo"
								className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
								value={newGroup.name}
								onChange={(e) =>
									setNewGroup({
										...newGroup,
										name: e.target.value,
									})
								}
							/>
							<textarea
								placeholder="Descripción"
								className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
								value={newGroup.description}
								onChange={(e) =>
									setNewGroup({
										...newGroup,
										description: e.target.value,
									})
								}
							/>
							<div>
								<label className="text-sm font-medium dark:text-gray-300 block mb-2">
									Color
								</label>
								<div className="flex flex-wrap gap-2">
									{colors.map((c) => (
										<button
											key={c}
											onClick={() =>
												setNewGroup({
													...newGroup,
													color: c,
												})
											}
											className={`w-8 h-8 rounded-full border-2 transition-transform ${
												newGroup.color === c
													? "scale-110 border-gray-400"
													: "border-transparent"
											}`}
											style={{ backgroundColor: c }}
										/>
									))}
								</div>
							</div>

							<div>
								<label className="text-sm font-medium dark:text-gray-300 block mb-2">
									Miembros
								</label>
								<div className="space-y-2 max-h-40 overflow-y-auto border p-2 rounded dark:border-gray-600">
									{users.map((u: any) => {
										// Avoid null user IDs matching anything
										const uid = u.id || u._id;
										if (!uid) return null;
										return (
											<div
												key={uid}
												onClick={() =>
													toggleMember(uid)
												}
												className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
											>
												<div
													className={`w-4 h-4 border rounded flex items-center justify-center ${
														selectedMemberIds.includes(
															uid,
														)
															? "bg-primary-500 border-primary-500"
															: "border-gray-400"
													}`}
												>
													{selectedMemberIds.includes(
														uid,
													) && (
														<Check className="w-3 h-3 text-white" />
													)}
												</div>
												<span className="text-sm dark:text-gray-300">
													{u.name} {u.lastname} (
													{u.email})
												</span>
											</div>
										);
									})}
								</div>
							</div>
						</div>
						<div className="flex justify-end mt-6 space-x-3">
							<Button
								variant="secondary"
								onClick={() => setShowModal(false)}
							>
								Cancelar
							</Button>
							<Button
								onClick={handleSave}
								className="bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
							>
								{editingGroup ? "Guardar" : "Crear"}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
