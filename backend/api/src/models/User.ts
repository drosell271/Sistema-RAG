import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
	name: string;
	lastname: string;
	email: string;
	password_hash: string;
	role: string;
	group_ids: string[];
	created_at: Date;
}

const UserSchema: Schema = new Schema({
	name: { type: String, required: true },
	lastname: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	password_hash: { type: String, required: true },
	role: { type: String, default: "standard" },
	group_ids: [{ type: String }],
	created_at: { type: Date, default: Date.now },
});

export default mongoose.model<IUser>("User", UserSchema);
