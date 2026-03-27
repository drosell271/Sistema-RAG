import mongoose, { Schema, Document } from "mongoose";

export interface IGroup extends Document {
	name: string;
	description?: string;
	color: string;
	created_at: Date;
}

const GroupSchema: Schema = new Schema({
	name: { type: String, required: true, unique: true },
	description: { type: String },
	color: { type: String, default: "#3b82f6" }, // Blue default
	created_at: { type: Date, default: Date.now },
});

export default mongoose.model<IGroup>("Group", GroupSchema);
