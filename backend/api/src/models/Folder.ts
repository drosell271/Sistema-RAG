import mongoose, { Schema, Document } from "mongoose";

export interface IFolder extends Document {
	name: string;
	parent_id?: string;
	created_at: Date;
	is_public: boolean;
	allowed_group_ids: string[];
}

const FolderSchema: Schema = new Schema(
	{
		name: { type: String, required: true },
		parent_id: {
			type: Schema.Types.ObjectId,
			ref: "Folder",
			default: null,
		},
		created_at: { type: Date, default: Date.now },
		is_public: { type: Boolean, default: false },
		allowed_group_ids: [{ type: String }],
	},
	{
		toJSON: {
			virtuals: true,
			versionKey: false,
			transform: function (doc, ret: any) {
				ret.id = ret._id;
				delete ret._id;
			},
		},
		toObject: { virtuals: true },
	},
);

export default mongoose.model<IFolder>("Folder", FolderSchema);
