import mongoose, { Schema, Document } from "mongoose";

export interface ISettings extends Document {
	key: string;
	value: any;
	description?: string;
}

const SettingsSchema: Schema = new Schema({
	key: { type: String, required: true, unique: true },
	value: { type: Schema.Types.Mixed, required: true },
	description: { type: String },
});

export default mongoose.model<ISettings>("Settings", SettingsSchema);
