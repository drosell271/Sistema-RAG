import mongoose, { Schema, Document } from "mongoose";

export interface IDocument extends Omit<Document, "_id"> {
	_id: string;
	filename: string;
	stored_filename: string;
	folder_id: string | null;
	size: number;
	status: string;
	type: string;
	upload_date: Date;
	metadata: Record<string, any>;
}

const DocumentSchema: Schema = new Schema(
	{
		_id: { type: String, required: true },
		filename: { type: String, required: true },
		stored_filename: { type: String, required: true },
		folder_id: { type: String, default: null },
		size: { type: Number, required: true },
		status: { type: String, default: "Uploaded" },
		type: { type: String, default: "file" },
		upload_date: { type: Date, default: Date.now },
		metadata: { type: Map, of: Schema.Types.Mixed, default: {} },
	},
	{ _id: false },
);

export default mongoose.model<IDocument>("Document", DocumentSchema);
