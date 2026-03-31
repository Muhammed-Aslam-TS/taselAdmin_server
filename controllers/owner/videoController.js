import VideoProduct from "../../model/VideoProduct.js";
import { processBase64Video, deleteFromFirebase } from "../../middlewares/base64Convert.js";
import { getOwnerId } from "../../middlewares/getOwnerId.js";

/**
 * Get all videos for the current owner.
 */
export const getVideos = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const videos = await VideoProduct.find({ ownerId })
            .populate('productId', 'title basePrice images variants productType')
            .sort({ order: "asc" });
            
        res.status(200).json({ success: true, data: videos });
    } catch (error) {
        console.error("Error fetching videos:", error);
        res.status(500).json({ success: false, message: "Failed to fetch videos." });
    }
};

/**
 * Get active videos for the public store.
 */
export const getStoreVideos = async (req, res) => {
    try {
        const ownerId = getOwnerId(req);
        if (!ownerId) {
            return res.status(404).json({ success: false, message: "Store not found." });
        }
        
        const videos = await VideoProduct.find({ ownerId, isActive: true })
            .populate('productId', 'title basePrice images variants productType')
            .sort({ order: "asc" });
            
        res.status(200).json({ success: true, data: videos });
    } catch (error) {
        console.error("Error fetching store videos:", error);
        res.status(500).json({ success: false, message: "Failed to fetch videos." });
    }
};

/**
 * Create a new VideoProduct.
 */
export const createVideo = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { productId, video, videoLink, isActive, autoplay } = req.body;

        if (!productId || (!video && !videoLink)) {
            return res.status(400).json({ success: false, message: "Product and video are required." });
        }

        let videoUrl = videoLink; // Default to link if provided

        if (video && video.startsWith('data:video')) {
            videoUrl = await processBase64Video(video);
            if (!videoUrl) {
                return res.status(400).json({ success: false, message: "Invalid video data." });
            }
        } else if (!videoUrl) {
            return res.status(400).json({ success: false, message: "Invalid video data." });
        }

        const videoCount = await VideoProduct.countDocuments({ ownerId });

        const newVideo = new VideoProduct({
            ownerId,
            productId,
            videoUrl,
            isActive: isActive !== undefined ? isActive : true,
            autoplay: autoplay !== undefined ? autoplay : true,
            order: videoCount
        });

        await newVideo.save();
        res.status(201).json({ success: true, data: newVideo, message: "Video uploaded successfully." });
    } catch (error) {
        console.error("Error creating video:", error);
        res.status(500).json({ success: false, message: "Failed to upload video." });
    }
};

/**
 * Update video details.
 */
export const updateVideo = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { id } = req.params;
        const updateData = { ...req.body };

        if (updateData.video && updateData.video.startsWith('data:video')) {
            const videoUrl = await processBase64Video(updateData.video);
            if (videoUrl) {
                // Delete old video if it exists
                const existingVideo = await VideoProduct.findOne({ _id: id, ownerId });
                if (existingVideo && existingVideo.videoUrl) {
                    await deleteFromFirebase(existingVideo.videoUrl);
                }
                updateData.videoUrl = videoUrl;
            }
            delete updateData.video;
        } else if (updateData.videoLink) {
            const existingVideo = await VideoProduct.findOne({ _id: id, ownerId });
            if (existingVideo && existingVideo.videoUrl) {
                await deleteFromFirebase(existingVideo.videoUrl);
            }
            updateData.videoUrl = updateData.videoLink;
            delete updateData.videoLink;
        }

        const updatedVideo = await VideoProduct.findOneAndUpdate(
            { _id: id, ownerId },
            { $set: updateData },
            { new: true }
        );

        if (!updatedVideo) {
            return res.status(404).json({ success: false, message: "Video not found." });
        }

        res.status(200).json({ success: true, data: updatedVideo, message: "Video updated successfully." });
    } catch (error) {
        console.error("Error updating video:", error);
        res.status(500).json({ success: false, message: "Failed to update video." });
    }
};

/**
 * Delete a video.
 */
export const deleteVideo = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { id } = req.params;

        const deletedVideo = await VideoProduct.findOneAndDelete({ _id: id, ownerId });

        if (!deletedVideo) {
            return res.status(404).json({ success: false, message: "Video not found." });
        }

        // Delete the file from Firebase
        if (deletedVideo.videoUrl) {
            await deleteFromFirebase(deletedVideo.videoUrl);
        }

        res.status(200).json({ success: true, message: "Video deleted successfully." });
    } catch (error) {
        console.error("Error deleting video:", error);
        res.status(500).json({ success: false, message: "Failed to delete video." });
    }
};

/**
 * Update video order.
 */
export const updateVideoOrder = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { orderedIds } = req.body;

        const bulkOps = orderedIds.map((id, index) => ({
            updateOne: {
                filter: { _id: id, ownerId },
                update: { $set: { order: index } }
            }
        }));

        await VideoProduct.bulkWrite(bulkOps);
        res.status(200).json({ success: true, message: "Video order updated successfully." });
    } catch (error) {
        console.error("Error updating video order:", error);
        res.status(500).json({ success: false, message: "Failed to update order." });
    }
};
