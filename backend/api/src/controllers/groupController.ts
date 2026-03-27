import { Request, Response } from "express";
import Group from "../models/Group";

export const getGroups = async (req: Request, res: Response) => {
	try {
		const groups = await Group.find();
		res.json(groups);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const createGroup = async (req: Request, res: Response) => {
	try {
		const { name, description, color } = req.body;
		const group = new Group({
			name,
			description,
			color,
		});
		const savedGroup = await group.save();
		res.json(savedGroup);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const updateGroup = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		const changes = req.body;
		const updatedGroup = await Group.findByIdAndUpdate(id, changes, {
			new: true,
		});
		if (!updatedGroup) {
			return res.status(404).json({ detail: "Group not found" });
		}
		res.json(updatedGroup);
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};

export const deleteGroup = async (req: Request, res: Response) => {
	try {
		const { id } = req.params;
		await Group.findByIdAndDelete(id);
		res.json({ status: "success" });
	} catch (error) {
		res.status(500).json({ detail: "Server Error" });
	}
};
