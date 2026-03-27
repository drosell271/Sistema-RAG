import mongoose, { Document, Schema } from "mongoose";

export interface ILog extends Document {
	doc_id: string;
	filename: string;
	type: "file" | "pst" | "email";
	status: "pending" | "processing" | "completed" | "failed" | "warning";
	message?: string;
	metadata?: Record<string, any>;
	timestamp: Date;
}

const LogSchema: Schema = new Schema({
	doc_id: { type: String, required: true, index: true },
	filename: { type: String, required: true },
	type: {
		type: String,
		enum: ["file", "pst", "email"],
		required: true,
		index: true,
	},
	status: {
		type: String,
		enum: ["pending", "processing", "completed", "failed", "warning"],
		default: "pending",
		index: true,
	},
	message: { type: String },
	metadata: { type: Schema.Types.Mixed },
	timestamp: { type: Date, default: Date.now, index: true },
});

// TTL Index: expire logs after 30 days automatically
LogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<ILog>("Log", LogSchema);
